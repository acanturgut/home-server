package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/apps"
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homekit"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/nodestate"
	"github.com/acanturgut/home-server/wol"
	"github.com/google/uuid"
)

type Handler struct {
	router   *ai.Router
	cfg      *config.Config
	nodes    *config.NodeStore
	ns       *nodestate.Store
	apps     *apps.Store
	pipeline *apps.Pipeline
	aiClient *ai.Client
	sysHist  *sysHistory
	prompts  *apps.PromptStore
	settings *apps.SettingsStore
	chats     *apps.ChatStore
	snippets  *apps.SnippetStore
	rag       *apps.RAGIndex
	schedules *apps.ScheduleStore
	version   string
	started   time.Time
}

func NewHandler(router *ai.Router, cfg *config.Config, nodes *config.NodeStore, ns *nodestate.Store, appStore *apps.Store, pipeline *apps.Pipeline, aiClient *ai.Client, prompts *apps.PromptStore, settings *apps.SettingsStore, version string) *Handler {
	h := &Handler{
		router:    router,
		cfg:       cfg,
		nodes:     nodes,
		ns:        ns,
		apps:      appStore,
		pipeline:  pipeline,
		aiClient:  aiClient,
		prompts:   prompts,
		settings:  settings,
		chats:     apps.NewChatStore(cfg.DataDir),
		snippets:  apps.NewSnippetStore(cfg.DataDir),
		rag:       apps.NewRAGIndex(appStore.AppsDir()),
		schedules: apps.NewScheduleStore(cfg.DataDir),
		version:   version,
		started:   time.Now(),
	}
	h.startScheduler()
	return h
}

// parseAppFilePath extracts app name and file path from URL like /api/apps/{name}/files/{path...}
func parseAppFilePath(urlPath string) (name, filePath string) {
	// URL: /api/apps/{name}/files/{path...}
	const prefix = "/api/apps/"
	rest := strings.TrimPrefix(urlPath, prefix)
	idx := strings.Index(rest, "/files/")
	if idx < 0 {
		return "", ""
	}
	return rest[:idx], rest[idx+len("/files/"):]
}

type chatReq struct {
	Messages    []ai.Message `json:"messages"`
	Route       string       `json:"route,omitempty"`       // ""|"auto"|"light"|"heavy"|<node-name>
	Temperature *float64     `json:"temperature,omitempty"`
}

type errorResp struct {
	Error string `json:"error"`
}

// POST /api/chat
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorResp{Error: "method not allowed"})
		return
	}

	var req chatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}

	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "messages required"})
		return
	}

	requestID := uuid.New().String()
	resp, err := h.router.Chat(r.Context(), requestID, req.Messages)
	if err != nil {
		logger.Error("chat error: " + err.Error())
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "ai request failed"})
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// GET /api/homekit
func (h *Handler) HomeKit(w http.ResponseWriter, r *http.Request) {
	nodes := h.nodes.All()
	var accessories []map[string]any
	for _, n := range nodes {
		if n.MAC == "" {
			continue
		}
		accessories = append(accessories, map[string]any{
			"id":   n.ID,
			"name": n.Name,
			"mac":  n.MAC,
			"host": n.Host,
		})
	}
	pin := h.cfg.HomeKitPIN
	displayPin := pin
	if len(pin) == 8 {
		displayPin = pin[:3] + "-" + pin[3:5] + "-" + pin[5:]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"bridge":      "Home Server",
		"pin":         displayPin,
		"port":        51826,
		"setup_uri":   homekit.SetupURI(h.cfg.HomeKitPIN),
		"accessories": accessories,
	})
}

// GET /api/health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	status := h.router.Status(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"backends": status,
	})
}

// GET /api/logs?n=50
func (h *Handler) Logs(w http.ResponseWriter, r *http.Request) {
	n := 50
	if q := r.URL.Query().Get("n"); q != "" {
		if parsed, err := strconv.Atoi(q); err == nil && parsed > 0 && parsed <= 1000 {
			n = parsed
		}
	}
	entries := logger.Recent(n)
	writeJSON(w, http.StatusOK, entries)
}

// GET /api/nodes
func (h *Handler) GetNodes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.nodes.All())
}

