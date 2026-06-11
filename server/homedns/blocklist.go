package homedns

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// BlocklistSource is one upstream hosts-format URL feeding the ad-blocker.
type BlocklistSource struct {
	Name        string    `json:"name"`
	URL         string    `json:"url"`
	Enabled     bool      `json:"enabled"`
	LastUpdated time.Time `json:"last_updated,omitempty"`
	LastError   string    `json:"last_error,omitempty"`
	Entries     int       `json:"entries"`
}

// BlocklistStatus is a snapshot for the UI.
type BlocklistStatus struct {
	Enabled       bool              `json:"enabled"`
	BlockedCount  int               `json:"blocked_count"`
	BlockedHits   uint64            `json:"blocked_hits"`
	LastRefreshed time.Time         `json:"last_refreshed,omitempty"`
	Sources       []BlocklistSource `json:"sources"`
	Refreshing    bool              `json:"refreshing"`
	Allowlist     []string          `json:"allowlist"`
}

// blocklist owns the merged blocked-domain set + source metadata.
//
// Entries are stored without a trailing dot, lowercase, and matched by both
// exact match and any parent-suffix (so "doubleclick.net" blocks
// "ad.doubleclick.net" too).
type blocklist struct {
	mu          sync.RWMutex
	path        string // sources file
	cachePath   string // merged set
	enabled     bool
	sources     []BlocklistSource
	blocked     map[string]struct{}
	allowlist   map[string]struct{} // domains that override blocked, suffix-matched
	lastRefresh time.Time
	refreshing  atomic.Bool
	hits        atomic.Uint64
}

// DefaultAllowlist contains domains commonly broken by aggressive blocklists.
// Notably YouTube serves video chunks from the same Google ad/analytics
// infrastructure, so blocking those domains breaks playback.
var DefaultAllowlist = []string{
	"googlevideo.com",
	"googleapis.com",
	"ytimg.com",
	"youtube.com",
	"youtu.be",
	"ggpht.com",
	"gstatic.com",
}

// DefaultBlocklistSources is the seed list applied when no sources are
// configured. Conservative pick of well-maintained lists.
var DefaultBlocklistSources = []BlocklistSource{
	{
		Name:    "StevenBlack unified",
		URL:     "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
		Enabled: true,
	},
}

func newBlocklist(sourcesPath, cachePath string) *blocklist {
	bl := &blocklist{
		path:      sourcesPath,
		cachePath: cachePath,
		enabled:   true,
		blocked:   map[string]struct{}{},
		allowlist: map[string]struct{}{},
	}
	bl.load()
	return bl
}

// isBlocked reports whether name (FQDN with or without trailing dot) matches
// the merged set, walking parent suffixes. Allowlisted suffixes always win.
func (b *blocklist) isBlocked(name string) bool {
	if !b.enabled {
		return false
	}
	n := strings.TrimSuffix(strings.ToLower(name), ".")
	if n == "" {
		return false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	// Allowlist takes precedence: walk parent suffixes too.
	for cur := n; cur != ""; {
		if _, ok := b.allowlist[cur]; ok {
			return false
		}
		i := strings.IndexByte(cur, '.')
		if i < 0 {
			break
		}
		cur = cur[i+1:]
	}
	for {
		if _, ok := b.blocked[n]; ok {
			return true
		}
		i := strings.IndexByte(n, '.')
		if i < 0 {
			return false
		}
		n = n[i+1:]
		if n == "" {
			return false
		}
	}
}

// status returns a UI snapshot.
func (b *blocklist) status() BlocklistStatus {
	b.mu.RLock()
	defer b.mu.RUnlock()
	allow := make([]string, 0, len(b.allowlist))
	for d := range b.allowlist {
		allow = append(allow, d)
	}
	sort.Strings(allow)
	return BlocklistStatus{
		Enabled:       b.enabled,
		BlockedCount:  len(b.blocked),
		BlockedHits:   b.hits.Load(),
		LastRefreshed: b.lastRefresh,
		Sources:       append([]BlocklistSource(nil), b.sources...),
		Refreshing:    b.refreshing.Load(),
		Allowlist:     allow,
	}
}

func (b *blocklist) addAllow(domain string) error {
	d := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(domain, ".")))
	if d == "" || !strings.ContainsRune(d, '.') {
		return errors.New("invalid domain")
	}
	b.mu.Lock()
	b.allowlist[d] = struct{}{}
	b.mu.Unlock()
	return b.saveSources()
}

