package config

import "testing"

func TestByHostMatchesExactly(t *testing.T) {
	s := &NodeStore{nodes: []Node{
		{ID: "a", Host: "http://192.168.50.100:1234"},
		{ID: "b", Host: "192.168.50.10:1234"},
		{ID: "c", Host: "gpu.lan"},
	}}
	cases := map[string]string{
		"192.168.50.100": "a",
		"192.168.50.10":  "b", // must not match .100 by substring
		"gpu.lan":        "c",
		"192.168.50.1":   "",
	}
	for host, want := range cases {
		n, _ := s.ByHost(host)
		if n.ID != want {
			t.Errorf("ByHost(%q) = %q, want %q", host, n.ID, want)
		}
	}
}
