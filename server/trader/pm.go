package trader

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// pmOps mirrors the JSON the PM role emits inside its fenced block.
// We keep it permissive: missing fields default to sensible values.
type pmOps struct {
	Create []pmCreate `json:"create"`
	Move   []pmMove   `json:"move"`
	Close  []pmClose  `json:"close"`
}

type pmCreate struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
	AssignedTo  string `json:"assigned_to"`
	Symbol      string `json:"symbol"`
	Priority    string `json:"priority"`
	DueInMin    int    `json:"due_in_min"`
}

type pmMove struct {
	ID       string `json:"id"`
	ToStatus string `json:"to_status"`
	Note     string `json:"note"`
}

type pmClose struct {
	ID      string `json:"id"`
	Outcome string `json:"outcome"`
}

// pmFenceRe extracts the FIRST fenced ```json … ``` block from a PM
// reply. We're lenient about the language tag and surrounding text.
var pmFenceRe = regexp.MustCompile("(?s)```(?:json)?\\s*(\\{.*?\\})\\s*```")

// parsePMOutput pulls the JSON ops block out of the PM's reply. If
// the model forgot the fence, we fall back to the first balanced
// {...} blob. Returns an empty pmOps with no error on a fully prose
// reply (PM can decide to do nothing).
func parsePMOutput(raw string) (pmOps, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return pmOps{}, nil
	}
	var blob string
	if m := pmFenceRe.FindStringSubmatch(raw); len(m) >= 2 {
		blob = m[1]
	} else {
		// Fenceless fallback: find first { and last } and try that.
		start := strings.Index(raw, "{")
		end := strings.LastIndex(raw, "}")
		if start >= 0 && end > start {
			blob = raw[start : end+1]
		}
	}
	if blob == "" {
		return pmOps{}, nil
	}
	var ops pmOps
	if err := json.Unmarshal([]byte(blob), &ops); err != nil {
		return pmOps{}, fmt.Errorf("pm json: %w", err)
	}
	return ops, nil
}

// applyPMOps mutates m.state.Tasks under the manager lock to reflect
// the PM's create/move/close instructions. Caller MUST hold m.mu.
// Invalid entries are silently dropped (we log via appendLog).
func (m *Manager) applyPMOpsLocked(ops pmOps) (created, moved, closed int) {
	now := time.Now()
	// create
	for _, c := range ops.Create {
		title := strings.TrimSpace(c.Title)
		if title == "" {
			continue
		}
		if len(title) > 120 {
			title = title[:120]
		}
		kind := strings.ToLower(strings.TrimSpace(c.Kind))
		if !validTaskKinds[kind] {
			kind = "ops"
		}
		assigned := strings.ToLower(strings.TrimSpace(c.AssignedTo))
		if assigned == "" {
			assigned = "research" // default unassigned -> research desk
		}
		prio := strings.ToLower(strings.TrimSpace(c.Priority))
		if !validTaskPriorities[prio] {
			prio = "normal"
		}
		// Cap to 3 new per tick (the PM was told this, but enforce too).
		if created >= 3 {
			break
		}
		var due *time.Time
		if c.DueInMin > 0 && c.DueInMin < 60*24*30 {
			t := now.Add(time.Duration(c.DueInMin) * time.Minute)
			due = &t
		}
		t := Task{
			ID:          nextTaskID(m.state.Tasks),
			Title:       title,
			Description: strings.TrimSpace(c.Description),
			Kind:        kind,
			AssignedTo:  assigned,
			Symbol:      strings.ToUpper(strings.TrimSpace(c.Symbol)),
			Status:      taskStatusBacklog,
			Priority:    prio,
			CreatedAt:   now,
			UpdatedAt:   now,
			DueAt:       due,
			Notes: []TaskNote{
				{Time: now, Author: "pm", Text: "Created.", Status: taskStatusBacklog},
			},
		}
		// Research tasks start in_progress so the research executor
		// picks them up on the very next pass.
		if kind == "research" {
			t.Status = taskStatusInProgress
			t.Notes[0].Status = taskStatusInProgress
		}
		m.state.Tasks = append(m.state.Tasks, t)
		created++
	}

	// move
	for _, mv := range ops.Move {
		idx := findTask(m.state.Tasks, strings.TrimSpace(mv.ID))
		if idx < 0 {
			continue
		}
		to := strings.ToLower(strings.TrimSpace(mv.ToStatus))
		if !validTaskStatuses[to] {
			continue
		}
		if m.state.Tasks[idx].Status == to {
			continue
		}
		m.state.Tasks[idx].Status = to
		m.state.Tasks[idx].UpdatedAt = now
		m.state.Tasks[idx].Notes = append(m.state.Tasks[idx].Notes, TaskNote{
			Time: now, Author: "pm", Text: strings.TrimSpace(mv.Note), Status: to,
		})
		moved++
	}

	// close
	for _, cl := range ops.Close {
		idx := findTask(m.state.Tasks, strings.TrimSpace(cl.ID))
		if idx < 0 {
			continue
		}
		if m.state.Tasks[idx].Status == taskStatusDone {
			continue
		}
		m.state.Tasks[idx].Status = taskStatusDone
		m.state.Tasks[idx].UpdatedAt = now
		m.state.Tasks[idx].Notes = append(m.state.Tasks[idx].Notes, TaskNote{
			Time: now, Author: "pm",
			Text:   "Closed: " + strings.TrimSpace(cl.Outcome),
			Status: taskStatusDone,
		})
		closed++
	}

	// GC done/archived
	m.state.Tasks = gcTasks(m.state.Tasks, now)
	return
}

