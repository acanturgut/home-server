package apps

import (
	"regexp"
	"strings"
)

// ParsedOpencodeLine is one cleaned-up unit of opencode output.
// Step is one of: "tool", "todo", "thinking", "generating", "" (skip).
type ParsedOpencodeLine struct {
	Step    string
	Message string
	Detail  string
}

var (
	// CSI escape sequences (colors, cursor moves, anything starting with ESC[…).
	ansiRE = regexp.MustCompile(`\x1b\[[0-9;?]*[A-Za-z]`)
	// Sometimes the ESC byte is stripped and we get bare "[0m", "[2K" garbage.
	bareCSIRE = regexp.MustCompile(`\[[0-9;?]*[mK]`)
	// Opencode prints "  ✓ Wrote src/App.jsx" / "  ✓ Read package.json" etc.
	toolLineRE = regexp.MustCompile(`(?i)^\s*[✓✗•·\-→>]\s*(write|edit|read|glob|grep|bash|list|patch)\b\s*(.*)$`)
	// "[x] Build display component"  or  "[ ] Wire up keypad"
	todoRE = regexp.MustCompile(`^\s*\[([ xX\-])\]\s+(.+)$`)
	// "# Todos" / "## Todos" headings — eat them so they don't dump on screen.
	todoHeadingRE = regexp.MustCompile(`(?i)^#+\s*todos?\s*$`)
)

// parseOpencodeLine cleans up one line of raw opencode stdout. Returns
// Step="" when the line should be dropped entirely (pure ANSI, banners,
// dividers, etc). The cleaned message has zero ANSI codes.
func parseOpencodeLine(raw string) ParsedOpencodeLine {
	clean := stripANSI(raw)
	clean = strings.TrimRight(clean, " \t\r")
	trim := strings.TrimSpace(clean)
	if trim == "" {
		return ParsedOpencodeLine{}
	}

	// Eat the "# Todos" heading — the [x] items below are self-explanatory.
	if todoHeadingRE.MatchString(trim) {
		return ParsedOpencodeLine{}
	}

	// Skip pure separators / banner art.
	if isDecorative(trim) {
		return ParsedOpencodeLine{}
	}

	// Todo checkbox line.
	if m := todoRE.FindStringSubmatch(trim); m != nil {
		mark := strings.ToLower(m[1])
		var icon string
		switch mark {
		case "x":
			icon = "✓"
		case "-":
			icon = "·"
		default:
			icon = "○"
		}
		return ParsedOpencodeLine{
			Step:    "todo",
			Message: icon + " " + m[2],
		}
	}

	// Tool action line ("✓ Wrote ...", "→ Reading ...", etc.).
	if m := toolLineRE.FindStringSubmatch(trim); m != nil {
		verb := strings.ToLower(m[1])
		rest := strings.TrimSpace(m[2])
		return ParsedOpencodeLine{
			Step:    "tool",
			Message: verb + " " + rest,
		}
	}

	// Lines that start with "Thinking…" / "Reasoning…" — fold into a
	// distinct, more muted step the UI can de-emphasize.
	low := strings.ToLower(trim)
	if strings.HasPrefix(low, "thinking") || strings.HasPrefix(low, "reasoning") {
		return ParsedOpencodeLine{Step: "thinking", Message: trim}
	}

	return ParsedOpencodeLine{Step: "generating", Message: trim}
}

func stripANSI(s string) string {
	s = ansiRE.ReplaceAllString(s, "")
	s = bareCSIRE.ReplaceAllString(s, "")
	// Erase control-code leftovers that some emitters embed without ESC.
	s = strings.ReplaceAll(s, "\x1b", "")
	s = strings.ReplaceAll(s, "\r", "")
	return s
}

func isDecorative(s string) bool {
	if len(s) < 3 {
		return true
	}
	// Lines made entirely of ─ ━ │ ║ ═ • · = - * etc.
	for _, r := range s {
		switch r {
		case ' ', '\t', '─', '━', '│', '║', '═', '╔', '╗', '╚', '╝',
			'╭', '╮', '╯', '╰', '┌', '┐', '└', '┘', '┃', '╴', '╶',
			'•', '·', '=', '-', '*', '+', '~', '⎯':
			continue
		default:
			return false
		}
	}
	return true
}
