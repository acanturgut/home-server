package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

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
	Route             string // "local", node ID
	NodeName          string
	Tier              string
	Reason            string
	ClassifierOutput  string
	ClassifierLatency string
}

type Router struct {
	client *Client
	cfg    *config.Config
	nodes  *config.NodeStore
}

func NewRouter(cfg *config.Config, nodes *config.NodeStore) *Router {
	return &Router{
		client: NewClient(),
		cfg:    cfg,
		nodes:  nodes,
	}
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

func (r *Router) Classify(ctx context.Context, userMessage string) RouteDecision {
	start := time.Now()

	highEnd := r.availableByTier(ctx, config.TierHighEnd)
	lowEnd := r.availableByTier(ctx, config.TierLowEnd)

	// No external nodes → always local
	if len(highEnd) == 0 && len(lowEnd) == 0 {
		logger.Log(logger.Entry{
			Level:   "INFO",
			Route:   "local",
			Tier:    "local",
			Message: "no external nodes available, routing locally",
			Latency: time.Since(start).String(),
		})
		return RouteDecision{Route: "local", Tier: "local", Reason: "no external nodes available", ClassifierOutput: "skipped", ClassifierLatency: time.Since(start).String()}
	}

	resp, err := r.client.CallOllama(ctx, r.cfg.OllamaHost, ChatRequest{
		Model: r.cfg.RouterModel,
		Messages: []Message{
			{Role: "system", Content: classifierSystemPrompt},
			{Role: "user", Content: userMessage},
		},
	})

	classifierLatency := time.Since(start).String()

	if err != nil {
		logger.Log(logger.Entry{
			Level:   "WARN",
			Route:   "fallback",
			Message: fmt.Sprintf("classifier failed: %v", err),
			Latency: classifierLatency,
		})
		d := r.pickBestAvailable(highEnd, lowEnd, "classifier error fallback")
		d.ClassifierOutput = fmt.Sprintf("error: %v", err)
		d.ClassifierLatency = classifierLatency
		return d
	}

	rawOutput := strings.TrimSpace(resp.Message.Content)
	answer := strings.ToUpper(rawOutput)

	logger.Log(logger.Entry{
		Level:   "INFO",
		Message: fmt.Sprintf("classifier response: %q", answer),
		Latency: classifierLatency,
	})

	makeDecision := func(route, nodeName, tier, reason string) RouteDecision {
		return RouteDecision{
			Route: route, NodeName: nodeName, Tier: tier, Reason: reason,
			ClassifierOutput: rawOutput, ClassifierLatency: classifierLatency,
		}
	}

	if strings.Contains(answer, "LOCAL") {
		// Classifier shouldn't say LOCAL, but treat as low-end
		if len(lowEnd) > 0 {
			n := lowEnd[0]
			return makeDecision(n.ID, n.Name, "low-end", "reclassified LOCAL as low-end")
		}
		if len(highEnd) > 0 {
			n := highEnd[0]
			return makeDecision(n.ID, n.Name, "high-end", "reclassified LOCAL, using high-end")
		}
		return makeDecision("local", "", "local", "no nodes available (fallback)")
	}

	isHigh := strings.Contains(answer, "HIGH") || strings.Contains(answer, "COMPLEX") || strings.Contains(answer, "HARD") || strings.Contains(answer, "DIFFICULT")
	isLow := strings.Contains(answer, "LOW") || strings.Contains(answer, "SIMPLE") || strings.Contains(answer, "EASY") || strings.Contains(answer, "BASIC")

	if isHigh {
		if len(highEnd) > 0 {
			n := highEnd[0]
			return makeDecision(n.ID, n.Name, "high-end", "classified as high-end task")
		}
		if len(lowEnd) > 0 {
			n := lowEnd[0]
			return makeDecision(n.ID, n.Name, "low-end", "high-end unavailable, falling back to low-end")
		}
		return makeDecision("local", "", "local", "no nodes available for high-end task (fallback)")
	}

	if isLow {
		if len(lowEnd) > 0 {
			n := lowEnd[0]
			return makeDecision(n.ID, n.Name, "low-end", "classified as low-end task")
		}
		if len(highEnd) > 0 {
			n := highEnd[0]
			return makeDecision(n.ID, n.Name, "high-end", "low-end unavailable, falling back to high-end")
		}
		return makeDecision("local", "", "local", "no nodes available for low-end task (fallback)")
	}

	d := r.pickBestAvailable(highEnd, lowEnd, "unrecognized classifier output")
	d.ClassifierOutput = rawOutput
	d.ClassifierLatency = classifierLatency
	return d
}

func (r *Router) pickBestAvailable(highEnd, lowEnd []config.Node, reason string) RouteDecision {
	if len(highEnd) > 0 {
		n := highEnd[0]
		return RouteDecision{Route: n.ID, NodeName: n.Name, Tier: "high-end", Reason: reason}
	}
	if len(lowEnd) > 0 {
		n := lowEnd[0]
		return RouteDecision{Route: n.ID, NodeName: n.Name, Tier: "low-end", Reason: reason}
	}
	return RouteDecision{Route: "local", Tier: "local", Reason: reason}
}

func (r *Router) availableByTier(ctx context.Context, tier config.Tier) []config.Node {
	var available []config.Node
	for _, node := range r.nodes.ByTier(tier) {
		if r.client.Ping(ctx, node.Host, "lmstudio") {
			available = append(available, node)
		}
	}
	return available
}

func (r *Router) Chat(ctx context.Context, requestID string, messages []Message) (*ChatResponse, error) {
	if len(messages) == 0 {
		return nil, fmt.Errorf("no messages provided")
	}

	lastMsg := messages[len(messages)-1].Content
	decision := r.Classify(ctx, lastMsg)

	// No nodes available → return friendly error
	if decision.Route == "local" {
		logger.Log(logger.Entry{
			Level:     "WARN",
			RequestID: requestID,
			Route:     "none",
			Message:   "no external nodes available: " + decision.Reason,
		})
		return &ChatResponse{
			Message:           Message{Role: "assistant", Content: "Hey, no external nodes are available right now! Add a compute node (machine running LM Studio) in the Nodes tab to start chatting."},
			Node:              "none",
			Tier:              "none",
			Route:             "none",
			Reason:            decision.Reason,
			ClassifierOutput:  decision.ClassifierOutput,
			ClassifierLatency: decision.ClassifierLatency,
		}, nil
	}

	// Prepend system context
	withSystem := append([]Message{{Role: "system", Content: chatSystemPrompt()}}, messages...)

	// Web search if needed
	chatMessages := r.maybeSearch(ctx, withSystem, lastMsg)

	start := time.Now()
	response, err := r.chatNode(ctx, decision.Route, chatMessages)

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
		return &ChatResponse{
			Message:           Message{Role: "assistant", Content: fmt.Sprintf("Node \"%s\" failed to respond. Make sure LM Studio is running and a model is loaded.", decision.NodeName)},
			Node:              decision.NodeName,
			Tier:              decision.Tier,
			Route:             decision.Route,
			Reason:            fmt.Sprintf("node error: %v", err),
			ClassifierOutput:  decision.ClassifierOutput,
			ClassifierLatency: decision.ClassifierLatency,
		}, nil
	}

	response.Latency = latency
	response.Route = decision.Route
	response.Tier = decision.Tier
	response.Node = decision.NodeName
	response.Reason = decision.Reason
	response.ClassifierOutput = decision.ClassifierOutput
	response.ClassifierLatency = decision.ClassifierLatency

	logger.Log(logger.Entry{
		Level:     "INFO",
		RequestID: requestID,
		Route:     decision.Route,
		Tier:      decision.Tier,
		Model:     response.Model,
		Node:      decision.NodeName,
		Message:   fmt.Sprintf("chat completed via %s (%s)", decision.NodeName, decision.Tier),
		Latency:   latency,
	})

	return response, nil
}

