// Package homedns is a tiny authoritative+forwarding DNS server for the LAN.
//
// Records are persisted to <DATA_DIR>/dns_records.json. Anything we can answer
// from the local store is served as authoritative; everything else is
// forwarded to the configured upstreams (default 1.1.1.1, 9.9.9.9). Only
// clients on private, loopback, link-local or CGNAT addresses get answers, so
// the server can't be abused as an open resolver if :53 is ever exposed.
//
// Designed for a home network with the ASUS router pointing DHCP DNS at the
// home-server LAN IP. The container runs in `network_mode: host`, so the Go
// process can bind UDP/TCP :53 directly.
package homedns

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
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

// cgnat is 100.64.0.0/10 (Tailscale and carrier-grade NAT clients).
var cgnat = netip.MustParsePrefix("100.64.0.0/10")

// Server is a UDP+TCP DNS server with a JSON-backed record store.
//
// All public methods are safe for concurrent use. records is copy-on-write:
// mutations swap in a new slice, so readers may iterate a snapshot unlocked.
type Server struct {
	mu        sync.RWMutex
	path      string
	records   []Record
	upstreams []string
	bindAddr  string
	client    *dns.Client
	udp       *dns.Server
	tcp       *dns.Server
	startedAt time.Time
	lastErr   atomic.Value // string

	blocklist *blocklist
	ctx       context.Context // cancelled by Stop
	cancel    context.CancelFunc

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
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		path:      filepath.Join(dataDir, "dns_records.json"),
		bindAddr:  bindAddr,
		upstreams: upstreams,
		client:    &dns.Client{Timeout: 3 * time.Second},
		ctx:       ctx,
		cancel:    cancel,
		blocklist: newBlocklist(
			filepath.Join(dataDir, "dns_blocklist_sources.json"),
			filepath.Join(dataDir, "dns_blocklist_cache.json"),
		),
	}
	s.lastErr.Store("")
	s.load()
	return s
}

// Records returns a copy of the current record list.
func (s *Server) Records() []Record {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]Record(nil), s.records...)
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
	defer s.mu.Unlock()
	return s.replaceLocked(cleaned)
}

// AddRecord appends a new record. Duplicates (same name+type+value) are ignored.
func (s *Server) AddRecord(r Record) error {
	nr, err := normaliseRecord(r)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.records {
		if existing.Name == nr.Name && existing.Type == nr.Type && existing.Value == nr.Value {
			return nil
		}
	}
	return s.replaceLocked(append(append([]Record(nil), s.records...), nr))
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
			next := append(append([]Record(nil), s.records[:i]...), s.records[i+1:]...)
			return s.replaceLocked(next)
		}
	}
	return errors.New("not found")
}

// SeedDefault adds a record only if no record currently exists for that name.
// Used on first run to point canshome.com → the home-server LAN IP.
func (s *Server) SeedDefault(r Record) {
	nr, err := normaliseRecord(r)
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.records {
		if existing.Name == nr.Name {
			return
		}
	}
	if err := s.replaceLocked(append(append([]Record(nil), s.records...), nr)); err != nil {
		logger.Error("homedns: " + err.Error())
	}
}

// replaceLocked persists next, then makes it the live record set.
func (s *Server) replaceLocked(next []Record) error {
	if err := jsonfile.Save(s.path, next); err != nil {
		return err
	}
	s.records = next
	return nil
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
		BlockedHits: s.blocklist.hits.Load(),
		RecordCount: len(s.records),
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

	go s.blocklistRefreshLoop()
	return nil
}