// POST /api/nodes
func (h *Handler) AddNode(w http.ResponseWriter, r *http.Request) {
	var node config.Node
	if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if node.Name == "" || node.Host == "" || node.Tier == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "name, host, and tier are required"})
		return
	}
	if node.Tier != config.TierHighEnd && node.Tier != config.TierLowEnd {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "tier must be 'high-end' or 'low-end'"})
		return
	}
	if node.ID == "" {
		node.ID = uuid.New().String()[:8]
	}
	if err := h.nodes.Add(node); err != nil {
		writeJSON(w, http.StatusConflict, errorResp{Error: "node already exists"})
		return
	}
	logger.Info("node added: " + node.Name + " (" + string(node.Tier) + ") at " + node.Host)
	writeJSON(w, http.StatusCreated, node)
}

// PUT /api/nodes/{id}
func (h *Handler) UpdateNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	var node config.Node
	if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	node.ID = id
	if node.Tier != "" && node.Tier != config.TierHighEnd && node.Tier != config.TierLowEnd {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "tier must be 'high-end' or 'low-end'"})
		return
	}
	if err := h.nodes.Update(node); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	logger.Info("node updated: " + node.Name)
	writeJSON(w, http.StatusOK, node)
}

// DELETE /api/nodes/{id}
func (h *Handler) DeleteNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	if err := h.nodes.Delete(id); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	logger.Info("node deleted: " + id)
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

// POST /api/nodes/{id}/wake
func (h *Handler) WakeNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	node, ok := h.nodes.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	if node.MAC == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node has no MAC address configured"})
		return
	}
	if err := wol.Wake(node.MAC); err != nil {
		logger.Error("WoL failed for " + node.Name + ": " + err.Error())
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "wake failed: " + err.Error()})
		return
	}
	logger.Info("WoL sent to " + node.Name + " (" + node.MAC + ")")
	writeJSON(w, http.StatusOK, map[string]string{"status": "sent", "node": node.Name, "mac": node.MAC})
}

// POST /api/chat/stream
func (h *Handler) ChatStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "streaming not supported"})
		return
	}

	var req chatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "messages required"})
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	requestID := uuid.New().String()

	opts := ai.ChatStreamOpts{Route: req.Route, Temperature: req.Temperature}
	h.router.ChatStream(r.Context(), requestID, req.Messages, opts, func(event ai.StreamEvent) {
		json.NewEncoder(w).Encode(event)
		flusher.Flush()
	})
}

// GET /api/nodes/{id}/models
func (h *Handler) ListNodeModels(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	models, err := h.router.ListNodeModels(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

// POST /api/nodes/{id}/models/load
func (h *Handler) LoadNodeModel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	var req struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "model name required"})
		return
	}
	if err := h.router.LoadNodeModel(r.Context(), id, req.Model); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	logger.Info("model loaded on node " + id + ": " + req.Model)
	writeJSON(w, http.StatusOK, map[string]string{"status": "loaded", "model": req.Model})
}

// POST /api/nodes/{id}/models/unload
func (h *Handler) UnloadNodeModel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	var req struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "model name required"})
		return
	}
	if err := h.router.UnloadNodeModel(r.Context(), id, req.Model); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	logger.Info("model unloaded from node " + id + ": " + req.Model)
	writeJSON(w, http.StatusOK, map[string]string{"status": "unloaded", "model": req.Model})
}

// GET /api/config
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	homekitPin := h.cfg.HomeKitPIN
	if len(homekitPin) > 4 {
		homekitPin = homekitPin[:3] + "···" + homekitPin[len(homekitPin)-2:]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"router_model":     h.cfg.RouterModel,
		"ollama_host":      h.cfg.OllamaHost,
		"version":          h.version,
		"started_at":       h.started.Format(time.RFC3339),
		"uptime_seconds":   int(time.Since(h.started).Seconds()),
		"data_dir":         h.cfg.DataDir,
		"log_dir":          h.cfg.LogDir,
		"port":             h.cfg.Port,
		"anthropic_set":    h.cfg.AnthropicKey != "",
		"homekit_pin":      homekitPin,
		"apps_count":       len(h.apps.All()),
		"nodes_count":      len(h.nodes.All()),
	})
}

