package ai

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/assistant"
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/search"
)

// chatSystemPrompt returns a system message with current context injected.
func chatSystemPrompt() string {
	now := time.Now()
	return fmt.Sprintf(`You are a helpful AI assistant running on a home server.

Current date and time: %s
Timezone: %s
Day of week: %s

Owner: Ahmet Can Turgut
Location: Stockholm, Sweden

You have access to web search results when they are provided — use them to give accurate, up-to-date answers. Be concise and helpful.`,
		now.Format("January 2, 2006 — 15:04"),
		now.Format("MST"),
		now.Format("Monday"))
}

type RouteDecision struct {
	Route             string // "local" or a node ID
	NodeName          string
	Tier              string
	Reason            string
	ClassifierOutput  string
	ClassifierLatency string
}

// availabilityTTL bounds how stale the node-online snapshot may be; it saves
// pinging every node on every chat message.
const availabilityTTL = 10 * time.Second

type Router struct {
	client   *Client
	cfg      *config.Config
	nodes    *config.NodeStore
	settings *assistant.SettingsStore
	home     HomeController

	availMu   sync.Mutex
	availAt   time.Time
	availHigh []config.Node
	availLow  []config.Node
}

func NewRouter(cfg *config.Config, nodes *config.NodeStore, settings *assistant.SettingsStore, home HomeController) *Router {
	return &Router{
		client:   NewClient(),
		cfg:      cfg,
		nodes:    nodes,
		settings: settings,
		home:     home,
	}
}

// ClassifierModel is the on-device Ollama model used for routing and Quick
// mode: the runtime setting if set, else the ROUTER_MODEL env default.
func (r *Router) ClassifierModel() string {
	if m := r.settings.Get().RouterModel; m != "" {
		return m
	}
	return r.cfg.RouterModel
}

const classifierSystemPrompt = `You are a task classifier. You read a user message and output ONE word.

Your job: decide if a task is simple (LOW-END) or complex (HIGH-END).

== LOW-END examples ==
"hi" → LOW-END
"what time is it" → LOW-END
"translate hello to spanish" → LOW-END
"what is 2+2" → LOW-END
"explain what an API is" → LOW-END
"fix this typo in my code" → LOW-END
"write a hello world in python" → LOW-END
"summarize this paragraph" → LOW-END
"what does this error mean" → LOW-END
"how do I install node.js" → LOW-END

== HIGH-END examples ==
"write a REST API with authentication" → HIGH-END
"refactor this entire file" → HIGH-END
"write a 1000 word essay" → HIGH-END
"build a React component with state management" → HIGH-END
"explain quantum computing in detail with examples" → HIGH-END
"debug this complex algorithm" → HIGH-END
"design a database schema for an e-commerce app" → HIGH-END
"write unit tests for this module" → HIGH-END
"compare 5 frameworks with pros and cons" → HIGH-END
"help me architect a microservices system" → HIGH-END

== Rules ==
- If the answer is short and simple → LOW-END
- If the answer needs many lines, deep thinking, or code → HIGH-END
- If unsure → HIGH-END
- Code generation (more than 10 lines) → always HIGH-END
- Creative writing (stories, essays) → always HIGH-END

OUTPUT EXACTLY ONE WORD: LOW-END or HIGH-END
Do not explain. Do not add anything else. Just the one word.`

// Classify picks a node for userMessage among the online ones. With at most
// two nodes online there is no real choice, so the classifier call is skipped.
func (r *Router) Classify(ctx context.Context, userMessage string, highEnd, lowEnd []config.Node) RouteDecision {
	start := time.Now()
	if len(highEnd) == 0 && len(lowEnd) == 0 {
		return RouteDecision{Route: "local", Tier: "local", Reason: "no external nodes available", ClassifierOutput: "skipped"}
	}
	if len(highEnd)+len(lowEnd) <= 2 {
		d := pickNode(config.TierHighEnd, highEnd, lowEnd, "classifier skipped (≤2 nodes online)")
		d.ClassifierOutput = "skipped"
		return d
	}

	resp, err := r.client.CallOllama(ctx, r.cfg.OllamaHost, ChatRequest{
		Model: r.ClassifierModel(),
		Messages: []Message{
			{Role: "system", Content: classifierSystemPrompt},
			{Role: "user", Content: userMessage},
		},
	})
	latency := time.Since(start).String()
	if err != nil {
		logger.Log(logger.Entry{Level: "WARN", Route: "fallback", Message: fmt.Sprintf("classifier failed: %v", err), Latency: latency})
		d := pickNode(config.TierHighEnd, highEnd, lowEnd, "classifier error fallback")
		d.ClassifierOutput, d.ClassifierLatency = "error: "+err.Error(), latency
		return d
	}

	raw := strings.TrimSpace(resp.Message.Content)
	answer := strings.ToUpper(raw)
	logger.Log(logger.Entry{Level: "INFO", Message: fmt.Sprintf("classifier response: %q", answer), Latency: latency})

	var d RouteDecision
	switch {
	case containsAny(answer, "HIGH", "COMPLEX", "HARD", "DIFFICULT"):
		d = pickNode(config.TierHighEnd, highEnd, lowEnd, "classified as high-end task")
	case containsAny(answer, "LOW", "SIMPLE", "EASY", "BASIC", "LOCAL"):
		d = pickNode(config.TierLowEnd, highEnd, lowEnd, "classified as low-end task")
	default:
		d = pickNode(config.TierHighEnd, highEnd, lowEnd, "unrecognized classifier output")
	}
	d.ClassifierOutput, d.ClassifierLatency = raw, latency
	return d
}

