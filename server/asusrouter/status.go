package asusrouter

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

// Status is a curated snapshot of router state pulled from `appGet.cgi`.
//
// All fields are best-effort — a value left at the zero-value means the
// router did not return anything we could parse for it.
type Status struct {
	Hostname     string    `json:"hostname,omitempty"`
	Model        string    `json:"model,omitempty"`
	Firmware     string    `json:"firmware,omitempty"`
	UptimeSec    int64     `json:"uptime_sec,omitempty"`
	WANStatus    string    `json:"wan_status,omitempty"` // "Connected" / etc.
	WANIP        string    `json:"wan_ip,omitempty"`
	WANGateway   string    `json:"wan_gateway,omitempty"`
	WANType      string    `json:"wan_type,omitempty"` // dhcp / pppoe / static
	LAN          string    `json:"lan_ip,omitempty"`
	CPUUsedPct   float64   `json:"cpu_used_pct,omitempty"`
	MemUsedPct   float64   `json:"mem_used_pct,omitempty"`
	MemTotalKB   int64     `json:"mem_total_kb,omitempty"`
	MemFreeKB    int64     `json:"mem_free_kb,omitempty"`
	WiredCount   int       `json:"wired_count,omitempty"`
	Wireless2GHz int       `json:"wireless_2g_count,omitempty"`
	Wireless5GHz int       `json:"wireless_5g_count,omitempty"`
	ClientCount  int       `json:"client_count,omitempty"`
	FetchedAt    time.Time `json:"fetched_at"`
}

// Status fetches a curated snapshot. Returns whatever subset of fields the
// router responded with — partial data is preferable to none.
func (c *Client) Status(ctx context.Context) (Status, error) {
	hooks := []string{
		"nvram_get(productid)",
		"nvram_get(firmver)",
		"nvram_get(buildno)",
		"nvram_get(extendno)",
		"nvram_get(lan_ipaddr)",
		"nvram_get(lan_hostname)",
		"nvram_get(wan0_state_t)",
		"nvram_get(wan0_ipaddr)",
		"nvram_get(wan0_gateway)",
		"nvram_get(wan0_proto)",
		"uptime()",
		"cpu_usage(appobj)",
		"memory_usage(appobj)",
		"get_clientlist()",
	}
	raw, err := c.Hook(ctx, hooks...)
	if err != nil {
		return Status{FetchedAt: time.Now()}, err
	}
	s := Status{FetchedAt: time.Now()}
	s.Model = strVal(raw, "productid")
	s.Firmware = strings.TrimSpace(strVal(raw, "firmver") + "_" +
		strVal(raw, "buildno") + "_" + strVal(raw, "extendno"))
	s.Firmware = strings.Trim(s.Firmware, "_")
	s.LAN = strVal(raw, "lan_ipaddr")
	s.Hostname = strVal(raw, "lan_hostname")
	s.WANStatus = wanStateLabel(strVal(raw, "wan0_state_t"))
	s.WANIP = strVal(raw, "wan0_ipaddr")
	s.WANGateway = strVal(raw, "wan0_gateway")
	s.WANType = strVal(raw, "wan0_proto")
	s.UptimeSec = parseUptime(strVal(raw, "uptime"))
	parseCPU(raw, &s)
	parseMem(raw, &s)
	parseClients(raw, &s)
	return s, nil
}

// Client describes one device the router knows about.
type RouterClient struct {
	MAC         string `json:"mac"`
	IP          string `json:"ip,omitempty"`
	Hostname    string `json:"hostname,omitempty"`
	Vendor      string `json:"vendor,omitempty"`
	Iface       string `json:"iface,omitempty"`        // "wired" / "2G" / "5G" / "6G"
	RSSI        int    `json:"rssi,omitempty"`         // negative dBm
	ConnectTime int64  `json:"connect_time,omitempty"` // seconds since associated
	Online      bool   `json:"online"`
	Internet    bool   `json:"internet,omitempty"` // has internet access (parental ctl)
	IsGuest     bool   `json:"guest,omitempty"`
	NickName    string `json:"nickname,omitempty"` // user-set name on router
}

// Clients fetches the connected client list (from get_clientlist hook).
// AsusWRT returns a deeply nested object keyed by interface; we flatten it.
func (c *Client) Clients(ctx context.Context) ([]RouterClient, error) {
	raw, err := c.Hook(ctx, "get_clientlist()")
	if err != nil {
		return nil, err
	}
	cl, ok := raw["get_clientlist"].(map[string]any)
	if !ok {
		return nil, nil
	}
	out := []RouterClient{}
	for k, v := range cl {
		// Skip the wrapper keys: "ClientAPILevel", "maclist", "ClientAPI"
		if strings.HasPrefix(k, "Client") || k == "maclist" {
			continue
		}
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		mac := strVal(m, "mac")
		if mac == "" {
			mac = k
		}
		rc := RouterClient{
			MAC:         strings.ToLower(mac),
			IP:          strVal(m, "ip"),
			Hostname:    strVal(m, "name"),
			NickName:    strVal(m, "nickName"),
			Vendor:      strVal(m, "vendor"),
			ConnectTime: intVal(m, "wlConnectTime"),
			Online:      strVal(m, "isOnline") == "1",
			Internet:    strVal(m, "internetState") == "1",
			IsGuest:     strVal(m, "isGuest") == "1",
			RSSI:        int(intVal(m, "rssi")),
		}
		rc.Iface = ifaceLabel(strVal(m, "isWL"))
		out = append(out, rc)
	}
	return out, nil
}