func (r *Router) chatNode(ctx context.Context, nodeID string, messages []Message) (*ChatResponse, error) {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return nil, fmt.Errorf("node %s not found", nodeID)
	}

	req := ChatRequest{Messages: messages, Model: node.Model, Temperature: node.Temperature}
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

// maybeSearch performs a web search and injects results into messages if needed.
func (r *Router) maybeSearch(ctx context.Context, messages []Message, lastMsg string) []Message {
	if !search.NeedsSearch(lastMsg) {
		return messages
	}

	results, err := search.DuckDuckGo(ctx, lastMsg, 5)
	if err != nil || len(results) == 0 {
		logger.Info("web search: no results or error: " + fmt.Sprint(err))
		return messages
	}

	logger.Info(fmt.Sprintf("web search: got %d results for %q", len(results), lastMsg))

	context := search.FormatResults(results)
	injected := make([]Message, 0, len(messages)+1)
	injected = append(injected, Message{
		Role:    "system",
		Content: context,
	})
	injected = append(injected, messages...)
	return injected
}

// maybeSearchStream is like maybeSearch but emits a streaming step.
func (r *Router) maybeSearchStream(ctx context.Context, messages []Message, lastMsg string, emit func(StreamEvent)) []Message {
	if !search.NeedsSearch(lastMsg) {
		return messages
	}

	emit(StreamEvent{Step: "searching", Message: "Searching the web…"})

	results, err := search.DuckDuckGo(ctx, lastMsg, 5)
	if err != nil || len(results) == 0 {
		logger.Info("web search: no results or error: " + fmt.Sprint(err))
		emit(StreamEvent{Step: "search_done", Message: "No results found"})
		return messages
	}

	logger.Info(fmt.Sprintf("web search: got %d results for %q", len(results), lastMsg))

	// Build snippet for the UI
	var titles []string
	for _, r := range results {
		titles = append(titles, r.Title)
	}
	emit(StreamEvent{
		Step:    "search_done",
		Message: fmt.Sprintf("Found %d results", len(results)),
		Content: strings.Join(titles, " · "),
	})

	context := search.FormatResults(results)
	injected := make([]Message, 0, len(messages)+1)
	injected = append(injected, Message{
		Role:    "system",
		Content: context,
	})
	injected = append(injected, messages...)
	return injected
}

