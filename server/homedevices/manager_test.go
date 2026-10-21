package homedevices

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/acanturgut/home-server/logger"
)

// flakyProvider fails Discover until fails reaches zero.
type flakyProvider struct{ fails int }

func (p *flakyProvider) Kind() Kind { return KindHue }
func (p *flakyProvider) Discover(context.Context, Bridge) ([]Device, error) {
	if p.fails > 0 {
		p.fails--
		return nil, errors.New("hub timeout")
	}
	return nil, nil
}
func (p *flakyProvider) Apply(context.Context, Bridge, string, Action) error { return nil }

func TestPollLogsStateChangesOnly(t *testing.T) {
	if err := logger.Init(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	m := NewManager(NewStore(t.TempDir()))
	m.providers[KindHue] = &flakyProvider{fails: 2}
	if _, err := m.Store().AddBridge(Bridge{Kind: KindHue, Host: "192.0.2.1", Name: "hue"}); err != nil {
		t.Fatal(err)
	}

	for range 3 { // fail, fail, recover
		m.PollOnce(context.Background())
	}

	var errs, recovered int
	for _, e := range logger.Recent(100) {
		switch {
		case e.Level == "ERROR" && strings.Contains(e.Message, "discover failed"):
			errs++
		case strings.Contains(e.Message, "reachable again"):
			recovered++
		}
	}
	if errs != 1 || recovered != 1 {
		t.Fatalf("got %d failure and %d recovery logs, want 1 and 1", errs, recovered)
	}
	if b, _ := m.Store().Bridge(m.Store().Bridges()[0].ID); b.Status != "ok" {
		t.Fatalf("bridge status = %q, want ok", b.Status)
	}
}
