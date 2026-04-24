package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/apps"
)

// ── POST /api/chat/compare ─────────────────────────────────────────────
//
// Fan out the same conversation to multiple routes in parallel and return
// every reply plus timing info so the frontend can render a side-by-side
// comparison.
//
// Body: { "messages": [...], "routes": ["light","heavy"], "temperature": 0.7 }
// Reply: { "runs": [{ "route":"light", "node":"mac-mini", "text":"...", "ms":412 }, ...] }
func (h *Handler) ChatCompare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Messages    []ai.Message `json:"messages"`
		Routes      []string     `json:"routes"`
		Temperature *float64     `json:"temperature,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "messages required"})
		return
	}
	if len(req.Routes) == 0 {
		req.Routes = []string{"light", "heavy"}
	}
	if len(req.Routes) > 4 {
		req.Routes = req.Routes[:4]
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	type run struct {
		Route string `json:"route"`
		Node  string `json:"node"`
		Text  string `json:"text,omitempty"`
		Ms    int64  `json:"ms"`
		Err   string `json:"error,omitempty"`
	}
	runs := make([]run, len(req.Routes))
	var wg sync.WaitGroup
	for i, route := range req.Routes {
		wg.Add(1)
		go func(i int, route string) {
			defer wg.Done()
			nodeID, nodeName, ok := h.router.ResolveRoute(ctx, route)
			if !ok {
				runs[i] = run{Route: route, Err: "no node available for route"}
				return
			}
			start := time.Now()
			resp, err := h.router.ChatOnNode(ctx, nodeID, req.Messages, req.Temperature)
			elapsed := time.Since(start).Milliseconds()
			if err != nil {
				runs[i] = run{Route: route, Node: nodeName, Ms: elapsed, Err: err.Error()}
				return
			}
			runs[i] = run{Route: route, Node: nodeName, Ms: elapsed, Text: resp.Message.Content}
		}(i, route)
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
}

// ── Schedule CRUD ──────────────────────────────────────────────────────

func (h *Handler) ListSchedules(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.schedules.All())
}

func (h *Handler) UpsertSchedule(w http.ResponseWriter, r *http.Request) {
	var sc apps.Schedule
	if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	out, err := h.schedules.Upsert(sc)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "id required"})
		return
	}
	if err := h.schedules.Delete(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RunScheduleNow executes a schedule immediately (outside of the cron tick).
func (h *Handler) RunScheduleNow(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sc, ok := h.schedules.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "not found"})
		return
	}
	text, err := h.runSchedule(r.Context(), sc)
	if err != nil {
		h.schedules.RecordRun(sc.ID, "", err)
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	h.schedules.RecordRun(sc.ID, text, nil)
	writeJSON(w, http.StatusOK, map[string]any{"id": sc.ID, "text": text})
}

// runSchedule executes a single scheduled prompt and returns the reply text.
func (h *Handler) runSchedule(ctx context.Context, sc apps.Schedule) (string, error) {
	msgs := []ai.Message{{Role: "user", Content: sc.Prompt}}
	var tempPtr *float64
	if sc.Temperature > 0 {
		tempPtr = &sc.Temperature
	}
	route := strings.TrimSpace(sc.Route)
	if route == "" {
		route = "light"
	}
	nodeID, _, ok := h.router.ResolveRoute(ctx, route)
	if !ok {
		return "", fmt.Errorf("no node available for route %q", route)
	}
	resp, err := h.router.ChatOnNode(ctx, nodeID, msgs, tempPtr)
	if err != nil {
		return "", err
	}
	return resp.Message.Content, nil
}

// ── Scheduler loop (started once from main/NewHandler) ─────────────────

func (h *Handler) startScheduler() {
	go func() {
		tick := time.NewTicker(30 * time.Second)
		defer tick.Stop()
		for range tick.C {
			due := h.schedules.Due(time.Now())
			for _, sc := range due {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
				text, err := h.runSchedule(ctx, sc)
				cancel()
				if err != nil {
					h.schedules.RecordRun(sc.ID, "", err)
				} else {
					h.schedules.RecordRun(sc.ID, text, nil)
				}
			}
		}
	}()
}
