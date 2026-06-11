// Package homedns is a tiny authoritative+forwarding DNS server for the LAN.
//
// Records are persisted to <DATA_DIR>/dns_records.json. Anything we can answer
// from the local store is served as authoritative; everything else is
// forwarded to the configured upstreams (default 1.1.1.1, 9.9.9.9).
//
// Designed for a home network with the ASUS router pointing DHCP DNS at the
// home-server LAN IP. The container runs in `network_mode: host`, so the Go
// process can bind UDP/TCP :53 directly.
package homedns

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/miekg/dns"
)

// Record is one user-defined DNS record. Type is one of A, AAAA, CNAME.
// Name is normalised to a fully-qualified lowercase domain (trailing dot).
type Record struct {
	Name  string `json:"name"`  // "canshome.com." (FQDN, lowercase)
	Type  string `json:"type"`  // A | AAAA | CNAME
	Value string `json:"value"` // IP or target FQDN
	TTL   uint32 `json:"ttl,omitempty"`
}

// Status is a snapshot for the UI.
type Status struct {
	Running     bool      `json:"running"`
	BindAddr    string    `json:"bind_addr"`
	Upstreams   []string  `json:"upstreams"`
	StartedAt   time.Time `json:"started_at,omitempty"`
	LastError   string    `json:"last_error,omitempty"`
	Queries     uint64    `json:"queries"`
	LocalHits   uint64    `json:"local_hits"`
	Forwarded   uint64    `json:"forwarded"`
	UpstreamErr uint64    `json:"upstream_errors"`
	BlockedHits uint64    `json:"blocked_hits"`
	RecordCount int       `json:"record_count"`
}

// Server is a UDP+TCP DNS server with a JSON-backed record store.
//
// All public methods are safe for concurrent use.
type Server struct {
	mu        sync.RWMutex
	path      string
	records   []Record
	upstreams []string
	bindAddr  string
	udp       *dns.Server
	tcp       *dns.Server
	startedAt time.Time
	lastErr   atomic.Value // string

	blocklist *blocklist
	stop      chan struct{}

	cQueries     atomic.Uint64
	cLocalHits   atomic.Uint64
	cForwarded   atomic.Uint64
	cUpstreamErr atomic.Uint64
}

// New loads any persisted records from dataDir and returns an unstarted server.
//
// bindAddr is "host:port", e.g. ":53". upstreams is a list of upstream
// resolvers (host:port form, defaults applied if nil).
func New(dataDir, bindAddr string, upstreams []string) *Server {
	if bindAddr == "" {
		bindAddr = ":53"
	}
	if len(upstreams) == 0 {
		upstreams = []string{"1.1.1.1:53", "9.9.9.9:53"}
	}
	_ = os.MkdirAll(dataDir, 0755)
	s := &Server{
		path:      filepath.Join(dataDir, "dns_records.json"),
		bindAddr:  bindAddr,
		upstreams: upstreams,
		stop:      make(chan struct{}),
	}
	s.lastErr.Store("")
	s.load()
	s.blocklist = newBlocklist(
		filepath.Join(dataDir, "dns_blocklist_sources.json"),
		filepath.Join(dataDir, "dns_blocklist_cache.json"),
	)
	return s
}

// Records returns a copy of the current record list.
func (s *Server) Records() []Record {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Record, len(s.records))
	copy(out, s.records)
	return out
}

// SetRecords replaces the entire record set, persists to disk, and applies it.
func (s *Server) SetRecords(records []Record) error {
	cleaned := make([]Record, 0, len(records))
	for _, r := range records {
		nr, err := normaliseRecord(r)
		if err != nil {
			return err
		}
		cleaned = append(cleaned, nr)
	}
	s.mu.Lock()
	s.records = cleaned
	s.mu.Unlock()
	return s.save()
}

// AddRecord appends a new record. Duplicates (same name+type+value) are ignored.
func (s *Server) AddRecord(r Record) error {
	nr, err := normaliseRecord(r)
	if err != nil {
		return err
	}
	s.mu.Lock()
	for _, existing := range s.records {
		if existing.Name == nr.Name && existing.Type == nr.Type && existing.Value == nr.Value {
			s.mu.Unlock()
			return nil
		}
	}
	s.records = append(s.records, nr)
	s.mu.Unlock()
	return s.save()
}

// DeleteRecord removes the first record matching name+type (+value if non-empty).
func (s *Server) DeleteRecord(name, typ, value string) error {
	name = canonicalName(name)
	typ = strings.ToUpper(typ)
	value = strings.TrimSpace(value)
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, r := range s.records {
		if r.Name == name && r.Type == typ && (value == "" || r.Value == value) {
			s.records = append(s.records[:i], s.records[i+1:]...)
			return s.saveLocked()
		}
	}
	return errors.New("not found")
}