// PUT /api/config
func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RouterModel string `json:"router_model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if req.RouterModel != "" {
		h.cfg.RouterModel = req.RouterModel
		logger.Info("router model changed to: " + req.RouterModel)
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"router_model": h.cfg.RouterModel,
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// POST /api/agent/heartbeat
func (h *Handler) AgentHeartbeat(w http.ResponseWriter, r *http.Request) {
	var stats nodestate.Stats
	if err := json.NewDecoder(r.Body).Decode(&stats); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if stats.NodeID == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node_id required"})
		return
	}

	// Try to match the agent's source IP to a configured node.
	// This ensures commands (shutdown etc.) route correctly.
	remoteIP := r.RemoteAddr
	if idx := strings.LastIndex(remoteIP, ":"); idx != -1 {
		remoteIP = remoteIP[:idx]
	}
	remoteIP = strings.Trim(remoteIP, "[]") // strip IPv6 brackets

	if node, ok := h.nodes.ByHost(remoteIP); ok {
		stats.NodeID = node.ID // use config node ID
	}

	cmds := h.ns.Update(stats)
	writeJSON(w, http.StatusOK, map[string]any{
		"commands": cmds,
	})
}

// GET /api/nodes/stats
func (h *Handler) NodeStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.ns.All())
}

// ── Apps Endpoints ───────────────────────────────────────

// GET /api/apps
func (h *Handler) ListApps(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.apps.All())
}

// POST /api/apps/build — kicks off the build pipeline (streamed NDJSON)
func (h *Handler) BuildApp(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "streaming not supported"})
		return
	}

	var req struct {
		Prompt string `json:"prompt"`
		Name   string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "prompt required"})
		return
	}

	// Find available heavy + light nodes
	heavy, light, err := h.findWorkerNodes(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	logger.Info(fmt.Sprintf("apps: build started — prompt=%q name=%q heavy=%s light=%s", req.Prompt, req.Name, heavy.Name, light.Name))

	callLM := func(ctx context.Context, host, model string, messages []map[string]string) (string, error) {
		var aiMsgs []ai.Message
		for _, m := range messages {
			aiMsgs = append(aiMsgs, ai.Message{Role: m["role"], Content: m["content"]})
		}
		resp, err := h.aiClient.CallLMStudio(ctx, host, ai.ChatRequest{Model: model, Messages: aiMsgs})
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", fmt.Errorf("no response from LM Studio")
		}
		return resp.Choices[0].Message.Content, nil
	}

	// Mutex-protected writer to avoid concurrent writes from keepalive + pipeline emit
	var mu sync.Mutex
	writeEvent := func(event apps.PipelineEvent) {
		mu.Lock()
		json.NewEncoder(w).Encode(event)
		flusher.Flush()
		mu.Unlock()
	}

	// Keepalive ticker: send a heartbeat every 15s to prevent connection timeout
	keepalive := time.NewTicker(15 * time.Second)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-keepalive.C:
				writeEvent(apps.PipelineEvent{
					Step:      "keepalive",
					Message:   "",
					Timestamp: time.Now().Format(time.RFC3339),
				})
			case <-done:
				return
			}
		}
	}()

	ctx := h.applyBuildTimeout(r.Context())
	h.pipeline.Build(ctx, req.Prompt, req.Name, heavy, light, callLM, writeEvent)
	keepalive.Stop()
	close(done)
}

// DELETE /api/apps/{name}
func (h *Handler) DeleteApp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "name required"})
		return
	}
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	if err := h.pipeline.Remove(r.Context(), name); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /api/apps/{name}/stop
func (h *Handler) StopApp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := h.pipeline.Stop(r.Context(), name); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// POST /api/apps/{name}/cancel — cancel an active build/rebuild/fix
func (h *Handler) CancelBuild(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if h.pipeline.Cancel(name) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
	} else {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "no active build for this app"})
	}
}

// POST /api/apps/{name}/rebuild — request changes to an existing app (streamed NDJSON)
func (h *Handler) RebuildApp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "streaming not supported"})
		return
	}

	var req struct {
		Changes string `json:"changes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Changes == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "changes required"})
		return
	}

	heavy, light, err := h.findWorkerNodes(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	logger.Info(fmt.Sprintf("apps: rebuild started — app=%s changes=%q", name, req.Changes))

	callLM := func(ctx context.Context, host, model string, messages []map[string]string) (string, error) {
		var aiMsgs []ai.Message
		for _, m := range messages {
			aiMsgs = append(aiMsgs, ai.Message{Role: m["role"], Content: m["content"]})
		}
		resp, err := h.aiClient.CallLMStudio(ctx, host, ai.ChatRequest{Model: model, Messages: aiMsgs})
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", fmt.Errorf("no response from LM Studio")
		}
		return resp.Choices[0].Message.Content, nil
	}

	// Mutex-protected writer to avoid concurrent writes from keepalive + pipeline emit
	var mu sync.Mutex
	writeEvent := func(event apps.PipelineEvent) {
		mu.Lock()
		json.NewEncoder(w).Encode(event)
		flusher.Flush()
		mu.Unlock()
	}

	// Keepalive ticker: send a heartbeat every 15s to prevent connection timeout
	keepalive := time.NewTicker(15 * time.Second)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-keepalive.C:
				writeEvent(apps.PipelineEvent{
					Step:      "keepalive",
					Message:   "",
					Timestamp: time.Now().Format(time.RFC3339),
				})
			case <-done:
				return
			}
		}
	}()

	ctx := h.applyBuildTimeout(r.Context())
	h.pipeline.Rebuild(ctx, name, req.Changes, heavy, light, callLM, writeEvent)
	keepalive.Stop()
	close(done)
}

