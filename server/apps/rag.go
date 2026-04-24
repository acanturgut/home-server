package apps

import (
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// ── Minimal TF-IDF RAG over generated app project files ─────────────────
//
// Indexes every small text file under data/apps/** and lets chat search the
// corpus for relevant snippets.  The index is rebuilt on demand (with a 60s
// cache) so we always reflect the current state of the apps directory.

type ragDoc struct {
	Path    string         // workspace-relative path ("apps/<name>/main.go")
	App     string         // app name
	Body    string         // full file text
	terms   map[string]int // token → count
	termSum int            // total tokens in doc
}

type RAGIndex struct {
	mu      sync.RWMutex
	appsDir string
	docs    []*ragDoc
	df      map[string]int // document frequency
	built   time.Time
}

func NewRAGIndex(appsDir string) *RAGIndex {
	return &RAGIndex{appsDir: appsDir, df: map[string]int{}}
}

var ragTokenRe = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]{1,}`)

func tokenize(s string) []string {
	raw := ragTokenRe.FindAllString(strings.ToLower(s), -1)
	out := raw[:0]
	for _, t := range raw {
		if len(t) < 3 || len(t) > 40 {
			continue
		}
		out = append(out, t)
	}
	return out
}

func isTextFile(name string) bool {
	lower := strings.ToLower(name)
	// Always skip binaries and heavy paths.
	skips := []string{"/node_modules/", "/.git/", "/dist/", "/build/", "/target/", "/.next/", "/vendor/"}
	for _, s := range skips {
		if strings.Contains(lower, s) {
			return false
		}
	}
	exts := []string{
		".go", ".mod", ".sum", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
		".toml", ".md", ".txt", ".py", ".rs", ".sh", ".env", ".html", ".css", ".sql",
	}
	for _, e := range exts {
		if strings.HasSuffix(lower, e) {
			return true
		}
	}
	// also match common unextensioned files
	base := filepath.Base(lower)
	known := map[string]bool{"dockerfile": true, "makefile": true, ".dockerignore": true, ".gitignore": true}
	return known[base]
}

// Rebuild walks the apps directory and rebuilds the document list.
func (r *RAGIndex) Rebuild() error {
	docs := []*ragDoc{}
	df := map[string]int{}
	err := filepath.WalkDir(r.appsDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil // skip unreadable
		}
		if d.IsDir() {
			name := d.Name()
			if name == "node_modules" || name == ".git" || name == "dist" || name == "build" || name == "target" {
				return filepath.SkipDir
			}
			return nil
		}
		if !isTextFile(path) {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > 256*1024 {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		body := string(data)
		tokens := tokenize(body)
		if len(tokens) == 0 {
			return nil
		}
		terms := map[string]int{}
		for _, t := range tokens {
			terms[t]++
		}
		rel, _ := filepath.Rel(filepath.Dir(r.appsDir), path)
		appName := ""
		parts := strings.SplitN(strings.TrimPrefix(rel, "apps/"), string(filepath.Separator), 2)
		if len(parts) > 0 {
			appName = parts[0]
		}
		docs = append(docs, &ragDoc{
			Path:    rel,
			App:     appName,
			Body:    body,
			terms:   terms,
			termSum: len(tokens),
		})
		for t := range terms {
			df[t]++
		}
		return nil
	})
	if err != nil {
		return err
	}
	r.mu.Lock()
	r.docs = docs
	r.df = df
	r.built = time.Now()
	r.mu.Unlock()
	return nil
}

// RAGHit is a single search result.
type RAGHit struct {
	Path    string  `json:"path"`
	App     string  `json:"app"`
	Score   float64 `json:"score"`
	Snippet string  `json:"snippet"`
}

// Search returns the top-k documents for query q, with a short snippet from
// the first matching line (±2 lines of context).
func (r *RAGIndex) Search(q string, k int) ([]RAGHit, error) {
	r.mu.RLock()
	stale := time.Since(r.built) > 60*time.Second || len(r.docs) == 0
	r.mu.RUnlock()
	if stale {
		if err := r.Rebuild(); err != nil {
			return nil, err
		}
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	qTokens := tokenize(q)
	if len(qTokens) == 0 {
		return nil, nil
	}
	type scored struct {
		d     *ragDoc
		score float64
	}
	N := float64(len(r.docs))
	results := make([]scored, 0, len(r.docs))
	for _, d := range r.docs {
		var s float64
		for _, t := range qTokens {
			tf, ok := d.terms[t]
			if !ok {
				continue
			}
			dfv := r.df[t]
			if dfv == 0 {
				continue
			}
			idf := 1 + logBase(N/float64(dfv))
			s += (float64(tf) / float64(d.termSum)) * idf
		}
		if s > 0 {
			results = append(results, scored{d, s})
		}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].score > results[j].score })
	if k <= 0 {
		k = 5
	}
	if len(results) > k {
		results = results[:k]
	}
	out := make([]RAGHit, 0, len(results))
	for _, s := range results {
		out = append(out, RAGHit{
			Path:    s.d.Path,
			App:     s.d.App,
			Score:   s.score,
			Snippet: snippetFor(s.d.Body, qTokens),
		})
	}
	return out, nil
}

// snippetFor returns ~6 lines centered on the first matching line.
func snippetFor(body string, terms []string) string {
	lines := strings.Split(body, "\n")
	hit := -1
	lower := strings.ToLower(body)
	pos := -1
	for _, t := range terms {
		if p := strings.Index(lower, t); p >= 0 {
			if pos < 0 || p < pos {
				pos = p
			}
		}
	}
	if pos >= 0 {
		// count newlines before pos
		hit = strings.Count(lower[:pos], "\n")
	}
	if hit < 0 {
		if len(lines) > 6 {
			lines = lines[:6]
		}
		return strings.Join(lines, "\n")
	}
	start := hit - 2
	if start < 0 {
		start = 0
	}
	end := hit + 4
	if end > len(lines) {
		end = len(lines)
	}
	return strings.Join(lines[start:end], "\n")
}

func logBase(x float64) float64 {
	if x <= 0 {
		return 0
	}
	return math.Log(x)
}
