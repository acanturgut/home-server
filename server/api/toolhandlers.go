package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

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
