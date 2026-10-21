// Package network discovers devices on the local LAN by reading the kernel's
// ARP table (/proc/net/arp on Linux) and enriching each entry with reverse
// DNS. Designed to run inside a container with `network_mode: host` so that
// the ARP cache reflects the real LAN.
package network

import (
	"bufio"
	"context"
	"net"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Device is a single LAN neighbour as observed via ARP.
type Device struct {
	IP         string `json:"ip"`
	MAC        string `json:"mac"`
	Hostname   string `json:"hostname,omitempty"`
	CustomName string `json:"custom_name,omitempty"`
	Vendor     string `json:"vendor,omitempty"`
	Iface      string `json:"iface,omitempty"`
	Online     bool   `json:"online"` // reachable / not REACHABLE-flag-2 only
}

// Result is the snapshot returned from Scan().
type Result struct {
	Devices   []Device  `json:"devices"`
	Gateway   string    `json:"gateway,omitempty"`
	SelfIP    string    `json:"self_ip,omitempty"`
	ScannedAt time.Time `json:"scanned_at"`
}

const cacheTTL = 30 * time.Second

// Scanner discovers LAN neighbours and applies user-set names to them. A
// 30-second cache prevents reverse-DNS storms from polling UIs.
type Scanner struct {
	names   *Store
	cacheMu sync.Mutex
	cache   Result
}

func NewScanner(dataDir string) *Scanner {
	return &Scanner{names: NewStore(dataDir)}
}

// LookupName returns the user-set display name for mac, or "".
func (s *Scanner) LookupName(mac string) string {
	o, _ := s.names.Get(mac)
	return o.Name
}

// SetName stores a custom display name; an empty name removes it.
func (s *Scanner) SetName(mac, name string) error {
	if err := s.names.Set(mac, name); err != nil {
		return err
	}
	s.cacheMu.Lock()
	s.cache = Result{}
	s.cacheMu.Unlock()
	return nil
}

// PrimaryIP is this host's LAN address: the source IP the kernel picks for
// the default route. Dialing UDP sends no packets.
func PrimaryIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	if a, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return a.IP.String()
	}
	return ""
}

// Scan returns a (possibly cached) snapshot of LAN neighbours.
func (s *Scanner) Scan() Result {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if time.Since(s.cache.ScannedAt) < cacheTTL && len(s.cache.Devices) > 0 {
		return s.cache
	}
	devs := readArp()
	enrich(devs)
	for i := range devs {
		devs[i].CustomName = s.LookupName(devs[i].MAC)
	}
	s.cache = Result{
		Devices:   devs,
		Gateway:   defaultGateway(),
		SelfIP:    PrimaryIP(),
		ScannedAt: time.Now(),
	}
	return s.cache
}

// defaultGateway parses /proc/net/route for the default route. Returns "" on
// any error (non-Linux containers, mounted differently, etc.).
func defaultGateway() string {
	f, err := os.Open("/proc/net/route")
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		if first {
			first = false
			continue
		}
		fields := strings.Fields(sc.Text())
		if len(fields) < 4 {
			continue
		}
		// Destination 00000000 = default route.
		if fields[1] != "00000000" {
			continue
		}
		gwHex := fields[2]
		if len(gwHex) != 8 {
			continue
		}
		// Little-endian hex bytes → dotted IP.
		var b [4]byte
		for i := 0; i < 4; i++ {
			n, err := strconv.ParseUint(gwHex[i*2:i*2+2], 16, 8)
			if err != nil {
				return ""
			}
			b[3-i] = byte(n)
		}
		return net.IPv4(b[0], b[1], b[2], b[3]).String()
	}
	return ""
}

// readArp parses /proc/net/arp. Format:
//
//	IP address       HW type     Flags       HW address            Mask     Device
//	192.168.50.1     0x1         0x2         aa:bb:cc:dd:ee:ff     *        eth0
func readArp() []Device {
	f, err := os.Open("/proc/net/arp")
	if err != nil {
		return nil
	}
	defer f.Close()

	var out []Device
	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		if first {
			first = false
			continue
		}
		fields := strings.Fields(sc.Text())
		if len(fields) < 6 {
			continue
		}
		ip := fields[0]
		flags := fields[2]
		mac := strings.ToLower(fields[3])
		iface := fields[5]
		// Skip incomplete entries (flag 0x0) and zero MACs.
		if flags == "0x0" || mac == "00:00:00:00:00:00" {
			continue
		}
		// 0x2 = REACHABLE / valid entry.
		online := flags == "0x2"
		out = append(out, Device{
			IP:     ip,
			MAC:    mac,
			Iface:  iface,
			Online: online,
		})
	}
	sort.Slice(out, func(i, j int) bool { return ipLess(out[i].IP, out[j].IP) })
	return out
}

