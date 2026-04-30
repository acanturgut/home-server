package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/apps"
)

// GET /api/apps/{name}/logs?tail=100 — docker logs for an app container
func (h *Handler) AppLogs(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	tail := r.URL.Query().Get("tail")
	if tail == "" {
		tail = "100"
	}
	out, err := exec.Command("docker", "logs", "-t", "--tail", tail, name).CombinedOutput()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"logs": fmt.Sprintf("(no container) %s", string(out))})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"logs": string(out)})
}

// GET /api/apps/{name}/stats — docker container resource usage
func (h *Handler) AppStats(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	out, err := exec.Command("docker", "stats", "--no-stream", "--format",
		`{"cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","mem_pct":"{{.MemPerc}}","net":"{{.NetIO}}","pids":"{{.PIDs}}"}`,
		name).Output()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"cpu": "0%", "mem": "0B / 0B", "mem_pct": "0%", "net": "0B / 0B", "pids": "0",
		})
		return
	}
	var stats map[string]any
	if err := json.Unmarshal(out, &stats); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"raw": string(out)})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// GET /api/apps/{name}/search?q=query — search across all app files
func (h *Handler) AppSearch(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "query required"})
		return
	}
	if len(query) > 200 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "query too long"})
		return
	}

	projectDir := h.apps.ProjectDir(name)
	type match struct {
		File string `json:"file"`
		Line int    `json:"line"`
		Text string `json:"text"`
	}
	var matches []match
	queryLower := strings.ToLower(query)

	filepath.Walk(projectDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && (info.Name() == "node_modules" || info.Name() == ".git" || info.Name() == "dist") {
				return filepath.SkipDir
			}
			return nil
		}
		if info.Size() > 512*1024 { // skip files > 512KB
			return nil
		}
		rel, _ := filepath.Rel(projectDir, path)
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()
		scanner := bufio.NewScanner(f)
		lineNum := 0
		for scanner.Scan() {
			lineNum++
			line := scanner.Text()
			if strings.Contains(strings.ToLower(line), queryLower) {
				text := line
				if len(text) > 200 {
					text = text[:200] + "..."
				}
				matches = append(matches, match{File: rel, Line: lineNum, Text: strings.TrimSpace(text)})
				if len(matches) >= 100 {
					return fmt.Errorf("limit")
				}
			}
		}
		return nil
	})

	if matches == nil {
		matches = []match{}
	}
	writeJSON(w, http.StatusOK, matches)
}

// POST /api/apps/{name}/exec — run a command in the app container
func (h *Handler) AppExec(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if _, ok := h.apps.Get(name); !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	var req struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	cmd := strings.TrimSpace(req.Command)
	if cmd == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "command required"})
		return
	}
	// Security: only allow safe commands
	blocked := []string{"rm -rf /", "mkfs", "dd if=", ":(){ ", "fork"}
	for _, b := range blocked {
		if strings.Contains(cmd, b) {
			writeJSON(w, http.StatusForbidden, errorResp{Error: "command blocked"})
			return
		}
	}

	out, err := exec.Command("docker", "exec", name, "sh", "-c", cmd).CombinedOutput()
	status := "ok"
	if err != nil {
		status = "error"
	}
	// Limit output to 64KB
	output := string(out)
	if len(output) > 65536 {
		output = output[:65536] + "\n... (truncated)"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status, "output": output})
}

