package trader

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/search"
)

// runResearchPass picks up to one in_progress research task whose
// findings are not yet filled, runs a web search, and asks the cheap
// LLM route to summarise the findings as markdown. On success the
// task is moved to "review" so the team sees it next meeting.
//
// We do at most ONE research task per tick to keep latency + token
// budget bounded. Multiple open tasks just get worked through across
// consecutive ticks (FIFO by UpdatedAt).
func (m *Manager) runResearchPass(ctx context.Context) {
	// Snapshot eligible tasks under lock.
	m.mu.Lock()
	var pick *Task
	for i := range m.state.Tasks {
		t := &m.state.Tasks[i]
		if t.Kind != "research" || t.Status != taskStatusInProgress {
			continue
		}
		if t.Findings != nil {
			continue
		}
		if pick == nil || t.UpdatedAt.Before(pick.UpdatedAt) {
			pick = t
		}
	}
	var taskID, query, sym string
	if pick != nil {
		taskID = pick.ID
		query = pick.Title
		if pick.Description != "" {
			query = pick.Title + " " + pick.Description
		}
		sym = pick.Symbol
	}
	m.mu.Unlock()
	if taskID == "" {
		return
	}

	// Web search (DuckDuckGo, best-effort).
	searchQuery := query
	if sym != "" && !strings.Contains(strings.ToLower(searchQuery), strings.ToLower(sym)) {
		searchQuery = sym + " " + searchQuery
	}
	results, searchErr := search.DuckDuckGo(ctx, searchQuery, 5)
	if searchErr != nil {
		log.Printf("trader: research search failed for %s: %v", taskID, searchErr)
	}
	var sourcesBlock strings.Builder
	urls := make([]string, 0, len(results))
	for i, r := range results {
		fmt.Fprintf(&sourcesBlock, "[%d] %s\n    URL: %s\n    %s\n\n",
			i+1, r.Title, r.URL, r.Snippet)
		urls = append(urls, r.URL)
	}

	// LLM summary via the cheap route. Falls back to a stub if no LLM
	// is available — the team still gets the raw sources.
	var summary string
	if m.router != nil {
		// Prefer "fast" route; fall back to anything available.
		nodeID, _, ok := m.router.ResolveRoute(ctx, "fast")
		if !ok {
			nodeID, _, ok = m.router.ResolveRoute(ctx, "heavy")
		}
		if ok {
			temp := 0.3
			sysPrompt := `You are the Research Desk. Given a research
question and a list of web search snippets, produce a tight 4-8
bullet markdown summary of the most useful facts. Cite source numbers
in square brackets like [1], [3]. Be concrete — numbers, dates,
names. No preamble, no conclusion, just bullets. If sources are
sparse or off-topic, say so explicitly.`
			userMsg := fmt.Sprintf("QUESTION: %s\n\nSOURCES:\n%s",
				query, sourcesBlock.String())
			resp, err := m.router.ChatOnNode(ctx, nodeID, []ai.Message{
				{Role: "system", Content: sysPrompt},
				{Role: "user", Content: userMsg},
			}, &temp)
			if err != nil {
				log.Printf("trader: research LLM failed for %s: %v", taskID, err)
			} else {
				summary = strings.TrimSpace(resp.Message.Content)
			}
		}
	}
	if summary == "" {
		// Fallback: bullet-list of source titles.
		if len(results) == 0 {
			summary = "_No web results returned for this query._"
		} else {
			var sb strings.Builder
			sb.WriteString("**Raw sources (no LLM summary available):**\n")
			for i, r := range results {
				fmt.Fprintf(&sb, "- [%d] %s — %s\n", i+1, r.Title, r.Snippet)
			}
			summary = sb.String()
		}
	}

	// Commit findings under lock, move to review.
	m.mu.Lock()
	defer m.mu.Unlock()
	idx := findTask(m.state.Tasks, taskID)
	if idx < 0 {
		return // task was deleted while we were working
	}
	now := time.Now()
	m.state.Tasks[idx].Findings = &TaskFinding{
		Time:    now,
		Summary: summary,
		Sources: urls,
	}
	m.state.Tasks[idx].Status = taskStatusReview
	m.state.Tasks[idx].UpdatedAt = now
	m.state.Tasks[idx].Notes = append(m.state.Tasks[idx].Notes, TaskNote{
		Time: now, Author: "research",
		Text:   fmt.Sprintf("Findings posted (%d sources).", len(urls)),
		Status: taskStatusReview,
	})
	_ = m.store.Save(m.state)
	log.Printf("trader: research desk completed %s (%d sources)", taskID, len(urls))
}
