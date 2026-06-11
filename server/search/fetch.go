package search

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
)

// Enrich fetches the top N result pages in parallel, extracts their
// readable text, and appends each chunk to the LLM context. We need this
// because raw search snippets are typically just "this site has weather
// info" — actual numbers (temperatures, prices, scores) live in the page
// body. Without enrichment the model honestly responds "I can't see the
// values" and refuses to answer.
//
// Per-page text is capped at maxBytesPerPage so a single huge article
// can't drown out other sources or blow the model's context window.
func Enrich(ctx context.Context, results []Result, fetchN, maxBytesPerPage int) []Result {
	if fetchN <= 0 || len(results) == 0 {
		return results
	}
	if fetchN > len(results) {
		fetchN = len(results)
	}
	if maxBytesPerPage <= 0 {
		maxBytesPerPage = 6000
	}

	var wg sync.WaitGroup
	out := make([]Result, len(results))
	copy(out, results)

	for i := 0; i < fetchN; i++ {
		i := i
		if out[i].URL == "" {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			fetchCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()
			body, err := fetchReadable(fetchCtx, out[i].URL, maxBytesPerPage)
			if err != nil || body == "" {
				return
			}
			// Append page body to the snippet so FormatResults includes it.
			if out[i].Snippet != "" {
				out[i].Snippet = out[i].Snippet + "\n\nPage content:\n" + body
			} else {
				out[i].Snippet = "Page content:\n" + body
			}
		}()
	}
	wg.Wait()
	return out
}

// fetchReadable downloads a URL and returns plain visible text, with all
// scripts/styles/nav-chrome stripped. Hard-capped at maxBytes runes after
// extraction so we don't pump 200KB into the LLM context.
func fetchReadable(ctx context.Context, rawURL string, maxBytes int) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("status %d", resp.StatusCode)
	}
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if ct != "" && !strings.Contains(ct, "text/html") && !strings.Contains(ct, "xml") {
		return "", fmt.Errorf("non-html content-type: %s", ct)
	}
	// Limit raw download to 1MB so a hostile/huge page can't OOM us.
	doc, err := html.Parse(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	extractText(doc, &sb)
	text := collapseWhitespace(sb.String())
	if len(text) > maxBytes {
		text = text[:maxBytes] + "…"
	}
	return text, nil
}

// extractText walks the DOM and collects visible text, skipping the
// usual chrome (scripts, styles, nav, footer, headers).
func extractText(n *html.Node, sb *strings.Builder) {
	if n == nil {
		return
	}
	if n.Type == html.ElementNode {
		switch strings.ToLower(n.Data) {
		case "script", "style", "noscript", "template", "svg",
			"nav", "header", "footer", "aside", "form", "iframe", "button":
			return
		}
	}
	if n.Type == html.TextNode {
		if t := strings.TrimSpace(n.Data); t != "" {
			sb.WriteString(t)
			sb.WriteByte(' ')
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		extractText(c, sb)
	}
}

func collapseWhitespace(s string) string {
	var sb strings.Builder
	sb.Grow(len(s))
	prevSpace := true
	for _, r := range s {
		if r == '\n' || r == '\t' || r == '\r' || r == ' ' || r == '\u00a0' {
			if !prevSpace {
				sb.WriteByte(' ')
				prevSpace = true
			}
			continue
		}
		sb.WriteRune(r)
		prevSpace = false
	}
	return strings.TrimSpace(sb.String())
}