// Status returns a snapshot for the UI.
func (s *Server) Status() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st := Status{
		Running:     s.udp != nil,
		BindAddr:    s.bindAddr,
		Upstreams:   append([]string(nil), s.upstreams...),
		StartedAt:   s.startedAt,
		Queries:     s.cQueries.Load(),
		LocalHits:   s.cLocalHits.Load(),
		Forwarded:   s.cForwarded.Load(),
		UpstreamErr: s.cUpstreamErr.Load(),
		RecordCount: len(s.records),
	}
	if s.blocklist != nil {
		st.BlockedHits = s.blocklist.hits.Load()
	}
	if v, ok := s.lastErr.Load().(string); ok {
		st.LastError = v
	}
	return st
}

// Start binds UDP+TCP on bindAddr. Non-blocking; returns the first bind error.
//
// On a host-network container this gives you canonical port-53 service for
// the whole LAN. If the host already runs systemd-resolved on :53 the bind
// will fail — surface that to the user via Status().LastError.
func (s *Server) Start() error {
	mux := dns.NewServeMux()
	mux.HandleFunc(".", s.handle)

	udp := &dns.Server{Addr: s.bindAddr, Net: "udp", Handler: mux}
	tcp := &dns.Server{Addr: s.bindAddr, Net: "tcp", Handler: mux}

	udpReady := make(chan error, 1)
	tcpReady := make(chan error, 1)
	udp.NotifyStartedFunc = func() { udpReady <- nil }
	tcp.NotifyStartedFunc = func() { tcpReady <- nil }

	go func() {
		if err := udp.ListenAndServe(); err != nil {
			s.lastErr.Store("udp: " + err.Error())
			udpReady <- err
		}
	}()
	go func() {
		if err := tcp.ListenAndServe(); err != nil {
			s.lastErr.Store("tcp: " + err.Error())
			tcpReady <- err
		}
	}()

	select {
	case err := <-udpReady:
		if err != nil {
			return fmt.Errorf("udp bind %s: %w", s.bindAddr, err)
		}
	case <-time.After(2 * time.Second):
	}
	select {
	case err := <-tcpReady:
		if err != nil {
			return fmt.Errorf("tcp bind %s: %w", s.bindAddr, err)
		}
	case <-time.After(2 * time.Second):
	}

	s.mu.Lock()
	s.udp = udp
	s.tcp = tcp
	s.startedAt = time.Now()
	s.mu.Unlock()

	// Kick off an initial blocklist refresh in the background, then auto-
	// refresh every 24h.
	go s.blocklist.refresh(context{cancel: s.stop})
	go s.blocklistRefreshLoop()
	return nil
}

func (s *Server) blocklistRefreshLoop() {
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-t.C:
			s.blocklist.refresh(context{cancel: s.stop})
		}
	}
}

// Stop shuts down both listeners.
func (s *Server) Stop() {
	s.mu.Lock()
	udp, tcp := s.udp, s.tcp
	s.udp, s.tcp = nil, nil
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
	s.mu.Unlock()
	if udp != nil {
		_ = udp.Shutdown()
	}
	if tcp != nil {
		_ = tcp.Shutdown()
	}
}

// ── DNS handler ─────────────────────────────────────────────────────────

func (s *Server) handle(w dns.ResponseWriter, r *dns.Msg) {
	s.cQueries.Add(1)
	if len(r.Question) == 0 {
		_ = w.WriteMsg(emptyReply(r, dns.RcodeFormatError))
		return
	}
	q := r.Question[0]
	name := strings.ToLower(q.Name)

	// Ad-blocker: short-circuit with NXDOMAIN.
	if s.blocklist != nil && s.blocklist.isBlocked(name) {
		s.blocklist.hits.Add(1)
		m := new(dns.Msg)
		m.SetReply(r)
		m.Rcode = dns.RcodeNameError
		_ = w.WriteMsg(m)
		return
	}

	if local := s.answerLocal(q, name); local != nil {
		s.cLocalHits.Add(1)
		m := new(dns.Msg)
		m.SetReply(r)
		m.Authoritative = true
		m.Answer = local
		_ = w.WriteMsg(m)
		return
	}

	// Forward.
	for _, up := range s.upstreams {
		c := new(dns.Client)
		c.Timeout = 3 * time.Second
		resp, _, err := c.Exchange(r, up)
		if err == nil && resp != nil {
			s.cForwarded.Add(1)
			_ = w.WriteMsg(resp)
			return
		}
	}
	s.cUpstreamErr.Add(1)
	_ = w.WriteMsg(emptyReply(r, dns.RcodeServerFailure))
}