func (b *blocklist) removeAllow(domain string) error {
	d := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(domain, ".")))
	b.mu.Lock()
	if _, ok := b.allowlist[d]; !ok {
		b.mu.Unlock()
		return errors.New("not allowlisted")
	}
	delete(b.allowlist, d)
	b.mu.Unlock()
	return b.saveSources()
}

func (b *blocklist) setEnabled(v bool) error {
	b.mu.Lock()
	b.enabled = v
	b.mu.Unlock()
	return b.saveSources()
}

func (b *blocklist) addSource(name, url string) error {
	url = strings.TrimSpace(url)
	if url == "" {
		return errors.New("url required")
	}
	if name == "" {
		name = url
	}
	b.mu.Lock()
	for _, s := range b.sources {
		if s.URL == url {
			b.mu.Unlock()
			return errors.New("source already exists")
		}
	}
	b.sources = append(b.sources, BlocklistSource{Name: name, URL: url, Enabled: true})
	b.mu.Unlock()
	return b.saveSources()
}

func (b *blocklist) removeSource(url string) error {
	b.mu.Lock()
	out := b.sources[:0]
	found := false
	for _, s := range b.sources {
		if s.URL == url {
			found = true
			continue
		}
		out = append(out, s)
	}
	b.sources = out
	b.mu.Unlock()
	if !found {
		return errors.New("source not found")
	}
	return b.saveSources()
}

func (b *blocklist) toggleSource(url string, enabled bool) error {
	b.mu.Lock()
	found := false
	for i := range b.sources {
		if b.sources[i].URL == url {
			b.sources[i].Enabled = enabled
			found = true
			break
		}
	}
	b.mu.Unlock()
	if !found {
		return errors.New("source not found")
	}
	return b.saveSources()
}

// refresh pulls every enabled source and rebuilds the merged set.
// Safe to call concurrently; only one refresh runs at a time.
func (b *blocklist) refresh(ctx context) {
	if !b.refreshing.CompareAndSwap(false, true) {
		return
	}
	defer b.refreshing.Store(false)

	b.mu.RLock()
	sources := append([]BlocklistSource(nil), b.sources...)
	b.mu.RUnlock()

	merged := map[string]struct{}{}
	client := &http.Client{Timeout: 30 * time.Second}

	for i := range sources {
		s := &sources[i]
		if !s.Enabled {
			s.Entries = 0
			s.LastError = ""
			continue
		}
		if ctx.cancelled() {
			return
		}
		count, err := fetchAndParse(client, s.URL, merged)
		s.LastUpdated = time.Now()
		s.Entries = count
		if err != nil {
			s.LastError = err.Error()
		} else {
			s.LastError = ""
		}
	}

	b.mu.Lock()
	b.sources = sources
	b.blocked = merged
	b.lastRefresh = time.Now()
	b.mu.Unlock()
	_ = b.saveSources()
	_ = b.saveCache()
}

// fetchAndParse downloads one hosts-format file and merges its domains into
// `into`. Returns the number of unique domains contributed by this source.
func fetchAndParse(client *http.Client, url string, into map[string]struct{}) (int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "home-server/1.0 (+adblock)")
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return 0, fmt.Errorf("http %d", resp.StatusCode)
	}

	added := 0
	scanner := bufio.NewScanner(io.LimitReader(resp.Body, 64<<20)) // 64 MiB cap
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		domain, ok := parseHostsLine(scanner.Text())
		if !ok {
			continue
		}
		if _, exists := into[domain]; !exists {
			into[domain] = struct{}{}
			added++
		}
	}
	return added, scanner.Err()
}