// pickNode returns the first online node of the preferred tier, falling back
// to the other tier, or "local" when none are online.
func pickNode(prefer config.Tier, highEnd, lowEnd []config.Node, reason string) RouteDecision {
	first, second := highEnd, lowEnd
	if prefer == config.TierLowEnd {
		first, second = lowEnd, highEnd
	}
	switch {
	case len(first) > 0:
		n := first[0]
		return RouteDecision{Route: n.ID, NodeName: n.Name, Tier: string(n.Tier), Reason: reason}
	case len(second) > 0:
		n := second[0]
		return RouteDecision{Route: n.ID, NodeName: n.Name, Tier: string(n.Tier), Reason: reason + " (preferred tier offline)"}
	}
	return RouteDecision{Route: "local", Tier: "local", Reason: reason + " (no nodes online)"}
}

// available returns the online nodes per tier, pinging all of them in
// parallel at most once per availabilityTTL.
func (r *Router) available(ctx context.Context) (highEnd, lowEnd []config.Node) {
	r.availMu.Lock()
	defer r.availMu.Unlock()
	if time.Since(r.availAt) < availabilityTTL {
		return r.availHigh, r.availLow
	}
	nodes := r.nodes.All()
	for i, online := range r.pingAll(ctx, nodes) {
		if !online {
			continue
		}
		switch nodes[i].Tier {
		case config.TierHighEnd:
			highEnd = append(highEnd, nodes[i])
		case config.TierLowEnd:
			lowEnd = append(lowEnd, nodes[i])
		}
	}
	r.availAt, r.availHigh, r.availLow = time.Now(), highEnd, lowEnd
	return highEnd, lowEnd
}

func (r *Router) pingAll(ctx context.Context, nodes []config.Node) []bool {
	online := make([]bool, len(nodes))
	var wg sync.WaitGroup
	for i, n := range nodes {
		wg.Go(func() { online[i] = r.client.Ping(ctx, n.Host, "lmstudio") })
	}
	wg.Wait()
	return online
}

// Chat runs the ChatStream pipeline and returns its final reply. Node
// failures come back as a friendly assistant message, not an error.
func (r *Router) Chat(ctx context.Context, requestID string, messages []Message) (*ChatResponse, error) {
	if len(messages) == 0 {
		return nil, fmt.Errorf("no messages provided")
	}
	var last StreamEvent
	r.ChatStream(ctx, requestID, messages, ChatStreamOpts{}, func(ev StreamEvent) {
		if ev.Step == "done" || ev.Step == "error" {
			last = ev
		}
	})
	content := last.Content
	if last.Step == "error" {
		content = last.Message
	}
	return &ChatResponse{
		Model:             last.Model,
		Message:           Message{Role: "assistant", Content: content},
		Node:              last.Node,
		Tier:              last.Tier,
		Route:             last.Route,
		Reason:            last.Reason,
		ClassifierOutput:  last.ClassifierOutput,
		ClassifierLatency: last.ClassifierLatency,
		Latency:           last.Latency,
		PromptTokens:      last.PromptTokens,
		CompletionTokens:  last.CompletionTokens,
		TotalTokens:       last.TotalTokens,
	}, nil
}