// answerLocal returns RRs from the store that match the question, or nil.
// Includes simple CNAME chasing within the local store for one level.
func (s *Server) answerLocal(q dns.Question, name string) []dns.RR {
	s.mu.RLock()
	recs := s.records
	s.mu.RUnlock()

	wanted := dns.TypeToString[q.Qtype]
	var out []dns.RR
	for _, r := range recs {
		if r.Name != name {
			continue
		}
		if wanted == r.Type ||
			(wanted == "A" && r.Type == "CNAME") ||
			(wanted == "AAAA" && r.Type == "CNAME") {
			rr, err := buildRR(r)
			if err == nil {
				out = append(out, rr)
				// One-level CNAME chase for matching A/AAAA below the alias.
				if r.Type == "CNAME" {
					target := canonicalName(r.Value)
					for _, r2 := range recs {
						if r2.Name == target && r2.Type == wanted {
							if rr2, err := buildRR(r2); err == nil {
								out = append(out, rr2)
							}
						}
					}
				}
			}
		}
	}
	return out
}

func emptyReply(r *dns.Msg, rcode int) *dns.Msg {
	m := new(dns.Msg)
	m.SetReply(r)
	m.Rcode = rcode
	return m
}

func buildRR(r Record) (dns.RR, error) {
	ttl := r.TTL
	if ttl == 0 {
		ttl = 300
	}
	switch r.Type {
	case "A":
		return dns.NewRR(fmt.Sprintf("%s %d IN A %s", r.Name, ttl, r.Value))
	case "AAAA":
		return dns.NewRR(fmt.Sprintf("%s %d IN AAAA %s", r.Name, ttl, r.Value))
	case "CNAME":
		return dns.NewRR(fmt.Sprintf("%s %d IN CNAME %s", r.Name, ttl, canonicalName(r.Value)))
	}
	return nil, fmt.Errorf("unsupported type %q", r.Type)
}

// ── Persistence ─────────────────────────────────────────────────────────

func (s *Server) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var recs []Record
	if json.Unmarshal(data, &recs) != nil {
		return
	}
	cleaned := make([]Record, 0, len(recs))
	for _, r := range recs {
		nr, err := normaliseRecord(r)
		if err != nil {
			continue
		}
		cleaned = append(cleaned, nr)
	}
	s.records = cleaned
}

func (s *Server) save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.saveLocked()
}

func (s *Server) saveLocked() error {
	data, err := json.MarshalIndent(s.records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// ── Helpers ─────────────────────────────────────────────────────────────

func canonicalName(n string) string {
	n = strings.ToLower(strings.TrimSpace(n))
	if n == "" {
		return ""
	}
	if !strings.HasSuffix(n, ".") {
		n += "."
	}
	return n
}

func normaliseRecord(r Record) (Record, error) {
	r.Name = canonicalName(r.Name)
	r.Type = strings.ToUpper(strings.TrimSpace(r.Type))
	r.Value = strings.TrimSpace(r.Value)
	if r.Name == "" || r.Name == "." {
		return r, errors.New("name required")
	}
	switch r.Type {
	case "A":
		ip := net.ParseIP(r.Value)
		if ip == nil || ip.To4() == nil {
			return r, fmt.Errorf("A record value %q is not an IPv4 address", r.Value)
		}
	case "AAAA":
		ip := net.ParseIP(r.Value)
		if ip == nil || ip.To4() != nil {
			return r, fmt.Errorf("AAAA record value %q is not an IPv6 address", r.Value)
		}
	case "CNAME":
		if r.Value == "" {
			return r, errors.New("CNAME value required")
		}
		r.Value = canonicalName(r.Value)
	default:
		return r, fmt.Errorf("unsupported record type %q (use A, AAAA, CNAME)", r.Type)
	}
	if r.TTL == 0 {
		r.TTL = 300
	}
	return r, nil
}

// SeedDefault adds a record only if no record currently exists for that name.
// Used on first run to point canshome.com → the home-server LAN IP.
func (s *Server) SeedDefault(r Record) {
	nr, err := normaliseRecord(r)
	if err != nil {
		return
	}
	s.mu.Lock()
	for _, existing := range s.records {
		if existing.Name == nr.Name {
			s.mu.Unlock()
			return
		}
	}
	s.records = append(s.records, nr)
	s.mu.Unlock()
	_ = s.save()
}
