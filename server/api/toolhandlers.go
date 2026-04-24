package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// ── POST /api/rag/search ────────────────────────────────────────────────
//
// Body:  { "q": "docker healthcheck", "k": 5 }
// Reply: { "hits": [{ "path": "...", "app": "...", "score": 0.12, "snippet": "..." }, ...] }
func (h *Handler) RAGSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Q string `json:"q"`
		K int    `json:"k"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Q) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "q required"})
		return
	}
	hits, err := h.rag.Search(req.Q, req.K)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hits": hits, "count": len(hits)})
}

// ── GET /api/tools ──────────────────────────────────────────────────────
//
// Returns the tool registry the frontend and LLM can call. Keep this small
// and stable — every tool here must be safe and idempotent.
func (h *Handler) ListTools(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, toolRegistry())
}

type toolSpec struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Args        map[string]any `json:"args"` // arg-name → { type, description }
}

func toolRegistry() []toolSpec {
	return []toolSpec{
		{
			Name:        "ragSearch",
			Description: "Search the indexed app source code. Returns top-k relevant file snippets.",
			Args: map[string]any{
				"q": map[string]string{"type": "string", "description": "natural-language query"},
				"k": map[string]string{"type": "int", "description": "max hits (default 5)"},
			},
		},
		{
			Name:        "listApps",
			Description: "List all deployed apps with status.",
			Args:        map[string]any{},
		},
		{
			Name:        "appStatus",
			Description: "Get status and metadata for a single app by name.",
			Args: map[string]any{
				"name": map[string]string{"type": "string", "description": "app name"},
			},
		},
		{
			Name:        "appLogs",
			Description: "Fetch the last N lines of docker logs for a deployed app.",
			Args: map[string]any{
				"name": map[string]string{"type": "string", "description": "app name"},
				"tail": map[string]string{"type": "int", "description": "lines to return (default 50, max 500)"},
			},
		},
		{
			Name:        "httpGet",
			Description: "Fetch an external URL's text content. Private/loopback addresses are blocked.",
			Args: map[string]any{
				"url": map[string]string{"type": "string", "description": "http(s) URL"},
			},
		},
	}
}

// ── POST /api/tools/run/{name} ──────────────────────────────────────────
//
// Executes a whitelisted tool and returns the raw result. The frontend
// dispatches this when the user clicks "Run" on an assistant-suggested tool.
func (h *Handler) RunTool(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var args map[string]any
	if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
		args = map[string]any{}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	result, err := h.runTool(ctx, name, args)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tool": name, "result": result})
}

func (h *Handler) runTool(ctx context.Context, name string, args map[string]any) (any, error) {
	switch name {
	case "ragSearch":
		q, _ := args["q"].(string)
		if q == "" {
			return nil, fmt.Errorf("q required")
		}
		k := 5
		if v, ok := args["k"].(float64); ok {
			k = int(v)
		}
		return h.rag.Search(q, k)
	case "listApps":
		out := []map[string]any{}
		for _, a := range h.apps.All() {
			out = append(out, map[string]any{
				"name":   a.Name,
				"status": a.Status,
				"port":   a.Port,
				"type":   a.Type,
			})
		}
		return out, nil
	case "appStatus":
		appName, _ := args["name"].(string)
		if appName == "" {
			return nil, fmt.Errorf("name required")
		}
		a, ok := h.apps.Get(appName)
		if !ok {
			return nil, fmt.Errorf("app not found")
		}
		return a, nil
	case "appLogs":
		appName, _ := args["name"].(string)
		if appName == "" {
			return nil, fmt.Errorf("name required")
		}
		tail := 50
		if v, ok := args["tail"].(float64); ok {
			tail = int(v)
		}
		if tail < 1 {
			tail = 50
		}
		if tail > 500 {
			tail = 500
		}
		out, err := exec.CommandContext(ctx, "docker", "logs", "--tail", fmt.Sprintf("%d", tail), appName).CombinedOutput()
		if err != nil {
			return map[string]any{"logs": string(out), "error": err.Error()}, nil
		}
		return map[string]any{"logs": string(out)}, nil
	case "httpGet":
		u, _ := args["url"].(string)
		if u == "" {
			return nil, fmt.Errorf("url required")
		}
		return h.runHTTPGet(ctx, u)
	default:
		return nil, fmt.Errorf("unknown tool %q", name)
	}
}

// runHTTPGet reuses the same SSRF guard as FetchURL.
func (h *Handler) runHTTPGet(ctx context.Context, rawURL string) (any, error) {
	parsedURL, err := parseHTTPURL(rawURL)
	if err != nil {
		return nil, err
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	req.Header.Set("User-Agent", "home-server/tool-httpget")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	title, text := extractText(string(body))
	if len(text) > 20_000 {
		text = text[:20_000] + "\n…[truncated]"
	}
	return map[string]any{
		"url":    parsedURL.String(),
		"title":  title,
		"status": resp.StatusCode,
		"text":   text,
	}, nil
}
