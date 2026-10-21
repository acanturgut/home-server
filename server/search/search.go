// Package search provides a robust web-search backend with provider
// fallback. The flow is:
//
//  1. DuckDuckGo Instant Answer API (JSON, fast, structured – great for
//     "what is X" / "who is Y" style queries).
//  2. DuckDuckGo HTML lite scraper (organic web results).
//  3. DuckDuckGo full HTML (last-ditch scrape if lite changes layout).
//  4. Wikipedia REST search (always available, great factual fallback).
//
// Each provider is tried in order until one returns at least one result.
// Results are deduplicated by host, cached in-memory for 10 minutes, and
// stripped of trackers / DDG redirect wrappers.
package search

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/net/html"
)

// Result is a single web-search hit.
type Result struct {
	Title   string `json:"title"`
	Snippet string `json:"snippet"`
	URL     string `json:"url"`
	Source  string `json:"source,omitempty"` // "ddg-ia", "ddg-html", "wikipedia"
}

// httpClient is shared so we get connection reuse.
var httpClient = &http.Client{
	Timeout: 12 * time.Second,
	// Don't follow more than 5 redirects (DDG sometimes loops).
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return http.ErrUseLastResponse
		}
		return nil
	},
}

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

// ── public entry points ────────────────────────────────────────────────

// Search runs the full provider chain and returns the first non-empty
// result set. The error is non-nil only when *every* provider failed; an
// empty slice with nil error simply means "no hits".
func Search(ctx context.Context, query string, maxResults int) ([]Result, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty query")
	}
	if maxResults <= 0 {
		maxResults = 5
	}
	if maxResults > 15 {
		maxResults = 15
	}

	if cached, ok := cacheGet(query, maxResults); ok {
		return cached, nil
	}

	type providerFn func(context.Context, string, int) ([]Result, error)
	providers := []struct {
		name string
		fn   providerFn
	}{
		{"ddg-ia", ddgInstantAnswer},
		{"ddg-html", ddgHTML},
		{"wikipedia", wikipediaSearch},
	}

	var lastErr error
	for _, p := range providers {
		res, err := p.fn(ctx, query, maxResults)
		if err != nil {
			lastErr = fmt.Errorf("%s: %w", p.name, err)
			continue
		}
		res = dedupe(res)
		if len(res) > maxResults {
			res = res[:maxResults]
		}
		if len(res) > 0 {
			cachePut(query, maxResults, res)
			return res, nil
		}
	}
	return nil, lastErr
}

// DuckDuckGo is kept as an alias for backward compatibility.
func DuckDuckGo(ctx context.Context, query string, maxResults int) ([]Result, error) {
	return Search(ctx, query, maxResults)
}

// FormatResults renders results as an LLM-friendly context block.
func FormatResults(results []Result) string {
	if len(results) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("Web search results (today is ")
	sb.WriteString(time.Now().Format("Mon Jan 2, 2006"))
	sb.WriteString("):\n\n")
	for i, r := range results {
		fmt.Fprintf(&sb, "[%d] %s\n", i+1, r.Title)
		if r.Snippet != "" {
			fmt.Fprintf(&sb, "    %s\n", r.Snippet)
		}
		fmt.Fprintf(&sb, "    Source: %s\n\n", r.URL)
	}
	sb.WriteString("Use these results as your primary source. ")
	sb.WriteString("If they conflict with your training data, prefer the search results because they are more recent. ")
	sb.WriteString("When a result includes a 'Page content:' block, treat it as the authoritative text fetched directly from that source — read it carefully and extract the specific facts (numbers, dates, temperatures, prices, scores) the user asked about. ")
	sb.WriteString("Do NOT respond with meta-statements like 'I cannot see the values' or 'these are just snippets' — pull the actual values out of the Page content blocks. ")
	sb.WriteString("Cite sources by number like [1] or [2] when stating facts. ")
	sb.WriteString("If after reading the page content the answer truly isn't there, say so honestly instead of guessing.")
	return sb.String()
}

// ── trigger detection ─────────────────────────────────────────────────