// FixApp diagnoses errors from container logs and applies fixes.
func (h *Handler) FixApp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}

	// Parse optional description from body
	var req struct {
		Description string `json:"description"`
	}
	json.NewDecoder(r.Body).Decode(&req) // ignore errors — description is optional

	heavy, light, err := h.findWorkerNodes(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "streaming not supported"})
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	logger.Info(fmt.Sprintf("apps: fix started — app=%s desc=%q", name, req.Description))

	callLM := func(ctx context.Context, host, model string, messages []map[string]string) (string, error) {
		var aiMsgs []ai.Message
		for _, m := range messages {
			aiMsgs = append(aiMsgs, ai.Message{Role: m["role"], Content: m["content"]})
		}
		resp, err := h.aiClient.CallLMStudio(ctx, host, ai.ChatRequest{Model: model, Messages: aiMsgs})
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", fmt.Errorf("no response from LM Studio")
		}
		return resp.Choices[0].Message.Content, nil
	}

	var mu sync.Mutex
	writeEvent := func(event apps.PipelineEvent) {
		mu.Lock()
		json.NewEncoder(w).Encode(event)
		flusher.Flush()
		mu.Unlock()
	}

	keepalive := time.NewTicker(15 * time.Second)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-keepalive.C:
				writeEvent(apps.PipelineEvent{Step: "keepalive", Message: "", Timestamp: time.Now().Format(time.RFC3339)})
			case <-done:
				return
			}
		}
	}()

	ctx := h.applyBuildTimeout(r.Context())
	h.pipeline.FixErrors(ctx, name, req.Description, heavy, light, callLM, writeEvent)
	keepalive.Stop()
	close(done)
}

// applyBuildTimeout returns a context that enforces the configured build
// timeout (BuildTimeoutMin) and is detached from the HTTP request, so a client
// disconnect does not abort an in-progress build. Returns the parent unchanged
// when no timeout is configured.
func (h *Handler) applyBuildTimeout(parent context.Context) context.Context {
	if h.settings == nil {
		return parent
	}
	mins := h.settings.Get().BuildTimeoutMin
	if mins <= 0 {
		return parent
	}
	// Detach: use Background as parent so client disconnect does not cancel.
	// The timeout itself bounds the lifetime; we let the timer fire to release
	// resources (the cancel func is also invoked from a goroutine on timeout).
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(mins)*time.Minute)
	go func() {
		<-ctx.Done()
		cancel()
	}()
	return ctx
}

