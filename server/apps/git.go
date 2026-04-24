package apps

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GitCommit is one entry in an app's history.
type GitCommit struct {
	SHA       string `json:"sha"`
	ShortSHA  string `json:"short_sha"`
	Subject   string `json:"subject"`
	Body      string `json:"body,omitempty"`
	Timestamp string `json:"timestamp"`
	Action    string `json:"action,omitempty"` // build|fix|rebuild|deploy
	Files     int    `json:"files,omitempty"`
}

// gitInit initialises a git repo in the project dir if not already one.
// Safe to call repeatedly. Best-effort — failures are silently ignored so
// missing/broken git installs never break the build pipeline.
func gitInit(projectDir string) {
	if projectDir == "" {
		return
	}
	if _, err := os.Stat(filepath.Join(projectDir, ".git")); err == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	runCmd(ctx, projectDir, "git", "init", "-q", "-b", "main")
	runCmd(ctx, projectDir, "git", "config", "user.email", "home-server@local")
	runCmd(ctx, projectDir, "git", "config", "user.name", "home-server")
	// Sensible default ignore so builds don't churn huge diffs.
	gi := filepath.Join(projectDir, ".gitignore")
	if _, err := os.Stat(gi); err != nil {
		os.WriteFile(gi, []byte("node_modules/\ndist/\n.aider*\n.env\n*.log\n"), 0644)
	}
}

// gitCommit stages everything and commits with the supplied message.
// No-op if there are no changes. Returns the new SHA on success (empty
// otherwise). All errors are swallowed to keep the build pipeline resilient.
func gitCommit(projectDir, action, message string) string {
	if projectDir == "" {
		return ""
	}
	gitInit(projectDir)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	runCmd(ctx, projectDir, "git", "add", "-A")
	// Detect whether anything is actually staged.
	out, _ := runCmd(ctx, projectDir, "git", "status", "--porcelain")
	if strings.TrimSpace(out) == "" {
		return ""
	}
	subject := message
	if len(subject) > 72 {
		subject = subject[:72] + "…"
	}
	if action != "" {
		subject = action + ": " + subject
	}
	runCmd(ctx, projectDir, "git", "commit", "-q", "-m", subject)
	sha, _ := runCmd(ctx, projectDir, "git", "rev-parse", "HEAD")
	return strings.TrimSpace(sha)
}

// gitLog returns the most recent N commits for the project.
func gitLog(projectDir string, limit int) []GitCommit {
	if limit <= 0 {
		limit = 50
	}
	if projectDir == "" {
		return nil
	}
	if _, err := os.Stat(filepath.Join(projectDir, ".git")); err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Use a unit separator to safely split fields and a record separator
	// between commits.
	const fieldSep = "\x1f"
	const recSep = "\x1e"
	fmt := "%H" + fieldSep + "%s" + fieldSep + "%cI" + fieldSep + "%b" + recSep
	out, err := runCmd(ctx, projectDir, "git", "log", "-n", itoa(limit), "--pretty=format:"+fmt)
	if err != nil || out == "" {
		return nil
	}
	commits := []GitCommit{}
	for _, raw := range strings.Split(out, recSep) {
		raw = strings.TrimLeft(raw, "\n")
		if strings.TrimSpace(raw) == "" {
			continue
		}
		parts := strings.SplitN(raw, fieldSep, 4)
		if len(parts) < 3 {
			continue
		}
		sha := strings.TrimSpace(parts[0])
		subj := parts[1]
		ts := parts[2]
		body := ""
		if len(parts) == 4 {
			body = strings.TrimSpace(parts[3])
		}
		action := ""
		if i := strings.Index(subj, ": "); i > 0 && i < 12 {
			action = subj[:i]
		}
		// Files changed count (cheap stat, skip on errors).
		files := 0
		if statOut, err := runCmd(ctx, projectDir, "git", "show", "--stat", "--format=", sha); err == nil {
			lines := strings.Split(strings.TrimSpace(statOut), "\n")
			if len(lines) > 0 {
				last := lines[len(lines)-1]
				if strings.Contains(last, "changed") {
					// e.g. " 3 files changed, 12 insertions(+), 4 deletions(-)"
					fields := strings.Fields(last)
					if len(fields) > 0 {
						files = atoi(fields[0])
					}
				}
			}
		}
		short := sha
		if len(short) > 7 {
			short = short[:7]
		}
		commits = append(commits, GitCommit{
			SHA:       sha,
			ShortSHA:  short,
			Subject:   subj,
			Body:      body,
			Timestamp: ts,
			Action:    action,
			Files:     files,
		})
	}
	return commits
}

// gitDiff returns the textual diff for one commit, capped at maxBytes.
func gitDiff(projectDir, sha string, maxBytes int) string {
	if projectDir == "" || sha == "" {
		return ""
	}
	if maxBytes <= 0 {
		maxBytes = 200_000
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := runCmd(ctx, projectDir, "git", "show", "--no-color", sha)
	if err != nil {
		return ""
	}
	if len(out) > maxBytes {
		out = out[:maxBytes] + "\n…(truncated)…\n"
	}
	return out
}

// gitRevert creates a new commit that undoes the changes of the given sha.
// Returns the new HEAD sha on success, or an error message string prefixed
// with "error: " on failure.
func gitRevert(projectDir, sha string) (string, error) {
	if projectDir == "" || sha == "" {
		return "", fmt.Errorf("missing projectDir or sha")
	}
	if _, err := os.Stat(filepath.Join(projectDir, ".git")); err != nil {
		return "", fmt.Errorf("no git repo")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	// Abort any in-progress revert/merge first to keep idempotent.
	runCmd(ctx, projectDir, "git", "revert", "--abort")
	if out, err := runCmd(ctx, projectDir, "git", "revert", "--no-edit", sha); err != nil {
		return "", fmt.Errorf("git revert failed: %s", strings.TrimSpace(out))
	}
	head, _ := runCmd(ctx, projectDir, "git", "rev-parse", "HEAD")
	return strings.TrimSpace(head), nil
}

// itoa / atoi tiny helpers to avoid pulling strconv just for this file.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	buf := []byte{}
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int(c-'0')
	}
	return n
}