var (
	// Explicit "go look this up" phrases.
	explicitTriggers = []string{
		"search for", "search the web", "search the internet",
		"web search", "look up", "look online", "look it up",
		"google ", "google for", "duckduckgo",
		"find out about", "find information about",
		"check the news", "check online", "browse the web",
		// Turkish
		"ara bul", "internetten ara", "googleda ara", "google'da ara",
		"web'de ara", "webde ara", "haberlere bak",
	}

	// Topic + recency cues that imply we need fresh data.
	recencyCues = []string{
		"latest", "current", "currently", "recent", "recently",
		"today", "tonight", "yesterday", "this week", "this month",
		"this year", "right now", "as of",
		"news about", "what happened", "breaking",
		"who won", "who is winning", "score of", "results of",
		"price of", "stock price", "exchange rate", "weather in",
		"how much is", "how much does", "release date",
		"when does", "when will", "when did", "when is",
		"who is the current", "what is the current",
		"new version", "update on",
		// Turkish recency / question cues
		"bugün", "şu an", "şuan", "son dakika", "haberler",
		"hava durumu", "fiyatı", "ne zaman", "nedir",
	}

	// "What is the X of Y in 20XX" — explicit year ≥ current year-1.
	yearRE = regexp.MustCompile(`\b(20[2-9]\d)\b`)

	// "What/who/when/where is …" with a capitalized noun afterwards
	// often needs lookup (e.g. "who is Lily Allen").
	whoIsRE = regexp.MustCompile(`(?i)\b(who|what|when|where) (is|are|was|were)\b`)

	// Turkish "kim / kimdir / kim o" identity question — almost always
	// benefits from a lookup when paired with a proper noun.
	whoIsTrRE = regexp.MustCompile(`(?i)\b(kim|kimdir|kim\s*o|kimdi)\b`)

	// Negative cues — clearly local / conversational, never search.
	negativeCues = []string{
		"turn on", "turn off", "switch on", "switch off",
		"open the", "close the", "set the", "dim the",
		"home state", "what time is it",
		"hello", "hi ", "thanks", "thank you",
	}
)

// NeedsSearch is a heuristic predicate to decide whether the user's last
// message benefits from a web lookup. False positives are cheap (we burn
// 1s on an empty search), false negatives mean stale answers.
func NeedsSearch(message string) bool {
	msg := strings.ToLower(strings.TrimSpace(message))
	if msg == "" {
		return false
	}

	for _, n := range negativeCues {
		if strings.Contains(msg, n) {
			return false
		}
	}

	for _, t := range explicitTriggers {
		if strings.Contains(msg, t) {
			return true
		}
	}
	for _, p := range recencyCues {
		if strings.Contains(msg, p) {
			return true
		}
	}

	// Year reference within last few years or future.
	if m := yearRE.FindString(message); m != "" {
		if y, err := parseYear(m); err == nil {
			if y >= time.Now().Year()-1 {
				return true
			}
		}
	}

	// "Who is/was X" with a proper noun in the original (case-sensitive)
	// message — almost always benefits from a quick lookup.
	if whoIsRE.MatchString(message) && hasProperNoun(message) {
		return true
	}
	// Turkish "X kim / kimdir" identity question with a capitalized name.
	if whoIsTrRE.MatchString(message) && hasProperNoun(message) {
		return true
	}
	// Two-or-more proper nouns in a short query (e.g. "Ahmet Turgut
	// Tekirdağ") strongly suggest a person/place lookup.
	if properNounCount(message) >= 2 && len(strings.Fields(message)) <= 12 {
		return true
	}

	return false
}

func parseYear(s string) (int, error) {
	var y int
	_, err := fmt.Sscanf(s, "%d", &y)
	return y, err
}

// hasProperNoun returns true when the trimmed message has any capitalized
// word *other than* its first word (since the first word is naturally
// capitalised in English sentences). Unicode-aware so Turkish/German/
// accented names like "Tekirdağ" or "Müller" count.
func hasProperNoun(s string) bool {
	words := strings.Fields(s)
	for i, w := range words {
		if i == 0 {
			continue
		}
		if isCapitalizedWord(w) {
			return true
		}
	}
	return false
}

func properNounCount(s string) int {
	n := 0
	for i, w := range strings.Fields(s) {
		if i == 0 {
			continue
		}
		if isCapitalizedWord(w) {
			n++
		}
	}
	return n
}

func isCapitalizedWord(w string) bool {
	runes := []rune(w)
	if len(runes) < 2 {
		return false
	}
	return unicode.IsUpper(runes[0]) && unicode.IsLower(runes[1])
}

// ── provider: DuckDuckGo Instant Answer API ───────────────────────────

type ddgIAResponse struct {
	AbstractText   string `json:"AbstractText"`
	AbstractURL    string `json:"AbstractURL"`
	AbstractSource string `json:"AbstractSource"`
	Heading        string `json:"Heading"`
	Answer         string `json:"Answer"`
	AnswerType     string `json:"AnswerType"`
	Definition     string `json:"Definition"`
	DefinitionURL  string `json:"DefinitionURL"`
	RelatedTopics  []struct {
		Text     string `json:"Text"`
		FirstURL string `json:"FirstURL"`
		Topics   []struct {
			Text     string `json:"Text"`
			FirstURL string `json:"FirstURL"`
		} `json:"Topics"`
	} `json:"RelatedTopics"`
}