func (r *Router) chatNodeOpts(ctx context.Context, nodeID string, messages []Message, temperature *float64) (*ChatResponse, error) {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return nil, fmt.Errorf("node %s not found", nodeID)
	}

	temp := node.Temperature
	if temperature != nil {
		temp = temperature
	}
	req := ChatRequest{Messages: messages, Model: node.Model, Temperature: temp}
	resp, err := r.client.CallLMStudio(ctx, node.Host, req)
	if err != nil {
		// Auto-load model if LM Studio says none loaded
		errStr := err.Error()
		if strings.Contains(errStr, "No models loaded") || strings.Contains(errStr, "model_not_found") {
			modelToLoad := node.Model
			if modelToLoad == "" {
				// Try listing available models and pick the first one
				models, listErr := r.client.ListModels(ctx, node.Host)
				if listErr != nil || len(models) == 0 {
					return nil, fmt.Errorf("no models loaded and none available to auto-load on %s", node.Name)
				}
				modelToLoad = models[0]
			}
			logger.Info(fmt.Sprintf("auto-loading model %q on %s", modelToLoad, node.Name))
			if loadErr := r.client.LoadModel(ctx, node.Host, modelToLoad); loadErr != nil {
				return nil, fmt.Errorf("auto-load failed on %s: %v (original: %v)", node.Name, loadErr, err)
			}
			// Wait briefly for model to be ready, then retry
			time.Sleep(2 * time.Second)
			req.Model = modelToLoad
			resp, err = r.client.CallLMStudio(ctx, node.Host, req)
			if err != nil {
				return nil, fmt.Errorf("retry after auto-load failed: %v", err)
			}
		} else {
			return nil, err
		}
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return &ChatResponse{
		Model:            resp.Model,
		Message:          resp.Choices[0].Message,
		Node:             node.Name,
		Tier:             string(node.Tier),
		PromptTokens:     resp.Usage.PromptTokens,
		CompletionTokens: resp.Usage.CompletionTokens,
		TotalTokens:      resp.Usage.TotalTokens,
	}, nil
}

// maybeSearch runs a web search when the message needs fresh facts and
// prepends the results as a system message, reporting progress via emit.
func (r *Router) maybeSearch(ctx context.Context, messages []Message, lastMsg string, emit func(StreamEvent)) []Message {
	if !search.NeedsSearch(lastMsg) {
		return messages
	}
	emit(StreamEvent{Step: "searching", Message: "Searching the web…"})
	results, err := search.Search(ctx, lastMsg, 5)
	if err != nil || len(results) == 0 {
		logger.Info("web search: no results or error: " + fmt.Sprint(err))
		emit(StreamEvent{Step: "search_done", Message: "No results found"})
		return messages
	}
	logger.Info(fmt.Sprintf("web search: got %d results for %q", len(results), lastMsg))

	titles := make([]string, 0, len(results))
	for _, res := range results {
		titles = append(titles, res.Title)
	}
	emit(StreamEvent{
		Step:    "search_done",
		Message: fmt.Sprintf("Found %d results", len(results)),
		Content: strings.Join(titles, " · "),
	})
	emit(StreamEvent{Step: "searching", Message: "Reading top sources…"})
	results = search.Enrich(ctx, results, 3, 6000)
	return append([]Message{{Role: "system", Content: search.FormatResults(results)}}, messages...)
}

// ChatStreamOpts lets the caller bypass the classifier or pin temperature.
// Route may be: "" (auto), "light", "heavy", or a node name.
type ChatStreamOpts struct {
	Route       string
	Temperature *float64
}

// resolveRouteOverride converts an opt.Route value into a RouteDecision when
// the caller wants to bypass classification. Returns ok=false to fall through
// to the classifier.
func resolveRouteOverride(route string, highEnd, lowEnd []config.Node) (RouteDecision, bool) {
	if route == "" || strings.EqualFold(route, "auto") {
		return RouteDecision{}, false
	}
	lc := strings.ToLower(route)
	// "local" / "ollama" / "pi" → force the on-device ollama backend. Used
	// by the chat panel's "Quick" mode for low-latency simple replies.
	if lc == "local" || lc == "ollama" || lc == "pi" {
		return RouteDecision{Route: "local", Tier: "local", Reason: "forced local ollama by user"}, true
	}
	if len(highEnd)+len(lowEnd) > 0 {
		switch lc {
		case "heavy", "high", "high-end":
			return pickNode(config.TierHighEnd, highEnd, lowEnd, "forced heavy by user"), true
		case "light", "low", "low-end":
			return pickNode(config.TierLowEnd, highEnd, lowEnd, "forced light by user"), true
		}
	}
	// Match by node name or ID (case-insensitive)
	for _, n := range append(append([]config.Node{}, highEnd...), lowEnd...) {
		if strings.EqualFold(n.Name, route) || strings.EqualFold(n.ID, route) {
			return RouteDecision{Route: n.ID, NodeName: n.Name, Tier: string(n.Tier), Reason: "forced node by user"}, true
		}
	}
	return RouteDecision{}, false
}

