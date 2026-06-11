package apps

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/acanturgut/home-server/search"
)

// WebResult represents a single search result.
type WebResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
	Text    string `json:"text,omitempty"` // populated when fetching page bodies
	Source  string `json:"source,omitempty"`
}

// SearchDDG queries the web and returns up to k results. It now delegates
// to the multi-provider backend in package search (DDG Instant Answer →
// DDG HTML → Wikipedia) so callers get resilient fallback automatically.
func SearchDDG(ctx context.Context, query string, k int) ([]WebResult, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("empty query")
	}
	if k <= 0 {
		k = 5
	}
	if k > 15 {
		k = 15
	}
	res, err := search.Search(ctx, query, k)
	if err != nil {
		return nil, err
	}
	out := make([]WebResult, 0, len(res))
	for _, r := range res {
		out = append(out, WebResult{
			Title:   r.Title,
			URL:     r.URL,
			Snippet: r.Snippet,
			Source:  r.Source,
		})
	}
	return out, nil
}

// FetchPageText downloads a URL and returns extracted text (using the same
// helpers as /api/fetch-url).  Errors are non-fatal: an empty string is
// returned so callers can keep partial results.
func FetchPageText(ctx context.Context, rawURL string, limit int) (title, text string) {
	if _, err := url.Parse(rawURL); err != nil {
		return "", ""
	}
	ctx2, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx2, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 home-server/web-search")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		return "", ""
	}
	title, text = WebExtractText(string(body))
	if limit > 0 && len(text) > limit {
		text = text[:limit] + "\n…[truncated]"
	}
	return title, text
}

// WebExtractText is a small HTML → plaintext extractor used by the
// websearch flow.  Kept here (rather than re-importing from api package)
// to avoid an import cycle.
var (
	webScriptRe = regexp.MustCompile(`(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>`)
	webTitleRe  = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	webTagRe    = regexp.MustCompile(`<[^>]+>`)
	webWsRe     = regexp.MustCompile(`[ \t]+`)
	webLineRe   = regexp.MustCompile(`\n[ \t]*\n[ \t]*`)
	webEntities = strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">",
		"&quot;", "\"", "&#39;", "'", "&#x27;", "'", "&nbsp;", " ",
	)
)

func cleanFragment(s string) string {
	s = webTagRe.ReplaceAllString(s, "")
	s = webEntities.Replace(s)
	return strings.TrimSpace(s)
}

func WebExtractText(html string) (string, string) {
	title := ""
	if m := webTitleRe.FindStringSubmatch(html); len(m) == 2 {
		title = cleanFragment(m[1])
	}
	s := webScriptRe.ReplaceAllString(html, "")
	s = webTagRe.ReplaceAllString(s, "")
	s = webEntities.Replace(s)
	s = webWsRe.ReplaceAllString(s, " ")
	s = webLineRe.ReplaceAllString(s, "\n\n")
	return title, strings.TrimSpace(s)
}
