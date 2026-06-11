package asusrouter

import (
	"context"
	"errors"
	"strings"
)

// AsusWRT MAC-filter ("Parental Controls → Block Internet Access") is stored
// in NVRAM as parallel `>`-separated lists:
//
//	MULTIFILTER_ALL                       0/1 (master switch)
//	MULTIFILTER_MAC                       aa:bb:..>cc:dd:..>...
//	MULTIFILTER_DEVICENAME                Name1>Name2>...
//	MULTIFILTER_ENABLE                    1>1>1>...
//	MULTIFILTER_MACFILTER_DAYTIME_V2      schedule per entry, "" = always
//	MULTIFILTER_URL_ENABLE                0>0>...
//	MULTIFILTER_URL                       >>...
//	MULTIFILTER_URL_DAYTIME_V2            ...
//
// We never blow away entries we didn't add; we read them, mutate the relevant
// row(s), and write them back, then trigger `restart_firewall` for the rule
// to take effect.

// BlockedMACs returns the set of MACs currently blocked by the router's
// parental-control MAC filter, lowercased.
func (c *Client) BlockedMACs(ctx context.Context) (map[string]bool, error) {
	rows, err := c.readMultifilter(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string]bool{}
	for _, r := range rows {
		if r.Enable && r.MAC != "" {
			out[strings.ToLower(r.MAC)] = true
		}
	}
	return out, nil
}

// SetBlocked toggles the blocked state of `mac`. `name` is shown in the
// router UI's parental controls table for our entry.
func (c *Client) SetBlocked(ctx context.Context, mac, name string, blocked bool) error {
	mac = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(mac), "-", ":"))
	if mac == "" {
		return errors.New("router block: empty mac")
	}
	rows, err := c.readMultifilter(ctx)
	if err != nil {
		return err
	}
	idx := -1
	for i, r := range rows {
		if strings.EqualFold(r.MAC, mac) {
			idx = i
			break
		}
	}
	switch {
	case blocked && idx < 0:
		// Append a new fully-blocked row (always, no URL filter).
		rows = append(rows, mfRow{
			MAC:      mac,
			Name:     fallbackName(name, mac),
			Enable:   true,
			Schedule: "",
			URLEn:    false,
			URL:      "",
			URLDay:   "",
		})
	case blocked && idx >= 0:
		rows[idx].Enable = true
		if rows[idx].Name == "" {
			rows[idx].Name = fallbackName(name, mac)
		}
	case !blocked && idx >= 0:
		// Remove the entry entirely so the user's per-device whitelist stays clean.
		rows = append(rows[:idx], rows[idx+1:]...)
	default:
		// !blocked && idx<0 — nothing to do.
		return nil
	}
	return c.writeMultifilter(ctx, rows)
}

type mfRow struct {
	MAC      string
	Name     string
	Enable   bool
	Schedule string
	URLEn    bool
	URL      string
	URLDay   string
}

func (c *Client) readMultifilter(ctx context.Context) ([]mfRow, error) {
	hooks := []string{
		"nvram_get(MULTIFILTER_MAC)",
		"nvram_get(MULTIFILTER_DEVICENAME)",
		"nvram_get(MULTIFILTER_ENABLE)",
		"nvram_get(MULTIFILTER_MACFILTER_DAYTIME_V2)",
		"nvram_get(MULTIFILTER_URL_ENABLE)",
		"nvram_get(MULTIFILTER_URL)",
		"nvram_get(MULTIFILTER_URL_DAYTIME_V2)",
	}
	raw, err := c.Hook(ctx, hooks...)
	if err != nil {
		return nil, err
	}
	mac := splitGT(strVal(raw, "MULTIFILTER_MAC"))
	name := splitGT(strVal(raw, "MULTIFILTER_DEVICENAME"))
	enable := splitGT(strVal(raw, "MULTIFILTER_ENABLE"))
	sched := splitGT(strVal(raw, "MULTIFILTER_MACFILTER_DAYTIME_V2"))
	urlEn := splitGT(strVal(raw, "MULTIFILTER_URL_ENABLE"))
	url := splitGT(strVal(raw, "MULTIFILTER_URL"))
	urlDay := splitGT(strVal(raw, "MULTIFILTER_URL_DAYTIME_V2"))

	n := len(mac)
	if n == 0 {
		return nil, nil
	}
	rows := make([]mfRow, n)
	for i := 0; i < n; i++ {
		rows[i] = mfRow{
			MAC:      strings.TrimSpace(mac[i]),
			Name:     strAt(name, i),
			Enable:   strAt(enable, i) == "1",
			Schedule: strAt(sched, i),
			URLEn:    strAt(urlEn, i) == "1",
			URL:      strAt(url, i),
			URLDay:   strAt(urlDay, i),
		}
	}
	return rows, nil
}

func (c *Client) writeMultifilter(ctx context.Context, rows []mfRow) error {
	macs := make([]string, len(rows))
	names := make([]string, len(rows))
	enables := make([]string, len(rows))
	scheds := make([]string, len(rows))
	urlEns := make([]string, len(rows))
	urls := make([]string, len(rows))
	urlDays := make([]string, len(rows))
	for i, r := range rows {
		macs[i] = r.MAC
		names[i] = r.Name
		if r.Enable {
			enables[i] = "1"
		} else {
			enables[i] = "0"
		}
		scheds[i] = r.Schedule
		if r.URLEn {
			urlEns[i] = "1"
		} else {
			urlEns[i] = "0"
		}
		urls[i] = r.URL
		urlDays[i] = r.URLDay
	}
	form := map[string]string{
		"MULTIFILTER_ALL":                  "1",
		"MULTIFILTER_MAC":                  joinGT(macs),
		"MULTIFILTER_DEVICENAME":           joinGT(names),
		"MULTIFILTER_ENABLE":               joinGT(enables),
		"MULTIFILTER_MACFILTER_DAYTIME_V2": joinGT(scheds),
		"MULTIFILTER_URL_ENABLE":           joinGT(urlEns),
		"MULTIFILTER_URL":                  joinGT(urls),
		"MULTIFILTER_URL_DAYTIME_V2":       joinGT(urlDays),
	}
	return c.Apply(ctx, "restart_firewall", form)
}

func splitGT(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return strings.Split(s, ">")
}

func joinGT(parts []string) string { return strings.Join(parts, ">") }

func strAt(s []string, i int) string {
	if i < len(s) {
		return s[i]
	}
	return ""
}

func fallbackName(name, mac string) string {
	if name = strings.TrimSpace(name); name != "" {
		// AsusWRT rejects '>' (our delimiter) and oddly-long names.
		name = strings.ReplaceAll(name, ">", "_")
		if len(name) > 31 {
			name = name[:31]
		}
		return name
	}
	return strings.ReplaceAll(mac, ":", "")
}
