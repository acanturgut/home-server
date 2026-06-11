package trader

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// Task is one card on the project board maintained by Aria (PM).
// Tasks survive across ticks until they reach status "done" and are
// then archived after 24h, or "archived" immediately.
//
// Kinds:
//   - "trade"     : an order or position to action / monitor
//   - "research"  : open question that needs a web search + writeup;
//                   the research executor will pick this up and fill
//                   Findings on the assigned role's behalf
//   - "monitor"   : a watch-only standing assignment (e.g. "Lana
//                   watches CPI release at 08:30")
//   - "ops"       : housekeeping (rebalance, take-profit ladder, etc.)
//
// Statuses are intentionally simple: backlog → in_progress → review → done.
type Task struct {
	ID          string        `json:"id"`
	Title       string        `json:"title"`
	Description string        `json:"description,omitempty"`
	Kind        string        `json:"kind"`
	AssignedTo  string        `json:"assigned_to"` // role key (account, analyst, risk, ..., tech, crypto, ...)
	Symbol      string        `json:"symbol,omitempty"`
	Status      string        `json:"status"`   // backlog | in_progress | review | done | archived
	Priority    string        `json:"priority"` // low | normal | high
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	DueAt       *time.Time    `json:"due_at,omitempty"`
	Notes       []TaskNote    `json:"notes,omitempty"`
	Findings    *TaskFinding  `json:"findings,omitempty"` // research output
}

// TaskNote is a single comment / status change appended by the PM
// (or the research executor) to a task's history.
type TaskNote struct {
	Time   time.Time `json:"time"`
	Author string    `json:"author"`        // role key, "pm", "research", or "user"
	Text   string    `json:"text"`
	Status string    `json:"status,omitempty"` // status set with this note, if any
}

// TaskFinding is a research output produced by the research executor.
type TaskFinding struct {
	Time    time.Time `json:"time"`
	Summary string    `json:"summary"`           // markdown summary
	Sources []string  `json:"sources,omitempty"` // URLs referenced
}

const (
	taskStatusBacklog    = "backlog"
	taskStatusInProgress = "in_progress"
	taskStatusReview     = "review"
	taskStatusDone       = "done"
	taskStatusArchived   = "archived"
)

var validTaskStatuses = map[string]bool{
	taskStatusBacklog:    true,
	taskStatusInProgress: true,
	taskStatusReview:     true,
	taskStatusDone:       true,
	taskStatusArchived:   true,
}

var validTaskKinds = map[string]bool{
	"trade":    true,
	"research": true,
	"monitor":  true,
	"ops":      true,
}

var validTaskPriorities = map[string]bool{
	"low":    true,
	"normal": true,
	"high":   true,
}

// tasksBriefing renders the active board into a compact text block for
// the panel briefing. Shows backlog + in_progress + review only (done
// is hidden — it's noise once we move on). Each role only needs to
// scan for their own name.
func tasksBriefing(tasks []Task) string {
	if len(tasks) == 0 {
		return ""
	}
	// Group by status, skip done/archived.
	var b strings.Builder
	groups := map[string][]Task{}
	for _, t := range tasks {
		if t.Status == taskStatusDone || t.Status == taskStatusArchived {
			continue
		}
		groups[t.Status] = append(groups[t.Status], t)
	}
	if len(groups) == 0 {
		return ""
	}
	b.WriteString("\nProject board (Aria, PM):\n")
	for _, st := range []string{taskStatusInProgress, taskStatusReview, taskStatusBacklog} {
		bucket := groups[st]
		if len(bucket) == 0 {
			continue
		}
		sort.SliceStable(bucket, func(i, j int) bool {
			return taskPriorityRank(bucket[i].Priority) < taskPriorityRank(bucket[j].Priority)
		})
		fmt.Fprintf(&b, "  %s:\n", strings.ToUpper(st))
		for _, t := range bucket {
			ownerName := roleDisplay(t.AssignedTo)
			sym := ""
			if t.Symbol != "" {
				sym = " " + t.Symbol
			}
			prio := ""
			if t.Priority == "high" {
				prio = " [HIGH]"
			}
			fmt.Fprintf(&b, "    - %s%s · %s%s — %s\n", t.ID, prio, ownerName, sym, t.Title)
			if t.Kind == "research" && t.Findings != nil && st == taskStatusReview {
				// Surface the finding inline so reviewers can react.
				summary := t.Findings.Summary
				if len(summary) > 300 {
					summary = summary[:297] + "..."
				}
				fmt.Fprintf(&b, "        ↳ findings: %s\n", strings.ReplaceAll(summary, "\n", " "))
			}
		}
	}
	return b.String()
}

func taskPriorityRank(p string) int {
	switch p {
	case "high":
		return 0
	case "normal":
		return 1
	case "low":
		return 2
	default:
		return 3
	}
}

// roleDisplay maps a role key to its human first name for compact
// briefing rendering. Falls back to the key itself if unknown.
func roleDisplay(key string) string {
	switch key {
	case "account":
		return "Owen"
	case "allocator":
		return "Mason"
	case "reporter":
		return "Lana"
	case "analyst":
		return "Raj"
	case "risk":
		return "Mira"
	case "trader":
		return "Kenji"
	case "manager":
		return "Sofia"
	case "pm":
		return "Aria"
	case "tech":
		return "Diane"
	case "energy":
		return "Marcus"
	case "auto":
		return "Sora"
	case "banks":
		return "Imani"
	case "crypto":
		return "Kai"
	case "geopolitics":
		return "Hassan"
	case "healthcare":
		return "Priya"
	case "consumer":
		return "Wei"
	case "research":
		return "Research desk"
	default:
		return key
	}
}

// activeTasksForRole returns all non-terminal tasks assigned to the
// given role, sorted by priority then update time. Used by the
// research executor and (potentially) by per-role briefing tweaks.
func activeTasksForRole(tasks []Task, roleKey string) []Task {
	var out []Task
	for _, t := range tasks {
		if t.AssignedTo != roleKey {
			continue
		}
		if t.Status == taskStatusDone || t.Status == taskStatusArchived {
			continue
		}
		out = append(out, t)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if taskPriorityRank(out[i].Priority) != taskPriorityRank(out[j].Priority) {
			return taskPriorityRank(out[i].Priority) < taskPriorityRank(out[j].Priority)
		}
		return out[i].UpdatedAt.After(out[j].UpdatedAt)
	})
	return out
}

// findTask returns the index of the task with the given ID, or -1.
func findTask(tasks []Task, id string) int {
	for i, t := range tasks {
		if t.ID == id {
			return i
		}
	}
	return -1
}

// nextTaskID picks the next sequential ID like "T-001". We scan
// existing IDs and increment the max numeric suffix.
func nextTaskID(tasks []Task) string {
	max := 0
	for _, t := range tasks {
		if strings.HasPrefix(t.ID, "T-") {
			var n int
			_, err := fmt.Sscanf(t.ID, "T-%d", &n)
			if err == nil && n > max {
				max = n
			}
		}
	}
	return fmt.Sprintf("T-%03d", max+1)
}

// gcTasks removes archived tasks and any done task older than 24h. We
// keep recently-done tasks visible briefly so the board feels alive.
func gcTasks(tasks []Task, now time.Time) []Task {
	cutoff := now.Add(-24 * time.Hour)
	out := tasks[:0]
	for _, t := range tasks {
		if t.Status == taskStatusArchived {
			continue
		}
		if t.Status == taskStatusDone && t.UpdatedAt.Before(cutoff) {
			continue
		}
		out = append(out, t)
	}
	return out
}
