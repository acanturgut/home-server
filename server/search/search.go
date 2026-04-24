package search

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type Result struct {
	Title   string `json:"title"`
	Snippet string `json:"snippet"`
	URL     string `json:"url"`
}

// DuckDuckGo fetches search results from DuckDuckGo HTML lite.
func DuckDuckGo(ctx context.Context, query string, maxResults int) ([]Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	searchURL := "https://lite.duckduckgo.com/lite/"

	form := url.Values{"q": {query}}
	req, err := http.NewRequestWithContext(ctx, "POST", searchURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return parseHTML(string(body), maxResults), nil
}

var (
	linkRe    = regexp.MustCompile(`<a[^>]+href="([^"]+)"[^>]*class="result-link"[^>]*>([^<]+)</a>`)
	snippetRe = regexp.MustCompile(`<td[^>]*class="result-snippet"[^>]*>(.*?)</td>`)
	tagRe     = regexp.MustCompile(`<[^>]+>`)
)

func parseHTML(html string, max int) []Result {
	links := linkRe.FindAllStringSubmatch(html, -1)
	snippets := snippetRe.FindAllStringSubmatch(html, -1)

	var results []Result
	for i, link := range links {
		if len(results) >= max {
			break
		}
		if len(link) < 3 {
			continue
		}

		href := strings.TrimSpace(link[1])
		title := strings.TrimSpace(link[2])

		// Skip DuckDuckGo internal links
		if strings.Contains(href, "duckduckgo.com") {
			continue
		}

		snippet := ""
		if i < len(snippets) && len(snippets[i]) >= 2 {
			snippet = strings.TrimSpace(tagRe.ReplaceAllString(snippets[i][1], ""))
		}

		results = append(results, Result{
			Title:   title,
			Snippet: snippet,
			URL:     href,
		})
	}

	// Fallback: try generic link+snippet pattern for DDG lite
	if len(results) == 0 {
		results = parseFallback(html, max)
	}

	return results
}

var (
	fallbackLinkRe = regexp.MustCompile(`<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>\s*([^<]+?)\s*</a>`)
	fallbackSnipRe = regexp.MustCompile(`<td>\s*<span class="link-text">.*?</span>\s*</td>\s*</tr>\s*<tr>\s*<td[^>]*>\s*(.*?)\s*</td>`)
)

func parseFallback(html string, max int) []Result {
	links := fallbackLinkRe.FindAllStringSubmatch(html, -1)
	var results []Result
	for _, link := range links {
		if len(results) >= max {
			break
		}
		if len(link) < 3 {
			continue
		}
		href := strings.TrimSpace(link[1])
		title := strings.TrimSpace(link[2])
		if strings.Contains(href, "duckduckgo.com") || title == "" {
			continue
		}
		results = append(results, Result{
			Title: title,
			URL:   href,
		})
	}
	return results
}

// NeedsSearch checks if the user message likely needs web search.
func NeedsSearch(message string) bool {
	msg := strings.ToLower(message)

	// Explicit search triggers
	triggers := []string{
		"search for", "look up", "google", "find out",
		"search the web", "web search", "look online",
	}
	for _, t := range triggers {
		if strings.Contains(msg, t) {
			return true
		}
	}

	// Time-sensitive / factual queries
	patterns := []string{
		"latest", "current", "recent", "today",
		"news about", "what happened", "who won",
		"price of", "stock price", "weather in",
		"score of", "results of", "how much is",
		"release date", "when does", "when did",
		"who is the current", "what is the current",
	}
	for _, p := range patterns {
		if strings.Contains(msg, p) {
			return true
		}
	}

	return false
}

// FormatResults formats search results as context for an LLM.
func FormatResults(results []Result) string {
	if len(results) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("Web search results:\n\n")
	for i, r := range results {
		sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, r.Title))
		if r.Snippet != "" {
			sb.WriteString(fmt.Sprintf("    %s\n", r.Snippet))
		}
		sb.WriteString(fmt.Sprintf("    Source: %s\n\n", r.URL))
	}
	sb.WriteString("Use the above search results to inform your answer. Cite sources when possible.")
	return sb.String()
}