func ipLess(a, b string) bool {
	pa, pb := net.ParseIP(a), net.ParseIP(b)
	if pa == nil || pb == nil {
		return a < b
	}
	pa = pa.To16()
	pb = pb.To16()
	for i := 0; i < len(pa); i++ {
		if pa[i] != pb[i] {
			return pa[i] < pb[i]
		}
	}
	return false
}

// enrich performs reverse DNS in parallel with a hard cap on concurrent
// lookups so a chatty network can't stall the request. Each lookup is given
// 600ms before being abandoned.
func enrich(devs []Device) {
	if len(devs) == 0 {
		return
	}
	sem := make(chan struct{}, 16)
	var wg sync.WaitGroup
	resolver := &net.Resolver{}
	for i := range devs {
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			ctx, cancel := context.WithTimeout(context.Background(), 600*time.Millisecond)
			defer cancel()
			names, err := resolver.LookupAddr(ctx, devs[i].IP)
			if err == nil && len(names) > 0 {
				devs[i].Hostname = strings.TrimSuffix(names[0], ".")
			}
			devs[i].Vendor = vendorFromMAC(devs[i].MAC)
		}()
	}
	wg.Wait()
}

// Small inline OUI lookup for common consumer vendors. Not exhaustive — just
// enough to make the LAN view useful at a glance.
func vendorFromMAC(mac string) string {
	if len(mac) < 8 {
		return ""
	}
	prefix := strings.ReplaceAll(mac[:8], ":", "")
	prefix = strings.ToLower(prefix)
	if v, ok := ouiTable[prefix]; ok {
		return v
	}
	return ""
}

// Curated OUI prefixes likely to appear on a home LAN (Apple, IKEA, Hue,
// Sonos, Samsung, LG, Google, Amazon, Raspberry Pi, Intel, Dell, Asus, Xiaomi,
// TP-Link, Ubiquiti, Synology, Brother, HP, Canon).
var ouiTable = map[string]string{
	// Apple
	"3c0754": "Apple", "a4c361": "Apple", "98e0d9": "Apple",
	"f0d1a9": "Apple", "f8ffc2": "Apple", "8c8590": "Apple",
	"acbc32": "Apple", "0023df": "Apple",
	// IKEA
	"c4ac59": "IKEA", "84fd27": "IKEA",
	// Philips Hue / Signify
	"001788": "Philips Hue", "ec1bbd": "Philips Hue",
	// Sonos
	"000e58": "Sonos", "5caafd": "Sonos", "94f692": "Sonos",
	// Samsung
	"04b167": "Samsung", "08373d": "Samsung", "1c5a3e": "Samsung",
	// LG
	"00e091": "LG", "001e75": "LG", "ccfa00": "LG",
	// Google / Nest
	"f4f5d8": "Google", "1c3947": "Google", "6466b3": "Google",
	// Amazon
	"f0d2f1": "Amazon", "0c47c9": "Amazon", "44650d": "Amazon",
	// Raspberry Pi
	"b827eb": "Raspberry Pi", "dca632": "Raspberry Pi", "e45f01": "Raspberry Pi",
	"d83add": "Raspberry Pi", "2cf7f0": "Raspberry Pi",
	// Intel
	"002624": "Intel", "001b21": "Intel", "8c1645": "Intel",
	// Dell
	"00188b": "Dell", "1866da": "Dell",
	// Asus
	"f832e4": "Asus", "1c872c": "Asus",
	// Xiaomi
	"50ec50": "Xiaomi", "640980": "Xiaomi",
	// TP-Link
	"e8de27": "TP-Link", "98dac4": "TP-Link", "50c7bf": "TP-Link",
	// Ubiquiti
	"24a43c": "Ubiquiti", "fcecda": "Ubiquiti", "b4fbe4": "Ubiquiti",
	// Synology
	"001132": "Synology",
	// Brother / HP / Canon
	"30055c": "Brother", "001b78": "HP", "001e8f": "Canon",
}
