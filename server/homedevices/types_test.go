package homedevices

import "testing"

func TestBridgeValidate(t *testing.T) {
	cases := []struct {
		name string
		b    Bridge
		ok   bool
	}{
		{"hue ip", Bridge{Kind: KindHue, Host: "192.168.1.5"}, true},
		{"host with port", Bridge{Kind: KindDirigera, Host: "hub.lan:8443"}, true},
		{"trailing space", Bridge{Kind: KindHue, Host: "192.168.1.5 "}, false},
		{"scheme in host", Bridge{Kind: KindHue, Host: "http://192.168.1.5"}, false},
		{"empty host", Bridge{Kind: KindWebOS}, false},
		{"unknown kind", Bridge{Kind: "zigbee", Host: "1.2.3.4"}, false},
		{"http needs no host", Bridge{Kind: KindHTTP, Config: map[string]string{"on_url": "http://plug/on"}}, true},
		{"http bad url", Bridge{Kind: KindHTTP, Config: map[string]string{"on_url": "plug/on"}}, false},
		{"http bad method", Bridge{Kind: KindHTTP, Config: map[string]string{"method": "DELETE"}}, false},
	}
	for _, c := range cases {
		if err := c.b.Validate(); (err == nil) != c.ok {
			t.Errorf("%s: err=%v, want ok=%v", c.name, err, c.ok)
		}
	}
}
