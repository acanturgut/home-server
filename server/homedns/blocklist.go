package homedns

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
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

// DefaultBlocklistSources is the seed list for a fresh install.
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
		blocked:   map[string]struct{}{},
		allowlist: map[string]struct{}{},
	}
	bl.load()
	return bl
}

// isBlocked reports whether name (FQDN with or without trailing dot) matches
// the merged set, walking parent suffixes. Allowlisted suffixes always win.
func (b *blocklist) isBlocked(name string) bool {
	n := strings.TrimSuffix(strings.ToLower(name), ".")
	if n == "" {
		return false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	if !b.enabled {
		return false
	}
	if matchSuffix(b.allowlist, n) {
		return false
	}
	return matchSuffix(b.blocked, n)
}

// matchSuffix reports whether n or any parent domain of n is in set.
func matchSuffix(set map[string]struct{}, n string) bool {
	for {
		if _, ok := set[n]; ok {
			return true
		}
		i := strings.IndexByte(n, '.')
		if i < 0 {
			return false
		}
		n = n[i+1:]
	}
}

// status returns a UI snapshot.
func (b *blocklist) status() BlocklistStatus {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return BlocklistStatus{
		Enabled:       b.enabled,
		BlockedCount:  len(b.blocked),
		BlockedHits:   b.hits.Load(),
		LastRefreshed: b.lastRefresh,
		Sources:       append([]BlocklistSource(nil), b.sources...),
		Refreshing:    b.refreshing.Load(),
		Allowlist:     b.allowlistLocked(),
	}
}

func (b *blocklist) allowlistLocked() []string {
	allow := make([]string, 0, len(b.allowlist))
	for d := range b.allowlist {
		allow = append(allow, d)
	}
	sort.Strings(allow)
	return allow
}

func normaliseDomain(domain string) string {
	return strings.ToLower(strings.TrimSuffix(strings.TrimSpace(domain), "."))
}

func (b *blocklist) addAllow(domain string) error {
	d := normaliseDomain(domain)
	if !strings.ContainsRune(d, '.') {
		return errors.New("invalid domain")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.allowlist[d] = struct{}{}
	return b.saveSourcesLocked()
}

func (b *blocklist) removeAllow(domain string) error {
	d := normaliseDomain(domain)
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.allowlist[d]; !ok {
		return errors.New("not allowlisted")
	}
	delete(b.allowlist, d)
	return b.saveSourcesLocked()
}

func (b *blocklist) setEnabled(v bool) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.enabled = v
	return b.saveSourcesLocked()
}

func (b *blocklist) addSource(name, rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if u, err := url.Parse(rawURL); err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return errors.New("url must be an http(s) URL")
	}
	if name == "" {
		name = rawURL
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, s := range b.sources {
		if s.URL == rawURL {
			return errors.New("source already exists")
		}
	}
	b.sources = append(b.sources, BlocklistSource{Name: name, URL: rawURL, Enabled: true})
	return b.saveSourcesLocked()
}

func (b *blocklist) removeSource(rawURL string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, s := range b.sources {
		if s.URL == rawURL {
			b.sources = append(b.sources[:i:i], b.sources[i+1:]...)
			return b.saveSourcesLocked()
		}
	}
	return errors.New("source not found")
}

func (b *blocklist) toggleSource(rawURL string, enabled bool) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := range b.sources {
		if b.sources[i].URL == rawURL {
			b.sources[i].Enabled = enabled
			return b.saveSourcesLocked()
		}
	}
	return errors.New("source not found")
}

