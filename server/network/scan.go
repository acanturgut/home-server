// Package network discovers devices on the local LAN by reading the kernel's
// ARP table (/proc/net/arp on Linux) and enriching each entry with reverse
// DNS. Designed to run inside a container with `network_mode: host` so that
// the ARP cache reflects the real LAN.
package network

import (
	"bufio"
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

var (
	cache      Result
	cacheMu    sync.Mutex
	cacheTTL   = 30 * time.Second
	storeRef   *Store
	storeRefMu sync.RWMutex
)

// AttachStore wires a persistent override store to enrich scan results.
// Pass nil to detach (mostly for tests).
func AttachStore(s *Store) {
	storeRefMu.Lock()
	storeRef = s
	storeRefMu.Unlock()
}

// LookupName returns the user-set custom display name for `mac`, or "".
// Safe to call from any package; uses the store registered via AttachStore.
func LookupName(mac string) string {
	storeRefMu.RLock()
	s := storeRef
	storeRefMu.RUnlock()
	if s == nil {
		return ""
	}
	if o, ok := s.Get(mac); ok {
		return o.Name
	}
	return ""
}

// PrimaryIP returns the first non-loopback IPv4 address on the host.
// Safe for callers in other packages that need to know our LAN address.
func PrimaryIP() string { return primaryIP() }

// Scan returns a (possibly cached) snapshot of LAN neighbours. A 30-second
// cache prevents reverse-DNS storms from polling UIs.
func Scan() Result {
	cacheMu.Lock()
	if time.Since(cache.ScannedAt) < cacheTTL && len(cache.Devices) > 0 {
		out := cache
		cacheMu.Unlock()
		return out
	}
	cacheMu.Unlock()

	devs := readArp()
	enrich(devs)
	applyOverrides(devs)

	r := Result{
		Devices:   devs,
		Gateway:   defaultGateway(),
		SelfIP:    primaryIP(),
		ScannedAt: time.Now(),
	}
	cacheMu.Lock()
	cache = r
	cacheMu.Unlock()
	return r
}

func applyOverrides(devs []Device) {
	storeRefMu.RLock()
	s := storeRef
	storeRefMu.RUnlock()
	if s == nil {
		return
	}
	for i := range devs {
		if o, ok := s.Get(devs[i].MAC); ok {
			devs[i].CustomName = o.Name
		}
	}
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

// primaryIP picks the first non-loopback IPv4 address bound to a UP iface.
// Best-effort identification of "this server" on the LAN.
func primaryIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok || ipnet.IP.To4() == nil {
				continue
			}
			if ipnet.IP.IsLoopback() || ipnet.IP.IsLinkLocalUnicast() {
				continue
			}
			return ipnet.IP.String()
		}
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
		i := i
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			ctx, cancel := contextWithTimeout(600 * time.Millisecond)
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
