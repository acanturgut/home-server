package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/acanturgut/home-server/apps"
)

// ── POST /api/fetch-url ─────────────────────────────────────────────────
//
// Fetches a URL server-side (avoiding CORS) and returns a stripped text
// representation so the chat can include page content as context.
//
// Body: { "url": "https://..." }
// Response: { "url": "...", "title": "...", "text": "...", "fetchedAt": "..." }
func (h *Handler) FetchURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "url required"})
		return
	}
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid url"})
		return
	}
	// SSRF guard: block private and link-local hosts.
	host := strings.ToLower(u.Hostname())
	if host == "" || isBlockedHost(host) {
		writeJSON(w, http.StatusForbidden, errorResp{Error: "host not allowed"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, req.URL, nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	httpReq.Header.Set("User-Agent", "home-server/chat-fetch (+https://github.com/acanturgut/home-server)")
	httpReq.Header.Set("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	title, text := extractText(string(body))
	if len(text) > 80_000 {
		text = text[:80_000] + "\n\n…[truncated]"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url":       req.URL,
		"title":     title,
		"text":      text,
		"fetchedAt": time.Now().UTC().Format(time.RFC3339),
		"status":    resp.StatusCode,
	})
}

func isBlockedHost(host string) bool {
	if host == "localhost" {
		return true
	}
	if strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return true
	}
	// crude IP-literal block (any 10.*, 192.168.*, 127.*, 169.254.*, 172.16-31.*)
	if strings.HasPrefix(host, "10.") || strings.HasPrefix(host, "127.") || strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "169.254.") {
		return true
	}
	if strings.HasPrefix(host, "172.") {
		// 172.16-31.x
		var a, b int
		if _, err := fmt.Sscanf(host, "172.%d.%d.", &a, &b); err == nil && a >= 16 && a <= 31 {
			return true
		}
	}
	return false
}

var (
    tagRe     = regexp.MustCompile(`(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>`)
	stripTag  = regexp.MustCompile(`<[^>]+>`)
	wsRe      = regexp.MustCompile(`[ \t]+`)
	lineRe    = regexp.MustCompile(`\n[ \t]*\n[ \t]*`)
	titleRe   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	entityMap = strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", "\"",
		"&#39;", "'",
		"&nbsp;", " ",
	)
)

func extractText(html string) (string, string) {
	title := ""
	if m := titleRe.FindStringSubmatch(html); len(m) == 2 {
		title = strings.TrimSpace(entityMap.Replace(m[1]))
	}
	stripped := tagRe.ReplaceAllString(html, "")
	stripped = stripTag.ReplaceAllString(stripped, "")
	stripped = entityMap.Replace(stripped)
	stripped = wsRe.ReplaceAllString(stripped, " ")
	stripped = lineRe.ReplaceAllString(stripped, "\n\n")
	return title, strings.TrimSpace(stripped)
}

// ── GET /api/chats ──────────────────────────────────────────────────────
func (h *Handler) ListChats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(h.chats.Get())
}

// ── PUT /api/chats ──────────────────────────────────────────────────────
//
// Replaces the entire chat-sessions blob. The frontend sends the latest array
// after every mutation, mirroring the existing settings/prompts pattern.
func (h *Handler) SaveChats(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 8*1024*1024))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	if err := h.chats.Set(body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── /api/snippets ───────────────────────────────────────────────────────
func (h *Handler) ListSnippets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.snippets.All())
}

func (h *Handler) CreateSnippet(w http.ResponseWriter, r *http.Request) {
	var sn apps.Snippet
	if err := json.NewDecoder(r.Body).Decode(&sn); err != nil || sn.Body == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "body required"})
		return
	}
	if sn.Title == "" {
		t := strings.TrimSpace(sn.Body)
		if len(t) > 60 {
			t = t[:60] + "…"
		}
		sn.Title = t
	}
	out, err := h.snippets.Add(sn)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (h *Handler) DeleteSnippet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "id required"})
		return
	}
	if err := h.snippets.Delete(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