// CrashMonitorDeps returns the dependencies needed by Pipeline.StartCrashMonitor,
// closing over this handler's node discovery and LM Studio client.
func (h *Handler) CrashMonitorDeps() apps.CrashMonitorDeps {
	return apps.CrashMonitorDeps{
		FindWorkers: h.findWorkerNodes,
		CallLM: func(ctx context.Context, host, model string, messages []map[string]string) (string, error) {
			var aiMsgs []ai.Message
			for _, m := range messages {
				aiMsgs = append(aiMsgs, ai.Message{Role: m["role"], Content: m["content"]})
			}
			resp, err := h.aiClient.CallLMStudio(ctx, host, ai.ChatRequest{Model: model, Messages: aiMsgs})
			if err != nil {
				return "", err
			}
			if len(resp.Choices) == 0 {
				return "", fmt.Errorf("no response from LM Studio")
			}
			return resp.Choices[0].Message.Content, nil
		},
	}
}

func (h *Handler) findWorkerNodes(ctx context.Context) (apps.NodeInfo, apps.NodeInfo, error) {
	var heavy, light apps.NodeInfo
	for _, n := range h.nodes.All() {
		if n.Tier == config.TierHighEnd && heavy.Host == "" {
			if h.aiClient.Ping(ctx, n.Host, "lmstudio") {
				heavy = apps.NodeInfo{Name: n.Name, Host: n.Host, Model: n.Model, Tier: "high-end"}
			}
		}
		if n.Tier == config.TierLowEnd && light.Host == "" {
			if h.aiClient.Ping(ctx, n.Host, "lmstudio") {
				light = apps.NodeInfo{Name: n.Name, Host: n.Host, Model: n.Model, Tier: "low-end"}
			}
		}
	}
	if heavy.Host == "" {
		return heavy, light, fmt.Errorf("no high-end (heavy) node available — need RTX 5090 worker online")
	}
	if light.Host == "" {
		// Fall back: use heavy for both
		light = heavy
		light.Tier = "low-end (fallback to heavy)"
	}
	return heavy, light, nil
}

// GET /api/apps/{name}/files — list all project files
func (h *Handler) ListAppFiles(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	projectDir := h.apps.ProjectDir(name)
	var files []map[string]any
	filepath.Walk(projectDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(projectDir, path)
		if rel == "." {
			return nil
		}
		// Skip node_modules, .git
		if info.IsDir() && (info.Name() == "node_modules" || info.Name() == ".git") {
			return filepath.SkipDir
		}
		if !info.IsDir() {
			files = append(files, map[string]any{
				"path": rel,
				"size": info.Size(),
			})
		}
		return nil
	})
	if files == nil {
		files = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, files)
}

// GET /api/apps/{name}/files/{path...} — read a single file
func (h *Handler) GetAppFile(w http.ResponseWriter, r *http.Request) {
	name, filePath := parseAppFilePath(r.URL.Path)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "app name required"})
		return
	}
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	if filePath == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "file path required"})
		return
	}
	// Prevent path traversal
	clean := filepath.Clean(filePath)
	if strings.Contains(clean, "..") {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid path"})
		return
	}
	full := filepath.Join(h.apps.ProjectDir(name), clean)
	data, err := os.ReadFile(full)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "file not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"path":    filePath,
		"content": string(data),
	})
}