func ddgInstantAnswer(ctx context.Context, query string, max int) ([]Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	u := "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + url.QueryEscape(query)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return nil, err
	}
	var ia ddgIAResponse
	if err := json.Unmarshal(body, &ia); err != nil {
		return nil, err
	}

	out := []Result{}
	if ia.AbstractText != "" && ia.AbstractURL != "" {
		title := ia.Heading
		if title == "" {
			title = ia.AbstractSource
		}
		if title == "" {
			title = query
		}
		out = append(out, Result{
			Title:   title,
			Snippet: ia.AbstractText,
			URL:     ia.AbstractURL,
			Source:  "ddg-ia",
		})
	}
	if ia.Answer != "" {
		out = append(out, Result{
			Title:   "Direct answer (" + ia.AnswerType + ")",
			Snippet: ia.Answer,
			URL:     ia.AbstractURL,
			Source:  "ddg-ia",
		})
	}
	if ia.Definition != "" && ia.DefinitionURL != "" {
		out = append(out, Result{
			Title:   "Definition",
			Snippet: ia.Definition,
			URL:     ia.DefinitionURL,
			Source:  "ddg-ia",
		})
	}
	for _, rt := range ia.RelatedTopics {
		if len(out) >= max {
			break
		}
		if rt.Text != "" && rt.FirstURL != "" {
			out = append(out, Result{
				Title:   firstSentence(rt.Text),
				Snippet: rt.Text,
				URL:     rt.FirstURL,
				Source:  "ddg-ia",
			})
		}
		for _, sub := range rt.Topics {
			if len(out) >= max {
				break
			}
			if sub.Text != "" && sub.FirstURL != "" {
				out = append(out, Result{
					Title:   firstSentence(sub.Text),
					Snippet: sub.Text,
					URL:     sub.FirstURL,
					Source:  "ddg-ia",
				})
			}
		}
	}
	return out, nil
}

// ── provider: DuckDuckGo HTML scrape (lite + classic fallback) ────────

func ddgHTML(ctx context.Context, query string, max int) ([]Result, error) {
	if r, err := ddgHTMLEndpoint(ctx, "https://html.duckduckgo.com/html/", query, max); err == nil && len(r) > 0 {
		return r, nil
	}
	return ddgHTMLEndpoint(ctx, "https://lite.duckduckgo.com/lite/", query, max)
}