func (r *Router) ChatStream(ctx context.Context, requestID string, messages []Message, opts ChatStreamOpts, emit func(StreamEvent)) {
	if len(messages) == 0 {
		emit(StreamEvent{Step: "error", Message: "no messages provided"})
		return
	}

	lastMsg := messages[len(messages)-1].Content

	// Home-control short-circuit. If the user message is an explicit device
	// command we can satisfy entirely with a tool call ("turn on the lights"),
	// execute it and return without invoking the LLM.
	if tryHandleHomeIntent(ctx, r.home, lastMsg, emit) {
		return
	}

	highEnd, lowEnd := r.available(ctx)
	var decision RouteDecision
	userForcedLocal := false
	if d, ok := resolveRouteOverride(opts.Route, highEnd, lowEnd); ok {
		decision = d
		userForcedLocal = d.Route == "local"
		emit(StreamEvent{Step: "classifying", Message: "Using user-selected route…"})
	} else {
		// Classify skips the model call with ≤2 nodes online; only announce
		// it when it will really run.
		if len(highEnd)+len(lowEnd) > 2 {
			emit(StreamEvent{Step: "classifying", Message: "Analyzing your request with " + r.ClassifierModel() + "…"})
		}
		decision = r.Classify(ctx, lastMsg, highEnd, lowEnd)
	}

	// Route == "local" can mean two things:
	//   1) User explicitly forced Quick mode → run on the on-device ollama.
	//   2) Classifier had no external nodes → return friendly error.
	if decision.Route == "local" && userForcedLocal {
		emit(StreamEvent{
			Step:   "classified",
			Node:   "ollama (on-device)",
			Tier:   "local",
			Reason: decision.Reason,
		})

		// Quick mode: bare system prompt, skip web search & tools.
		withSystem := append([]Message{{Role: "system", Content: chatSystemPrompt()}}, messages...)

		emit(StreamEvent{Step: "generating", Node: "ollama (on-device)", Tier: "local"})

		start := time.Now()
		resp, err := r.client.CallOllama(ctx, r.cfg.OllamaHost, ChatRequest{
			Model:       r.ClassifierModel(),
			Messages:    withSystem,
			Temperature: opts.Temperature,
		})
		latency := time.Since(start).String()

		if err != nil {
			logger.Log(logger.Entry{
				Level:     "ERROR",
				RequestID: requestID,
				Route:     "local",
				Tier:      "local",
				Message:   fmt.Sprintf("quick chat (ollama) failed: %v", err),
				Latency:   latency,
			})
			emit(StreamEvent{
				Step:    "error",
				Message: fmt.Sprintf("On-device ollama failed: %v", err),
				Node:    "ollama (on-device)",
				Tier:    "local",
			})
			return
		}

		logger.Log(logger.Entry{
			Level:     "INFO",
			RequestID: requestID,
			Route:     "local",
			Tier:      "local",
			Model:     resp.Model,
			Node:      "ollama (on-device)",
			Message:   "quick chat completed via on-device ollama",
			Latency:   latency,
		})

		emit(StreamEvent{
			Step:    "done",
			Content: resp.Message.Content,
			Model:   resp.Model,
			Node:    "ollama (on-device)",
			Tier:    "local",
			Route:   "local",
			Reason:  decision.Reason,
			Latency: latency,
		})
		return
	}

	// No nodes available
	if decision.Route == "local" {
		emit(StreamEvent{
			Step:              "error",
			Message:           "No compute nodes are online. Add or wake a node running LM Studio in Settings → Nodes.",
			Route:             "none",
			Reason:            decision.Reason,
			ClassifierOutput:  decision.ClassifierOutput,
			ClassifierLatency: decision.ClassifierLatency,
		})
		return
	}

	// Step 2: Classified
	emit(StreamEvent{
		Step:              "classified",
		Node:              decision.NodeName,
		Tier:              decision.Tier,
		Reason:            decision.Reason,
		ClassifierOutput:  decision.ClassifierOutput,
		ClassifierLatency: decision.ClassifierLatency,
	})

	// Prepend system context
	withSystem := append([]Message{{Role: "system", Content: chatSystemPrompt()}}, messages...)

	// Step 2.5: Web search if needed
	chatMessages := r.maybeSearch(ctx, withSystem, lastMsg, emit)

	// Step 3: Generating
	emit(StreamEvent{
		Step: "generating",
		Node: decision.NodeName,
		Tier: decision.Tier,
	})

	start := time.Now()
	response, err := r.chatNodeOpts(ctx, decision.Route, chatMessages, opts.Temperature)
	latency := time.Since(start).String()

	if err != nil {
		logger.Log(logger.Entry{
			Level:     "ERROR",
			RequestID: requestID,
			Route:     decision.Route,
			Tier:      decision.Tier,
			Node:      decision.NodeName,
			Message:   fmt.Sprintf("chat failed: %v", err),
			Latency:   latency,
		})
		emit(StreamEvent{
			Step:              "error",
			Message:           fmt.Sprintf("Node %q failed to respond. Make sure LM Studio is running and a model is loaded.", decision.NodeName),
			Node:              decision.NodeName,
			Tier:              decision.Tier,
			Route:             decision.Route,
			Reason:            "node error: " + err.Error(),
			ClassifierOutput:  decision.ClassifierOutput,
			ClassifierLatency: decision.ClassifierLatency,
		})
		return
	}

	logger.Log(logger.Entry{
		Level:            "INFO",
		RequestID:        requestID,
		Route:            decision.Route,
		Tier:             decision.Tier,
		Model:            response.Model,
		Node:             decision.NodeName,
		Message:          fmt.Sprintf("chat completed via %s (%s)", decision.NodeName, decision.Tier),
		Latency:          latency,
		PromptTokens:     response.PromptTokens,
		CompletionTokens: response.CompletionTokens,
		TotalTokens:      response.TotalTokens,
	})

	// Step 4: Done
	emit(StreamEvent{
		Step:              "done",
		Content:           response.Message.Content,
		Model:             response.Model,
		Node:              decision.NodeName,
		Tier:              decision.Tier,
		Route:             decision.Route,
		Reason:            decision.Reason,
		ClassifierOutput:  decision.ClassifierOutput,
		ClassifierLatency: decision.ClassifierLatency,
		Latency:           latency,
		PromptTokens:      response.PromptTokens,
		CompletionTokens:  response.CompletionTokens,
		TotalTokens:       response.TotalTokens,
	})
}