// PUT /api/apps/{name}/settings — update app settings
func (h *Handler) AppSettings(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	app, ok := h.apps.Get(name)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "app not found"})
		return
	}
	var req struct {
		Icon  *string `json:"icon,omitempty"`
		Route *string `json:"route,omitempty"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if req.Icon != nil {
		app.Icon = *req.Icon
	}
	if req.Route != nil {
		clean := strings.TrimSpace(*req.Route)
		if clean != "" {
			app.Route = clean
		}
	}
	h.apps.Set(app)
	writeJSON(w, http.StatusOK, app)
}

// GET /api/prompts — return all system prompts
func (h *Handler) GetPrompts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.prompts.Get())
}

// PUT /api/prompts — update system prompts (partial update)
func (h *Handler) UpdatePrompts(w http.ResponseWriter, r *http.Request) {
	var req apps.SystemPrompts
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.prompts.Update(req); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, h.prompts.Get())
}

// POST /api/prompts/reset — reset all prompts to defaults
func (h *Handler) ResetPrompts(w http.ResponseWriter, r *http.Request) {
	if err := h.prompts.Reset(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, h.prompts.Get())
}

// GET /api/settings — return user-editable runtime settings
func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// PUT /api/settings — update settings (partial)
func (h *Handler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req apps.Settings
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.settings.Update(req); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// POST /api/settings/reset — reset settings to defaults
func (h *Handler) ResetSettings(w http.ResponseWriter, r *http.Request) {
	if err := h.settings.Reset(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// GET /api/apps/{name}/events — return the buffered build/rebuild/fix events
// for an app so the wizard can re-attach after a tab switch / page refresh.
// Response: {"active": bool, "events": [PipelineEvent...]}.
func (h *Handler) AppEvents(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "name required"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"active": h.pipeline.IsActive(name),
		"events": h.pipeline.Events(name),
	})
}

// POST /api/apps/clarify — generate AI clarifying questions for a build prompt.
// Request:  {"prompt": "..."}
// Response: {"summary": "...", "questions": [{id, question, hint, suggestions, required}]}
func (h *Handler) ClarifyApp(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "prompt required"})
		return
	}

	tmpl := h.prompts.Get().Clarify
	system := strings.ReplaceAll(tmpl, "{{prompt}}", req.Prompt)
	userMsg := "Generate the clarifying questions now. Output JSON only."

	// 4 minutes — LM Studio cold-load + 6–9 typed JSON questions easily exceeds
	// 60s on slower workers. The wizard streams a spinner so it's fine to wait.
	ctx, cancel := contextWithTimeout(r.Context(), 240)
	defer cancel()

	raw, err := h.runClarifyLLM(ctx, system, userMsg)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: "clarify failed: " + err.Error()})
		return
	}

	parsed, perr := parseClarifyJSON(raw)
	if perr != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"summary":   "",
			"questions": []any{},
			"raw":       raw,
			"parse_err": perr.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, parsed)
}

// POST /api/apps/refine — rewrite a raw user prompt into a clearer app brief.
// Request:  {"prompt": "..."}
// Response: {"refined": "...", "summary": "..."}
func (h *Handler) RefinePrompt(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16384)).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "prompt required"})
		return
	}

	tmpl := h.prompts.Get().Refine
	if strings.TrimSpace(tmpl) == "" {
		writeJSON(w, http.StatusOK, map[string]any{"refined": req.Prompt, "summary": ""})
		return
	}
	system := strings.ReplaceAll(tmpl, "{{prompt}}", req.Prompt)
	userMsg := "Rewrite the prompt now. Output JSON only."

	// 4 minutes — same reasoning as ClarifyApp; cold-load can swallow most of
	// the budget before the first token is emitted.
	ctx, cancel := contextWithTimeout(r.Context(), 240)
	defer cancel()

	raw, err := h.runClarifyLLM(ctx, system, userMsg)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: "refine failed: " + err.Error()})
		return
	}
	parsed, perr := parseClarifyJSON(raw)
	if perr != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"refined":   strings.TrimSpace(req.Prompt),
			"summary":   "",
			"raw":       raw,
			"parse_err": perr.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, parsed)
}

// POST /api/apps/plan — break a project brief into ordered, shippable chunks.
// Request:  {"prompt": "..."}
// Response: {"summary": "...", "chunks": [{title, description, files?}]}
func (h *Handler) PlanApp(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16384)).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "prompt required"})
		return
	}
	tmpl := h.prompts.Get().Plan
	if strings.TrimSpace(tmpl) == "" {
		writeJSON(w, http.StatusOK, map[string]any{"summary": "", "chunks": []any{}})
		return
	}
	system := strings.ReplaceAll(tmpl, "{{prompt}}", req.Prompt)
	userMsg := "Generate the project plan now. Output JSON only."

	ctx, cancel := contextWithTimeout(r.Context(), 240)
	defer cancel()

	raw, err := h.runClarifyLLM(ctx, system, userMsg)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: "plan failed: " + err.Error()})
		return
	}
	parsed, perr := parseClarifyJSON(raw)
	if perr != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"summary":   "",
			"chunks":    []any{},
			"raw":       raw,
			"parse_err": perr.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, parsed)
}

// POST /api/apps/architect — produce a high-level architecture sketch
// (stack, models, endpoints, components, notes) for a brief.
func (h *Handler) ArchitectApp(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16384)).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "prompt required"})
		return
	}
	tmpl := h.prompts.Get().Architect
	if strings.TrimSpace(tmpl) == "" {
		writeJSON(w, http.StatusOK, map[string]any{"summary": "", "stack": "", "models": []any{}, "endpoints": []any{}, "components": []any{}, "notes": ""})
		return
	}
	system := strings.ReplaceAll(tmpl, "{{prompt}}", req.Prompt)
	userMsg := "Generate the architecture now. Output JSON only."

	ctx, cancel := contextWithTimeout(r.Context(), 240)
	defer cancel()

	raw, err := h.runClarifyLLM(ctx, system, userMsg)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: "architect failed: " + err.Error()})
		return
	}
	parsed, perr := parseClarifyJSON(raw)
	if perr != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"summary":   "",
			"raw":       raw,
			"parse_err": perr.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, parsed)
}

// runClarifyLLM uses the heavy LM Studio worker node to produce the JSON
// response for the clarify wizard.
func (h *Handler) runClarifyLLM(ctx context.Context, system, user string) (string, error) {
	heavy, _, err := h.findWorkerNodes(ctx)
	if err != nil {
		return "", err
	}
	host := strings.TrimRight(heavy.Host, "/")
	if host == "" {
		return "", fmt.Errorf("no LM Studio host available")
	}
	model := heavy.Model
	if strings.TrimSpace(model) == "" {
		// Node config doesn't pin a model — discover whatever is loaded so
		// LM Studio doesn't 400 with "Multiple models are loaded …".
		discovered, derr := apps.DiscoverModel(host)
		if derr != nil {
			return "", fmt.Errorf("no model available on %s: %v", host, derr)
		}
		model = discovered
	}
	resp, err := h.aiClient.CallLMStudio(ctx, host, ai.ChatRequest{
		Model: model,
		Messages: []ai.Message{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("empty response")
	}
	return resp.Choices[0].Message.Content, nil
}

// parseClarifyJSON extracts the JSON object from the LLM response (tolerates
// stray prose, ```json fences, and reasoning-model <think>...</think> blocks).
func parseClarifyJSON(raw string) (map[string]any, error) {
	s := strings.TrimSpace(raw)

	// Strip <think>...</think> blocks emitted by reasoning models (Qwen3-thinking,
	// DeepSeek-R1, etc.). Some models forget to close the tag — drop everything
	// up to the closing tag if it exists, otherwise drop everything up to the
	// first `{` later.
	for {
		open := strings.Index(s, "<think>")
		if open < 0 {
			break
		}
		close := strings.Index(s[open:], "</think>")
		if close < 0 {
			s = s[:open]
			break
		}
		s = s[:open] + s[open+close+len("</think>"):]
	}
	// Some models stream the chain-of-thought as plain text and only emit a
	// closing </think> before the real answer. Drop everything up to and
	// including the first stray closing tag.
	if idx := strings.Index(s, "</think>"); idx >= 0 {
		s = s[idx+len("</think>"):]
	}
	s = strings.TrimSpace(s)

	// Strip code fences ```json ... ```
	if strings.HasPrefix(s, "```") {
		if i := strings.Index(s, "\n"); i >= 0 {
			s = s[i+1:]
		}
		if j := strings.LastIndex(s, "```"); j >= 0 {
			s = s[:j]
		}
		s = strings.TrimSpace(s)
	}

	// Find the first balanced top-level JSON object — handles models that emit
	// prose before/after, or include a small example object inside their
	// reasoning that should be skipped in favour of the final answer.
	jsonStr := extractBalancedJSON(s)
	if jsonStr == "" {
		return nil, fmt.Errorf("no json object found")
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(jsonStr), &out); err != nil {
		return nil, err
	}

	// Some models nest the questions under a different key; normalize.
	if _, ok := out["questions"]; !ok {
		for _, k := range []string{"clarifying_questions", "clarifyingQuestions", "qs"} {
			if v, ok := out[k]; ok {
				out["questions"] = v
				break
			}
		}
	}
	return out, nil
}

// extractBalancedJSON returns the largest balanced {…} substring in s, or
// empty string if none found. Tracks string literals so braces inside strings
// don't break the scan.
func extractBalancedJSON(s string) string {
	best := ""
	for i := 0; i < len(s); i++ {
		if s[i] != '{' {
			continue
		}
		depth, inStr, esc := 0, false, false
		for j := i; j < len(s); j++ {
			c := s[j]
			if esc {
				esc = false
				continue
			}
			if c == '\\' {
				esc = true
				continue
			}
			if c == '"' {
				inStr = !inStr
				continue
			}
			if inStr {
				continue
			}
			if c == '{' {
				depth++
			} else if c == '}' {
				depth--
				if depth == 0 {
					cand := s[i : j+1]
					if len(cand) > len(best) {
						best = cand
					}
					break
				}
			}
		}
	}
	return best
}

func contextWithTimeout(parent context.Context, seconds int) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, time.Duration(seconds)*time.Second)
}