// blocklistRefreshLoop refreshes the ad-block lists now and every 24h.
func (s *Server) blocklistRefreshLoop() {
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		s.blocklist.refresh(s.ctx)
		select {
		case <-s.ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Stop shuts down both listeners and any running blocklist refresh.
func (s *Server) Stop() {
	s.cancel()
	s.mu.Lock()
	udp, tcp := s.udp, s.tcp
	s.udp, s.tcp = nil, nil
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
	if !allowedClient(w.RemoteAddr()) {
		_ = w.WriteMsg(emptyReply(r, dns.RcodeRefused))
		return
	}
	if len(r.Question) == 0 {
		_ = w.WriteMsg(emptyReply(r, dns.RcodeFormatError))
		return
	}
	q := r.Question[0]
	name := strings.ToLower(q.Name)

	// Ad-blocker: short-circuit with NXDOMAIN.
	if s.blocklist.isBlocked(name) {
		s.blocklist.hits.Add(1)
		_ = w.WriteMsg(emptyReply(r, dns.RcodeNameError))
		return
	}

	// A name we hold records for is answered locally even when no record
	// matches the type (NODATA), so e.g. an AAAA lookup for an A-only name
	// doesn't come back NXDOMAIN from upstream.
	if answer, owned := s.answerLocal(q, name); owned {
		s.cLocalHits.Add(1)
		m := emptyReply(r, dns.RcodeSuccess)
		m.Authoritative = true
		m.Answer = answer
		_ = w.WriteMsg(m)
		return
	}

	for _, up := range s.upstreams {
		resp, _, err := s.client.Exchange(r, up)
		if err == nil && resp != nil {
			s.cForwarded.Add(1)
			_ = w.WriteMsg(resp)
			return
		}
	}
	s.cUpstreamErr.Add(1)
	_ = w.WriteMsg(emptyReply(r, dns.RcodeServerFailure))
}

func allowedClient(addr net.Addr) bool {
	ap, err := netip.ParseAddrPort(addr.String())
	if err != nil {
		return false
	}
	ip := ap.Addr().Unmap()
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || cgnat.Contains(ip)
}

// answerLocal returns RRs from the store that match the question and whether
// any local record exists for name. Chases CNAMEs one level within the store.
func (s *Server) answerLocal(q dns.Question, name string) (answer []dns.RR, owned bool) {
	s.mu.RLock()
	recs := s.records // copy-on-write snapshot
	s.mu.RUnlock()

	wanted := dns.TypeToString[q.Qtype]
	for _, r := range recs {
		if r.Name != name {
			continue
		}
		owned = true
		isAddr := wanted == "A" || wanted == "AAAA"
		if r.Type != wanted && !(isAddr && r.Type == "CNAME") {
			continue
		}
		answer = append(answer, buildRR(r))
		if r.Type == "CNAME" {
			target := canonicalName(r.Value)
			for _, r2 := range recs {
				if r2.Name == target && r2.Type == wanted {
					answer = append(answer, buildRR(r2))
				}
			}
		}
	}
	return answer, owned
}

func emptyReply(r *dns.Msg, rcode int) *dns.Msg {
	m := new(dns.Msg)
	m.SetRcode(r, rcode)
	return m
}

// buildRR converts a normalised record (see normaliseRecord) into an RR.
func buildRR(r Record) dns.RR {
	hdr := dns.RR_Header{Name: r.Name, Class: dns.ClassINET, Ttl: r.TTL}
	switch r.Type {
	case "A":
		hdr.Rrtype = dns.TypeA
		return &dns.A{Hdr: hdr, A: net.ParseIP(r.Value).To4()}
	case "AAAA":
		hdr.Rrtype = dns.TypeAAAA
		return &dns.AAAA{Hdr: hdr, AAAA: net.ParseIP(r.Value)}
	default: // CNAME
		hdr.Rrtype = dns.TypeCNAME
		return &dns.CNAME{Hdr: hdr, Target: r.Value}
	}
}

// ── Persistence ─────────────────────────────────────────────────────────

func (s *Server) load() {
	var recs []Record
	if err := jsonfile.Load(s.path, &recs); err != nil {
		logger.Error("homedns: " + err.Error())
	}
	for _, r := range recs {
		nr, err := normaliseRecord(r)
		if err != nil {
			logger.Error(fmt.Sprintf("homedns: dropping invalid record %s %s: %v", r.Name, r.Type, err))
			continue
		}
		s.records = append(s.records, nr)
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────

func canonicalName(n string) string {
	n = strings.ToLower(strings.TrimSpace(n))
	if n == "" {
		return ""
	}
	return dns.Fqdn(n)
}

// labelRE is one hostname label (letters, digits, hyphens; underscores for
// service names like _sip).
var labelRE = regexp.MustCompile(`^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$`)

// validName reports whether a canonical (lowercase, trailing-dot) name is a
// well-formed hostname.
func validName(fqdn string) bool {
	n := strings.TrimSuffix(fqdn, ".")
	if n == "" || len(n) > 253 {
		return false
	}
	for _, label := range strings.Split(n, ".") {
		if !labelRE.MatchString(label) {
			return false
		}
	}
	return true
}

func normaliseRecord(r Record) (Record, error) {
	r.Name = canonicalName(r.Name)
	r.Type = strings.ToUpper(strings.TrimSpace(r.Type))
	r.Value = strings.TrimSpace(r.Value)
	if r.Name == "" || r.Name == "." {
		return r, errors.New("name required")
	}
	if !validName(r.Name) {
		return r, fmt.Errorf("%q is not a valid domain name", r.Name)
	}
	switch r.Type {
	case "A":
		ip := net.ParseIP(r.Value)
		if ip == nil || ip.To4() == nil {
			return r, fmt.Errorf("value %q for A record is not an IPv4 address", r.Value)
		}
	case "AAAA":
		ip := net.ParseIP(r.Value)
		if ip == nil || ip.To4() != nil {
			return r, fmt.Errorf("value %q for AAAA record is not an IPv6 address", r.Value)
		}
	case "CNAME":
		r.Value = canonicalName(r.Value)
		if !validName(r.Value) {
			return r, errors.New("CNAME target must be a valid domain name")
		}
	default:
		return r, fmt.Errorf("unsupported record type %q (use A, AAAA, CNAME)", r.Type)
	}
	if r.TTL == 0 {
		r.TTL = 300
	}
	return r, nil
}