// applyPMFromConversationLocked scans the conversation for the LAST
// "pm" role turn and applies its ops block. Caller MUST hold m.mu.
func (m *Manager) applyPMFromConversationLocked(conv []ConversationTurn) (created, moved, closed int) {
	var pmRaw string
	for i := len(conv) - 1; i >= 0; i-- {
		if conv[i].Role == "pm" {
			pmRaw = conv[i].Content
			break
		}
	}
	if pmRaw == "" {
		return
	}
	ops, err := parsePMOutput(pmRaw)
	if err != nil {
		// Log and bail — we don't fail the tick on a PM JSON glitch.
		fmt.Printf("trader: PM ops parse failed: %v\n", err)
		return
	}
	return m.applyPMOpsLocked(ops)
}

// MoveTask is the public entry point used by the API to manually move
// a task between statuses. Returns the updated task, or an error.
func (m *Manager) MoveTask(id, toStatus, note string) (*Task, error) {
	to := strings.ToLower(strings.TrimSpace(toStatus))
	if !validTaskStatuses[to] {
		return nil, fmt.Errorf("invalid status: %s", toStatus)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	idx := findTask(m.state.Tasks, strings.TrimSpace(id))
	if idx < 0 {
		return nil, fmt.Errorf("task not found: %s", id)
	}
	now := time.Now()
	m.state.Tasks[idx].Status = to
	m.state.Tasks[idx].UpdatedAt = now
	noteText := strings.TrimSpace(note)
	if noteText == "" {
		noteText = "Manual move."
	}
	m.state.Tasks[idx].Notes = append(m.state.Tasks[idx].Notes, TaskNote{
		Time: now, Author: "user", Text: noteText, Status: to,
	})
	_ = m.store.Save(m.state)
	t := m.state.Tasks[idx]
	return &t, nil
}

// CreateTask is the public entry point used by the API for users to
// add a task manually from the dashboard.
func (m *Manager) CreateTask(title, description, kind, assigned, symbol, priority string) (*Task, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("title required")
	}
	kind = strings.ToLower(strings.TrimSpace(kind))
	if !validTaskKinds[kind] {
		kind = "ops"
	}
	prio := strings.ToLower(strings.TrimSpace(priority))
	if !validTaskPriorities[prio] {
		prio = "normal"
	}
	assigned = strings.ToLower(strings.TrimSpace(assigned))
	if assigned == "" {
		assigned = "research"
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	t := Task{
		ID:          nextTaskID(m.state.Tasks),
		Title:       title,
		Description: strings.TrimSpace(description),
		Kind:        kind,
		AssignedTo:  assigned,
		Symbol:      strings.ToUpper(strings.TrimSpace(symbol)),
		Status:      taskStatusBacklog,
		Priority:    prio,
		CreatedAt:   now,
		UpdatedAt:   now,
		Notes: []TaskNote{
			{Time: now, Author: "user", Text: "Created.", Status: taskStatusBacklog},
		},
	}
	if kind == "research" {
		t.Status = taskStatusInProgress
		t.Notes[0].Status = taskStatusInProgress
	}
	m.state.Tasks = append(m.state.Tasks, t)
	_ = m.store.Save(m.state)
	return &t, nil
}
