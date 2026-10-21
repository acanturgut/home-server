package search

import "testing"

func TestDialPublicOnly(t *testing.T) {
	cases := map[string]bool{
		"93.184.216.34:443":     true,
		"[2606:4700::1111]:443": true,
		"127.0.0.1:80":          false,
		"10.0.0.1:80":           false,
		"192.168.50.1:80":       false,
		"169.254.169.254:80":    false,
		"100.64.0.1:80":         false,
		"0.0.0.0:80":            false,
		"[::1]:80":              false,
		"[fd00::1]:80":          false,
		"[::ffff:10.0.0.1]:80":  false,
	}
	for addr, allowed := range cases {
		if err := dialPublicOnly("tcp", addr, nil); (err == nil) != allowed {
			t.Errorf("%s: err=%v, want allowed=%v", addr, err, allowed)
		}
	}
}
