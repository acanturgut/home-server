package homedevices

import (
	"context"
	"strings"
	"testing"
)

func TestHueErrorsNeverContainTheAppKey(t *testing.T) {
	b := Bridge{ID: "b", Kind: KindHue, Host: "127.0.0.1:1", Token: "s3cret-key"}
	p := NewHueProvider()
	_, err := p.Discover(context.Background(), b)
	if err == nil || strings.Contains(err.Error(), b.Token) {
		t.Fatalf("Discover error = %v; want an error without the app key", err)
	}
	if err := p.Apply(context.Background(), b, "1", Action{Action: "on"}); err == nil || strings.Contains(err.Error(), b.Token) {
		t.Fatalf("Apply error = %v; want an error without the app key", err)
	}
}
