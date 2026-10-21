package homedns

import (
	"net"
	"strings"
	"testing"

	"github.com/miekg/dns"
)

func TestAnswerLocal(t *testing.T) {
	s := New(t.TempDir(), "", nil)
	if err := s.SetRecords([]Record{
		{Name: "home.lan", Type: "A", Value: "10.0.0.2"},
		{Name: "alias.lan", Type: "CNAME", Value: "home.lan"},
	}); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name      string
		qtype     uint16
		wantRRs   int
		wantOwned bool
	}{
		{"home.lan.", dns.TypeA, 1, true},
		{"home.lan.", dns.TypeAAAA, 0, true}, // NODATA, not forwarded
		{"alias.lan.", dns.TypeA, 2, true},   // CNAME + chased A
		{"example.com.", dns.TypeA, 0, false},
	}
	for _, c := range cases {
		rrs, owned := s.answerLocal(dns.Question{Name: c.name, Qtype: c.qtype}, c.name)
		if len(rrs) != c.wantRRs || owned != c.wantOwned {
			t.Errorf("%s %s: got %d RRs owned=%v, want %d owned=%v",
				c.name, dns.TypeToString[c.qtype], len(rrs), owned, c.wantRRs, c.wantOwned)
		}
	}
}

func TestNormaliseRecord(t *testing.T) {
	cases := []struct {
		r  Record
		ok bool
	}{
		{Record{Name: "NAS.Home.Lan", Type: "a", Value: "192.168.50.5"}, true},
		{Record{Name: "bad name!", Type: "A", Value: "1.2.3.4"}, false},
		{Record{Name: "v6.lan", Type: "AAAA", Value: "1.2.3.4"}, false},
		{Record{Name: "www.lan", Type: "CNAME", Value: "home.lan"}, true},
		{Record{Name: "www.lan", Type: "MX", Value: "home.lan"}, false},
	}
	for _, c := range cases {
		got, err := normaliseRecord(c.r)
		if (err == nil) != c.ok {
			t.Errorf("%+v: err=%v, want ok=%v", c.r, err, c.ok)
		}
		if c.ok && (got.Name != dns.Fqdn(strings.ToLower(c.r.Name)) || got.TTL == 0) {
			t.Errorf("%+v: not normalised: %+v", c.r, got)
		}
	}
}

func TestAllowedClient(t *testing.T) {
	cases := map[string]bool{
		"192.168.1.5:5353":   true,
		"10.1.2.3:53":        true,
		"127.0.0.1:53":       true,
		"100.101.102.103:53": true, // CGNAT / Tailscale
		"[fd00::1]:53":       true,
		"8.8.8.8:53":         false,
		"[2001:db8::1]:53":   false,
	}
	for addr, want := range cases {
		a, err := net.ResolveUDPAddr("udp", addr)
		if err != nil {
			t.Fatal(err)
		}
		if got := allowedClient(a); got != want {
			t.Errorf("%s: got %v, want %v", addr, got, want)
		}
	}
}

func TestBlocklistMatching(t *testing.T) {
	lines := map[string]string{
		"0.0.0.0 ads.example.com": "ads.example.com",
		"tracker.net # comment":   "tracker.net",
		"127.0.0.1 localhost":     "",
		"# just a comment":        "",
		"nodot":                   "",
	}
	for line, want := range lines {
		if got, _ := parseHostsLine(line); got != want {
			t.Errorf("parseHostsLine(%q) = %q, want %q", line, got, want)
		}
	}

	b := &blocklist{
		enabled:   true,
		blocked:   map[string]struct{}{"doubleclick.net": {}, "googlevideo.com": {}},
		allowlist: map[string]struct{}{"googlevideo.com": {}},
	}
	for name, want := range map[string]bool{
		"ad.doubleclick.net.": true,
		"doubleclick.net":     true,
		"notdoubleclick.net":  false,
		"r1.googlevideo.com":  false, // allowlist wins
		"example.com":         false,
	} {
		if got := b.isBlocked(name); got != want {
			t.Errorf("isBlocked(%q) = %v, want %v", name, got, want)
		}
	}
}