// PUT /api/apps/{name}/files/{path...} — write a single file
func (h *Handler) PutAppFile(w http.ResponseWriter, r *http.Request) {
	name, filePath := parseAppFilePath(r.URL.Path)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "app name required"})
		return
	}
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	if filePath == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "file path required"})
		return
	}
	clean := filepath.Clean(filePath)
	if strings.Contains(clean, "..") {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid path"})
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	full := filepath.Join(h.apps.ProjectDir(name), clean)
	os.MkdirAll(filepath.Dir(full), 0755)
	if err := os.WriteFile(full, []byte(req.Content), 0644); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// POST /api/apps/{name}/chat — Copilot-style code assistant for an app.
// Reads the app's source files, builds context, and streams a response from Claude.
func (h *Handler) AppChat(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}

	var req struct {
		Messages    []ai.Message `json:"messages"`
		CurrentFile string       `json:"currentFile"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "messages required"})
		return
	}

	// Read project files for context
	projectDir := h.apps.ProjectDir(name)
	sourceCtx := apps.ReadProjectFilesPublic(projectDir)

	currentFileCtx := ""
	if req.CurrentFile != "" {
		clean := filepath.Clean(req.CurrentFile)
		if !strings.Contains(clean, "..") {
			data, err := os.ReadFile(filepath.Join(projectDir, clean))
			if err == nil {
				currentFileCtx = fmt.Sprintf("\n\nThe user currently has this file open: %s\n```\n%s\n```", req.CurrentFile, string(data))
			}
		}
	}

	systemPrompt := fmt.Sprintf(`You are an expert code assistant embedded in an IDE, working on a web app called "%s".
You have access to all the source files of this app.

%s%s

BEHAVIOR:
- Be concise and direct, like GitHub Copilot Chat
- When the user asks to fix, change, or add something, output the COMPLETE updated file(s) using this format:

### FILE: <relative-path>
`+"`"+"`"+"`"+`
<complete file content>
`+"`"+"`"+"`"+`

- Always output the full file content, not just the diff
- If you need to change multiple files, output each one with its own ### FILE: header
- For questions/explanations, just respond in plain text
- Reference specific line numbers and file names
- Don't explain things the user didn't ask about
- Keep code suggestions practical and working

TECH STACK: Express.js + React 18 + Vite + Tailwind CSS v3 + shadcn/ui patterns (pure Tailwind, no imports)
`, name, sourceCtx, currentFileCtx)

	if h.cfg.AnthropicKey != "" {
		// Use Claude
		resp, err := h.aiClient.CallClaude(r.Context(), h.cfg.AnthropicKey, ai.ClaudeRequest{
			System:   systemPrompt,
			Messages: req.Messages,
		})
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResp{Error: fmt.Sprintf("Claude error: %v", err)})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"response": resp.Text()})
		return
	}

	// Fallback to LM Studio router
	allMessages := append([]ai.Message{{Role: "system", Content: systemPrompt}}, req.Messages...)
	requestID := uuid.New().String()
	resp, err := h.router.Chat(r.Context(), requestID, allMessages)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: fmt.Sprintf("Chat error: %v", err)})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
func (h *Handler) DeployApp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	app, ok := h.apps.Get(name)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}

	flusher, flushOk := w.(http.Flusher)
	if !flushOk {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "streaming not supported"})
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	emit := func(event apps.PipelineEvent) {
		json.NewEncoder(w).Encode(event)
		flusher.Flush()
	}

	h.pipeline.Deploy(r.Context(), name, app.Port, emit)
}

// ProxyApp reverse-proxies requests from /apps/{name}/ to the app's container port.
func (h *Handler) ProxyApp(w http.ResponseWriter, r *http.Request) {
	// Path is /apps/{name}/...
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/apps/"), "/", 2)
	name := parts[0]
	if name == "" {
		http.NotFound(w, r)
		return
	}

	app, ok := h.apps.Get(name)
	if !ok {
		http.Error(w, fmt.Sprintf("App %q not found", name), http.StatusNotFound)
		return
	}
	if app.Status == "failed" {
		http.Error(w, fmt.Sprintf("App %q failed to deploy: %s", name, app.Error), http.StatusServiceUnavailable)
		return
	}
	if app.Status != "running" {
		http.Error(w, fmt.Sprintf("App %q is %s", name, app.Status), http.StatusServiceUnavailable)
		return
	}

	tail := "/"
	if len(parts) > 1 {
		tail += parts[1]
	}
	if r.URL.RawQuery != "" {
		tail += "?" + r.URL.RawQuery
	}

	target := fmt.Sprintf("http://127.0.0.1:%d%s", app.Port, tail)

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	proxyReq.Header = r.Header.Clone()

	resp, err := http.DefaultClient.Do(proxyReq)
	if err != nil {
		// Connection refused — check if container is actually dead
		out, inspErr := exec.Command("docker", "inspect", "-f", "{{.State.Running}}", name).Output()
		if inspErr != nil || strings.TrimSpace(string(out)) != "true" {
			// Container is dead, update status
			logs, _ := exec.Command("docker", "logs", "--tail", "20", name).CombinedOutput()
			app.Status = "failed"
			app.Error = fmt.Sprintf("Container crashed.\n%s", string(logs))
			h.apps.Set(app)
			exec.Command("docker", "rm", "-f", name).Run()
			http.Error(w, fmt.Sprintf("App %q crashed: %s", name, string(logs)), http.StatusBadGateway)
			return
		}
		http.Error(w, fmt.Sprintf("App unreachable: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
		}
		if readErr != nil {
			break
		}
	}
}