func ddgHTMLEndpoint(ctx context.Context, endpoint, query string, max int) ([]Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	form := url.Values{"q": {query}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Referer", "https://duckduckgo.com/")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}
	return parseDDGHTML(string(body), max), nil
}

// parseDDGHTML walks the parsed HTML tree looking for <a class="result-link">,
// <a class="result__a">, or anything inside a row whose first <a> has
// rel="nofollow" (the lite layout). For each match we capture the next
// element with class "result-snippet" / "result__snippet" as the snippet.
func parseDDGHTML(htmlSrc string, max int) []Result {
	doc, err := html.Parse(strings.NewReader(htmlSrc))
	if err != nil {
		return nil
	}
	var out []Result
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if len(out) >= max {
			return
		}
		if n.Type == html.ElementNode && n.Data == "a" {
			class := attr(n, "class")
			href := attr(n, "href")
			rel := attr(n, "rel")
			isResultLink := strings.Contains(class, "result-link") ||
				strings.Contains(class, "result__a") ||
				strings.Contains(rel, "nofollow")
			if isResultLink && href != "" {
				title := strings.TrimSpace(textContent(n))
				resolved := resolveDDG(href)
				if title != "" && resolved != "" && !looksInternal(resolved) {
					snippet := findSibling(n, "result-snippet", "result__snippet")
					out = append(out, Result{
						Title:   title,
						Snippet: snippet,
						URL:     resolved,
						Source:  "ddg-html",
					})
					return // don't descend into the link itself
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
			if len(out) >= max {
				return
			}
		}
	}
	walk(doc)
	return out
}

func attr(n *html.Node, name string) string {
	for _, a := range n.Attr {
		if a.Key == name {
			return a.Val
		}
	}
	return ""
}

func textContent(n *html.Node) string {
	var sb strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			sb.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return collapseWS(sb.String())
}

// findSibling searches the surrounding subtree for a node whose class
// contains any of the given fragments and returns its text content.
func findSibling(start *html.Node, classes ...string) string {
	// Walk up to two parents, then search descendants.
	root := start
	for i := 0; i < 3 && root.Parent != nil; i++ {
		root = root.Parent
	}
	var found string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found != "" {
			return
		}
		if n.Type == html.ElementNode {
			class := attr(n, "class")
			for _, c := range classes {
				if strings.Contains(class, c) {
					found = strings.TrimSpace(textContent(n))
					return
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return found
}

func looksInternal(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return true
	}
	host := strings.ToLower(u.Host)
	return host == "" ||
		strings.HasSuffix(host, "duckduckgo.com") ||
		strings.HasSuffix(host, "duck.com")
}

// resolveDDG unwraps the //duckduckgo.com/l/?uddg=… redirect.
func resolveDDG(href string) string {
	if strings.HasPrefix(href, "//") {
		href = "https:" + href
	}
	u, err := url.Parse(href)
	if err != nil {
		return ""
	}
	if strings.Contains(u.Host, "duckduckgo.com") && (u.Path == "/l/" || u.Path == "/l") {
		if q := u.Query().Get("uddg"); q != "" {
			if dec, err := url.QueryUnescape(q); err == nil {
				return dec
			}
		}
	}
	return u.String()
}

// ── provider: Wikipedia REST search ───────────────────────────────────

type wikiSearchResp struct {
	Pages []struct {
		Title       string `json:"title"`
		Excerpt     string `json:"excerpt"`
		Description string `json:"description"`
		Key         string `json:"key"`
	} `json:"pages"`
}

func wikipediaSearch(ctx context.Context, query string, max int) ([]Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	u := fmt.Sprintf("https://en.wikipedia.org/w/rest.php/v1/search/page?q=%s&limit=%d",
		url.QueryEscape(query), max)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "home-server/1.0 (https://github.com/acanturgut/home-server)")
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return nil, err
	}
	var w wikiSearchResp
	if err := json.Unmarshal(body, &w); err != nil {
		return nil, err
	}
	out := make([]Result, 0, len(w.Pages))
	for _, p := range w.Pages {
		snippet := stripHTML(p.Excerpt)
		if snippet == "" {
			snippet = p.Description
		}
		out = append(out, Result{
			Title:   p.Title,
			Snippet: snippet,
			URL:     "https://en.wikipedia.org/wiki/" + url.PathEscape(p.Key),
			Source:  "wikipedia",
		})
	}
	return out, nil
}

// ── helpers ───────────────────────────────────────────────────────────

var (
	tagRE = regexp.MustCompile(`<[^>]+>`)
	wsRE  = regexp.MustCompile(`\s+`)
)

func stripHTML(s string) string {
	return collapseWS(tagRE.ReplaceAllString(s, ""))
}

func collapseWS(s string) string {
	return strings.TrimSpace(wsRE.ReplaceAllString(s, " "))
}

func firstSentence(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, ".!?"); i > 0 && i < 120 {
		return strings.TrimSpace(s[:i])
	}
	if len(s) > 100 {
		return strings.TrimSpace(s[:100]) + "…"
	}
	return s
}

func dedupe(in []Result) []Result {
	seen := map[string]bool{}
	out := make([]Result, 0, len(in))
	for _, r := range in {
		host := ""
		if u, err := url.Parse(r.URL); err == nil {
			host = strings.ToLower(u.Host)
		}
		key := host + "|" + r.Title
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, r)
	}
	return out
}

// ── tiny TTL cache ────────────────────────────────────────────────────

type cacheEntry struct {
	results []Result
	expires time.Time
}

var (
	cacheMu  sync.Mutex
	cacheMap = map[string]cacheEntry{}
	cacheTTL = 10 * time.Minute
)

func cacheKey(query string, max int) string {
	return fmt.Sprintf("%d|%s", max, strings.ToLower(strings.TrimSpace(query)))
}

func cacheGet(query string, max int) ([]Result, bool) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if e, ok := cacheMap[cacheKey(query, max)]; ok {
		if time.Now().Before(e.expires) {
			return e.results, true
		}
		delete(cacheMap, cacheKey(query, max))
	}
	return nil, false
}

func cachePut(query string, max int, results []Result) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	// Cheap eviction: cap at 200 entries.
	if len(cacheMap) > 200 {
		for k := range cacheMap {
			delete(cacheMap, k)
			if len(cacheMap) < 150 {
				break
			}
		}
	}
	cacheMap[cacheKey(query, max)] = cacheEntry{
		results: results,
		expires: time.Now().Add(cacheTTL),
	}
}