// refresh downloads every enabled source and rebuilds the merged set. If any
// download fails, the previous set stays active (stale beats empty when the
// network is down at boot); the errors show on the sources. Only one refresh
// runs at a time.
func (b *blocklist) refresh(ctx context.Context) {
	if !b.refreshing.CompareAndSwap(false, true) {
		return
	}
	defer b.refreshing.Store(false)

	b.mu.RLock()
	sources := append([]BlocklistSource(nil), b.sources...)
	b.mu.RUnlock()

	merged := map[string]struct{}{}
	client := &http.Client{Timeout: 30 * time.Second}
	failed := false
	results := map[string]BlocklistSource{} // by URL
	for _, s := range sources {
		if !s.Enabled {
			continue
		}
		count, err := fetchAndParse(ctx, client, s.URL, merged)
		if ctx.Err() != nil {
			return
		}
		s.LastUpdated, s.Entries, s.LastError = time.Now(), count, ""
		if err != nil {
			failed = true
			s.Entries, s.LastError = 0, err.Error()
		}
		results[s.URL] = s
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	// Merge metadata into the current list so edits made during the download
	// aren't lost.
	for i := range b.sources {
		if r, ok := results[b.sources[i].URL]; ok {
			b.sources[i].LastUpdated, b.sources[i].Entries, b.sources[i].LastError = r.LastUpdated, r.Entries, r.LastError
		}
	}
	if err := b.saveSourcesLocked(); err != nil {
		logger.Error("blocklist: " + err.Error())
	}
	if failed {
		return
	}
	b.blocked = merged
	b.lastRefresh = time.Now()
	domains := make([]string, 0, len(merged))
	for d := range merged {
		domains = append(domains, d)
	}
	if err := jsonfile.Save(b.cachePath, domains); err != nil {
		logger.Error("blocklist cache: " + err.Error())
	}
}

// fetchAndParse downloads one hosts-format file and merges its domains into
// `into`. Returns the number of unique domains contributed by this source.
func fetchAndParse(ctx context.Context, client *http.Client, rawURL string, into map[string]struct{}) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
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
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return "", false
	}
	domain := strings.ToLower(strings.TrimSuffix(fields[len(fields)-1], "."))
	// Skip loopback / localhost / broadcast entries some lists ship with.
	switch domain {
	case "localhost", "localhost.localdomain", "local",
		"broadcasthost", "ip6-localhost", "ip6-loopback",
		"ip6-localnet", "ip6-mcastprefix", "ip6-allnodes",
		"ip6-allrouters", "ip6-allhosts", "0.0.0.0":
		return "", false
	}
	if strings.ContainsAny(domain, "/\\") || !strings.ContainsRune(domain, '.') {
		return "", false
	}
	return domain, true
}

// ── Persistence ────────────────────────────────────────────────────────

type blocklistFile struct {
	Enabled bool              `json:"enabled"`
	Sources []BlocklistSource `json:"sources"`
	// Allowlist is nil in files written before the allowlist existed.
	Allowlist []string `json:"allowlist"`
}

// load reads the sources file, seeding defaults only on a fresh install (or
// the allowlist for a file that predates it), then the cached merged set.
func (b *blocklist) load() {
	var f *blocklistFile
	if err := jsonfile.Load(b.path, &f); err != nil {
		logger.Error("blocklist: " + err.Error())
	}
	seeded := f == nil || f.Allowlist == nil
	if f == nil {
		f = &blocklistFile{Enabled: true, Sources: append([]BlocklistSource(nil), DefaultBlocklistSources...)}
	}
	if f.Allowlist == nil {
		f.Allowlist = DefaultAllowlist
	}
	b.enabled, b.sources = f.Enabled, f.Sources
	for _, d := range f.Allowlist {
		b.allowlist[normaliseDomain(d)] = struct{}{}
	}
	if seeded {
		if err := b.saveSourcesLocked(); err != nil {
			logger.Error("blocklist: " + err.Error())
		}
	}

	var domains []string
	if err := jsonfile.Load(b.cachePath, &domains); err != nil {
		logger.Error("blocklist cache: " + err.Error())
	}
	for _, d := range domains {
		b.blocked[d] = struct{}{}
	}
}

func (b *blocklist) saveSourcesLocked() error {
	return jsonfile.Save(b.path, blocklistFile{
		Enabled:   b.enabled,
		Sources:   b.sources,
		Allowlist: b.allowlistLocked(),
	})
}