func (r *Router) ChatStream(ctx context.Context, requestID string, messages []Message, emit func(StreamEvent)) {
	if len(messages) == 0 {
		emit(StreamEvent{Step: "error", Message: "no messages provided"})
		return
	}

	lastMsg := messages[len(messages)-1].Content

	// Step 1: Classifying
	emit(StreamEvent{Step: "classifying", Message: "Analyzing your request with gemma3:1b..."})

	decision := r.Classify(ctx, lastMsg)

	// No nodes available
	if decision.Route == "local" {
		emit(StreamEvent{
			Step:              "error",
			Message:           "No compute nodes available. Add a node running LM Studio in the Nodes tab.",
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
	chatMessages := r.maybeSearchStream(ctx, withSystem, lastMsg, emit)

	// Step 3: Generating
	emit(StreamEvent{
		Step: "generating",
		Node: decision.NodeName,
		Tier: decision.Tier,
	})

	start := time.Now()
	response, err := r.chatNode(ctx, decision.Route, chatMessages)
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
			Step:    "error",
			Message: fmt.Sprintf("Node \"%s\" failed to respond. Make sure LM Studio is running and a model is loaded.", decision.NodeName),
			Node:    decision.NodeName,
			Tier:    decision.Tier,
		})
		return
	}

	logger.Log(logger.Entry{
		Level:     "INFO",
		RequestID: requestID,
		Route:     decision.Route,
		Tier:      decision.Tier,
		Model:     response.Model,
		Node:      decision.NodeName,
		Message:   fmt.Sprintf("chat completed via %s (%s)", decision.NodeName, decision.Tier),
		Latency:   latency,
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

	var nodeStatuses []NodeStatus
	for _, node := range r.nodes.All() {
		nodeStatuses = append(nodeStatuses, NodeStatus{
			ID:     node.ID,
			Name:   node.Name,
			Host:   node.Host,
			Tier:   string(node.Tier),
			GPU:    node.GPU,
			MAC:    node.MAC,
			Model:  node.Model,
			Online: r.client.Ping(ctx, node.Host, "lmstudio"),
		})
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

// GetNodeModelInfo fetches loaded model details from the node.
func (r *Router) GetNodeModelInfo(ctx context.Context, nodeID string) ([]ModelInfo, error) {
	node, ok := r.nodes.Get(nodeID)
	if !ok {
		return nil, fmt.Errorf("node %s not found", nodeID)
	}
	return r.client.GetModelInfo(ctx, node.Host)
}