func ifaceLabel(isWL string) string {
	switch isWL {
	case "0":
		return "wired"
	case "1":
		return "2G"
	case "2":
		return "5G"
	case "3":
		return "5G-2"
	case "4":
		return "6G"
	}
	return ""
}

func wanStateLabel(s string) string {
	switch s {
	case "2":
		return "Connected"
	case "1":
		return "Connecting"
	case "0":
		return "Disconnected"
	case "4":
		return "Stopped"
	case "5":
		return "Disabled"
	case "6":
		return "Disconnected"
	}
	if s == "" {
		return ""
	}
	return "State " + s
}

func parseUptime(s string) int64 {
	// uptime() returns: " 21:34:12 up 5 days, 22:08, ..."
	// We pull the seconds count from `up X days, HH:MM`.
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	idx := strings.Index(s, "up ")
	if idx < 0 {
		return 0
	}
	rest := s[idx+3:]
	if i := strings.Index(rest, ","); i > 0 && strings.Contains(rest[:i], "day") {
		days, _ := strconv.Atoi(strings.Fields(rest[:i])[0])
		rest = strings.TrimSpace(rest[i+1:])
		if j := strings.Index(rest, ","); j > 0 {
			rest = rest[:j]
		}
		hms := strings.Split(strings.TrimSpace(rest), ":")
		if len(hms) >= 2 {
			h, _ := strconv.Atoi(hms[0])
			m, _ := strconv.Atoi(hms[1])
			return int64(days)*86400 + int64(h)*3600 + int64(m)*60
		}
		return int64(days) * 86400
	}
	if i := strings.Index(rest, ","); i > 0 {
		rest = rest[:i]
	}
	hms := strings.Split(strings.TrimSpace(rest), ":")
	if len(hms) == 3 {
		h, _ := strconv.Atoi(hms[0])
		m, _ := strconv.Atoi(hms[1])
		s, _ := strconv.Atoi(hms[2])
		return int64(h)*3600 + int64(m)*60 + int64(s)
	}
	if len(hms) == 2 {
		h, _ := strconv.Atoi(hms[0])
		m, _ := strconv.Atoi(hms[1])
		return int64(h)*3600 + int64(m)*60
	}
	return 0
}

func parseCPU(raw map[string]any, s *Status) {
	cu, ok := raw["cpu_usage"].(map[string]any)
	if !ok {
		return
	}
	// AsusWRT returns per-core fields like cpu1_total, cpu1_usage, …
	var total, used float64
	for k, v := range cu {
		val, _ := strconv.ParseFloat(strVal(map[string]any{k: v}, k), 64)
		switch {
		case strings.HasSuffix(k, "_total"):
			total += val
		case strings.HasSuffix(k, "_usage"):
			used += val
		}
	}
	if total > 0 {
		s.CPUUsedPct = used / total * 100
		if s.CPUUsedPct > 100 {
			s.CPUUsedPct = 100
		}
	}
}

func parseMem(raw map[string]any, s *Status) {
	mu, ok := raw["memory_usage"].(map[string]any)
	if !ok {
		return
	}
	total := intVal(mu, "mem_total")
	free := intVal(mu, "mem_free")
	used := intVal(mu, "mem_used")
	s.MemTotalKB = total
	s.MemFreeKB = free
	if total > 0 && used > 0 {
		s.MemUsedPct = float64(used) / float64(total) * 100
	}
}

func parseClients(raw map[string]any, s *Status) {
	cl, ok := raw["get_clientlist"].(map[string]any)
	if !ok {
		return
	}
	for k, v := range cl {
		if strings.HasPrefix(k, "Client") || k == "maclist" {
			continue
		}
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		s.ClientCount++
		switch strVal(m, "isWL") {
		case "0":
			s.WiredCount++
		case "1":
			s.Wireless2GHz++
		case "2", "3":
			s.Wireless5GHz++
		}
	}
}

// helpers ----

func strVal(m map[string]any, k string) string {
	v, ok := m[k]
	if !ok {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		if t {
			return "1"
		}
		return "0"
	}
	return ""
}

func intVal(m map[string]any, k string) int64 {
	v, _ := strconv.ParseInt(strVal(m, k), 10, 64)
	return v
}
