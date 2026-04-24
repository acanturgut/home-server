package apps

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// GeneratedFile is a single file extracted from LLM output.
type GeneratedFile struct {
	Path    string
	Content string
}

// ParseFiles extracts files from LLM output that uses the ### FILE: format.
// Supports both ``` fenced and unfenced blocks.
func ParseFiles(output string) []GeneratedFile {
	var files []GeneratedFile

	// Pattern: ### FILE: path\n```lang?\n...content...\n```
	re := regexp.MustCompile("(?m)^###\\s*FILE:\\s*(.+?)\\s*$")
	matches := re.FindAllStringSubmatchIndex(output, -1)

	for i, m := range matches {
		path := strings.TrimSpace(output[m[2]:m[3]])
		// Clean path: remove leading ./ or /
		path = strings.TrimPrefix(path, "./")
		path = strings.TrimPrefix(path, "/")

		// Content starts after the FILE line
		contentStart := m[1]
		var contentEnd int
		if i+1 < len(matches) {
			contentEnd = matches[i+1][0]
		} else {
			contentEnd = len(output)
		}

		raw := output[contentStart:contentEnd]

		// Extract content from code fences if present
		content := extractFromFences(raw)
		if content == "" {
			// No fences — use the raw content trimmed
			content = strings.TrimSpace(raw)
		}

		if path != "" && content != "" {
			files = append(files, GeneratedFile{Path: path, Content: content})
		}
	}

	return files
}

// extractFromFences extracts content between the first ``` ... ``` pair.
func extractFromFences(s string) string {
	start := strings.Index(s, "```")
	if start == -1 {
		return ""
	}
	// Skip the opening fence line
	afterOpen := start + 3
	nl := strings.Index(s[afterOpen:], "\n")
	if nl == -1 {
		return ""
	}
	contentStart := afterOpen + nl + 1

	// Find closing fence
	end := strings.Index(s[contentStart:], "```")
	if end == -1 {
		// No closing fence — use rest
		return strings.TrimRight(s[contentStart:], "\n\r\t ")
	}
	return s[contentStart : contentStart+end]
}

// WriteProject writes parsed files to a project directory.
func WriteProject(dir string, files []GeneratedFile) error {
	for _, f := range files {
		target := filepath.Join(dir, f.Path)
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(target, []byte(f.Content), 0644); err != nil {
			return err
		}
	}
	return nil
}