// parseHostsLine extracts a blockable domain from a single line of a hosts
// file. Accepts both classic hosts ("0.0.0.0 ads.example.com") and
// domain-only lists ("ads.example.com").
func parseHostsLine(line string) (string, bool) {
	if i := strings.IndexByte(line, '#'); i >= 0 {
		line = line[:i]
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return "", false
	}
	fields := strings.Fields(line)
	var domain string
	switch len(fields) {
	case 1:
		domain = fields[0]
	case 2:
		// "0.0.0.0 ads.example.com" or "127.0.0.1 ads.example.com"
		domain = fields[1]
	default:
		domain = fields[len(fields)-1]
	}
	domain = strings.ToLower(strings.TrimSuffix(domain, "."))
	// Skip loopback / localhost / broadcast entries some lists ship with.
	switch domain {
	case "", "localhost", "localhost.localdomain", "local",
		"broadcasthost", "ip6-localhost", "ip6-loopback",
		"ip6-localnet", "ip6-mcastprefix", "ip6-allnodes",
		"ip6-allrouters", "ip6-allhosts", "0.0.0.0":
		return "", false
	}
	// Reject anything with whitespace or invalid chars.
	for _, c := range domain {
		if c == ' ' || c == '\t' || c == '/' || c == '\\' {
			return "", false
		}
	}
	if !strings.ContainsRune(domain, '.') {
		return "", false
	}
	return domain, true
}

// ── Persistence ────────────────────────────────────────────────────────

type blocklistFile struct {
	Enabled   bool              `json:"enabled"`
	Sources   []BlocklistSource `json:"sources"`
	Allowlist []string          `json:"allowlist,omitempty"`
}

func (b *blocklist) load() {
	loaded := false
	if data, err := os.ReadFile(b.path); err == nil {
		var f blocklistFile
		if json.Unmarshal(data, &f) == nil {
			loaded = true
			b.enabled = f.Enabled
			b.sources = f.Sources
			for _, d := range f.Allowlist {
				b.allowlist[strings.ToLower(strings.TrimSuffix(strings.TrimSpace(d), "."))] = struct{}{}
			}
		}
	}
	if len(b.sources) == 0 {
		// First-run defaults.
		b.enabled = true
		b.sources = append([]BlocklistSource(nil), DefaultBlocklistSources...)
	}
	// Seed default allowlist on first run, OR top up an older file that
	// pre-dates the allowlist feature.
	if !loaded || len(b.allowlist) == 0 {
		for _, d := range DefaultAllowlist {
			b.allowlist[d] = struct{}{}
		}
	}
	_ = b.saveSources()
	if data, err := os.ReadFile(b.cachePath); err == nil {
		var domains []string
		if json.Unmarshal(data, &domains) == nil {
			set := make(map[string]struct{}, len(domains))
			for _, d := range domains {
				set[d] = struct{}{}
			}
			b.blocked = set
		}
	}
}

func (b *blocklist) saveSources() error {
	b.mu.RLock()
	allow := make([]string, 0, len(b.allowlist))
	for d := range b.allowlist {
		allow = append(allow, d)
	}
	sort.Strings(allow)
	f := blocklistFile{
		Enabled:   b.enabled,
		Sources:   append([]BlocklistSource(nil), b.sources...),
		Allowlist: allow,
	}
	b.mu.RUnlock()
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(b.path, data, 0644)
}

func (b *blocklist) saveCache() error {
	b.mu.RLock()
	domains := make([]string, 0, len(b.blocked))
	for d := range b.blocked {
		domains = append(domains, d)
	}
	b.mu.RUnlock()
	data, err := json.Marshal(domains)
	if err != nil {
		return err
	}
	return os.WriteFile(b.cachePath, data, 0644)
}

// context is a minimal cancellation token to avoid pulling context.Context
// into the hot path; refresh goroutines are short-lived anyway.
type context struct{ cancel <-chan struct{} }

func (c context) cancelled() bool {
	select {
	case <-c.cancel:
		return true
	default:
		return false
	}
}