type NodeStatus struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Host   string `json:"host"`
	Tier   string `json:"tier"`
	GPU    string `json:"gpu,omitempty"`
	MAC    string `json:"mac,omitempty"`
	Model  string `json:"model,omitempty"`
	Online bool   `json:"online"`
}

func (r *Router) Status(ctx context.Context) map[string]any {
	ollamaOnline := r.client.Ping(ctx, r.cfg.OllamaHost, "ollama")
	nodes := r.nodes.All()
	online := r.pingAll(ctx, nodes)
	nodeStatuses := make([]NodeStatus, len(nodes))
	for i, node := range nodes {
		nodeStatuses[i] = NodeStatus{
			ID:     node.ID,
			Name:   node.Name,
			Host:   node.Host,
			Tier:   string(node.Tier),
			GPU:    node.GPU,
			MAC:    node.MAC,
			Model:  node.Model,
			Online: online[i],
		}
	}

	return map[string]any{
		"ollama": ollamaOnline,
		"nodes":  nodeStatuses,
	}
}

func (r *Router) ListNodeModels(ctx context.Context, nodeID string) ([]string, error) {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return nil, fmt.Errorf("node %s not found", nodeID)
	}
	return r.client.ListModels(ctx, node.Host)
}

// UnloadNodeModel ejects a model from the node.
func (r *Router) UnloadNodeModel(ctx context.Context, nodeID, model string) error {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return fmt.Errorf("node %s not found", nodeID)
	}
	return r.client.UnloadModel(ctx, node.Host, model)
}

// LoadNodeModel loads a model on the node.
func (r *Router) LoadNodeModel(ctx context.Context, nodeID, model string) error {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return fmt.Errorf("node %s not found", nodeID)
	}
	return r.client.LoadModel(ctx, node.Host, model)
}

// ListAllNodeModels returns every model on the node with its load state.
func (r *Router) ListAllNodeModels(ctx context.Context, nodeID string) ([]ModelStatus, error) {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return nil, fmt.Errorf("node %s not found", nodeID)
	}
	return r.client.ListAllModels(ctx, node.Host)
}
