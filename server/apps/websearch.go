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
)

// WebResult represents a single search result.
type WebResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
	Text    string `json:"text,omitempty"` // populated when fetching page bodies
}

// ── DuckDuckGo HTML scraper ─────────────────────────────────────────────
//
// We use html.duckduckgo.com/html/ which has no API key and returns static
// HTML that's easy to parse.  If DDG blocks us, the call simply returns an
// empty slice — callers should fall back gracefully.

var (
	ddgResultRe = regexp.MustCompile(`(?is)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?<a[^>]+class="result__snippet"[^>]*>(.*?)</a>`)
	ddgTagStrip = regexp.MustCompile(`<[^>]+>`)
	ddgEntities = strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">",
		"&quot;", "\"", "&#39;", "'", "&#x27;", "'", "&nbsp;", " ",
	)
)

// SearchDDG queries DuckDuckGo and returns up to k results.
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
	u := "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(query)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader("q="+url.QueryEscape(query)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605 (KHTML, like Gecko) Version/17.0 Safari/605")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "text/html")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, err
	}
	matches := ddgResultRe.FindAllStringSubmatch(string(body), -1)
	out := []WebResult{}
	for _, m := range matches {
		if len(m) < 4 {
			continue
		}
		href := resolveDDGLink(m[1])
		title := cleanHTMLFragment(m[2])
		snippet := cleanHTMLFragment(m[3])
		if href == "" || title == "" {
			continue
		}
		out = append(out, WebResult{Title: title, URL: href, Snippet: snippet})
		if len(out) >= k {
			break
		}
	}
	return out, nil
}

func cleanHTMLFragment(s string) string {
	s = ddgTagStrip.ReplaceAllString(s, "")
	s = ddgEntities.Replace(s)
	return strings.TrimSpace(s)
}

// DDG wraps result links through a redirect like
//
//	//duckduckgo.com/l/?uddg=<encoded-url>&rut=...
//
// resolveDDGLink undoes that wrapping when present.
func resolveDDGLink(href string) string {
	if strings.HasPrefix(href, "//") {
		href = "https:" + href
	}
	u, err := url.Parse(href)
	if err != nil {
		return ""
	}
	if strings.Contains(u.Host, "duckduckgo.com") && u.Path == "/l/" {
		if q := u.Query().Get("uddg"); q != "" {
			if decoded, err := url.QueryUnescape(q); err == nil {
				return decoded
			}
		}
	}
	return u.String()
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
)

func WebExtractText(html string) (string, string) {
	title := ""
	if m := webTitleRe.FindStringSubmatch(html); len(m) == 2 {
		title = cleanHTMLFragment(m[1])
	}
	s := webScriptRe.ReplaceAllString(html, "")
	s = webTagRe.ReplaceAllString(s, "")
	s = ddgEntities.Replace(s)
	s = webWsRe.ReplaceAllString(s, " ")
	s = webLineRe.ReplaceAllString(s, "\n\n")
	return title, strings.TrimSpace(s)
}
