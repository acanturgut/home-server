package trader

import (
	"fmt"
	"time"
)

// MarketSession describes the open/closed state of one regional equities
// session at a given moment.
type MarketSession struct {
	Name     string    `json:"name"`               // "US", "Europe", "Asia"
	TZ       string    `json:"tz"`                 // IANA zone ("America/New_York")
	LocalNow string    `json:"local_now"`          // pretty local time, e.g. "Mon May 11 09:42"
	Phase    string    `json:"phase"`              // "open" | "pre" | "post" | "closed" | "weekend"
	Open     bool      `json:"open"`               // true iff regular session is currently live
	NextOpen time.Time `json:"next_open,omitempty"` // when this market next opens (UTC)
	NextClose time.Time `json:"next_close,omitempty"` // when it next closes (UTC); only set when Open
}

// marketHours describes one market's regular cash-session window.
// Pre/post-market windows are simple ±N hour padding.
type marketHours struct {
	Name      string
	TZ        string
	OpenH     int // local hour
	OpenM     int
	CloseH    int
	CloseM    int
	PreHours  int // hours before open considered "pre"
	PostHours int // hours after close considered "post"
}

// markets is the canonical list of regional sessions we surface.
// Times are LOCAL to each TZ. We approximate Europe with London hours
// (Frankfurt is roughly the same window) and Asia with Tokyo
// (Hong Kong / Shanghai overlap most of it). DST is handled by the
// timezone database.
var markets = []marketHours{
	{Name: "US", TZ: "America/New_York", OpenH: 9, OpenM: 30, CloseH: 16, CloseM: 0, PreHours: 5, PostHours: 4},
	{Name: "Europe", TZ: "Europe/London", OpenH: 8, OpenM: 0, CloseH: 16, CloseM: 30, PreHours: 1, PostHours: 2},
	{Name: "Asia", TZ: "Asia/Tokyo", OpenH: 9, OpenM: 0, CloseH: 15, CloseM: 0, PreHours: 1, PostHours: 1},
}

// MarketSessions returns the current state of every tracked market.
func MarketSessions(now time.Time) []MarketSession {
	out := make([]MarketSession, 0, len(markets))
	for _, mh := range markets {
		out = append(out, sessionFor(mh, now))
	}
	return out
}

func sessionFor(mh marketHours, now time.Time) MarketSession {
	loc, err := time.LoadLocation(mh.TZ)
	if err != nil {
		loc = time.UTC
	}
	local := now.In(loc)
	wd := local.Weekday()
	isWeekend := wd == time.Saturday || wd == time.Sunday
	openLocal := time.Date(local.Year(), local.Month(), local.Day(), mh.OpenH, mh.OpenM, 0, 0, loc)
	closeLocal := time.Date(local.Year(), local.Month(), local.Day(), mh.CloseH, mh.CloseM, 0, 0, loc)
	preLocal := openLocal.Add(-time.Duration(mh.PreHours) * time.Hour)
	postLocal := closeLocal.Add(time.Duration(mh.PostHours) * time.Hour)

	s := MarketSession{
		Name:     mh.Name,
		TZ:       mh.TZ,
		LocalNow: local.Format("Mon 15:04"),
	}

	switch {
	case isWeekend:
		s.Phase = "weekend"
		s.NextOpen = nextWeekdayOpen(local, mh).UTC()
	case local.Before(preLocal):
		s.Phase = "closed"
		s.NextOpen = openLocal.UTC()
	case local.Before(openLocal):
		s.Phase = "pre"
		s.NextOpen = openLocal.UTC()
	case local.Before(closeLocal):
		s.Phase = "open"
		s.Open = true
		s.NextClose = closeLocal.UTC()
	case local.Before(postLocal):
		s.Phase = "post"
		s.NextOpen = nextWeekdayOpen(local, mh).UTC()
	default:
		s.Phase = "closed"
		s.NextOpen = nextWeekdayOpen(local, mh).UTC()
	}
	return s
}

func nextWeekdayOpen(from time.Time, mh marketHours) time.Time {
	loc := from.Location()
	d := from.AddDate(0, 0, 1)
	for {
		wd := d.Weekday()
		if wd != time.Saturday && wd != time.Sunday {
			return time.Date(d.Year(), d.Month(), d.Day(), mh.OpenH, mh.OpenM, 0, 0, loc)
		}
		d = d.AddDate(0, 0, 1)
	}
}

// briefingSessionLine is a compact one-liner the LLM panel sees.
// Example: "Markets: US OPEN (closes 16:00 ET) · Europe POST · Asia CLOSED (opens Tue 09:00 JST)"
func briefingSessionLine(now time.Time) string {
	parts := []byte{}
	first := true
	for _, s := range MarketSessions(now) {
		if !first {
			parts = append(parts, ' ', '·', ' ')
		}
		first = false
		switch s.Phase {
		case "open":
			parts = append(parts, []byte(fmt.Sprintf("%s OPEN", s.Name))...)
		case "pre":
			parts = append(parts, []byte(fmt.Sprintf("%s pre-market", s.Name))...)
		case "post":
			parts = append(parts, []byte(fmt.Sprintf("%s after-hours", s.Name))...)
		case "weekend":
			parts = append(parts, []byte(fmt.Sprintf("%s weekend", s.Name))...)
		default:
			parts = append(parts, []byte(fmt.Sprintf("%s closed", s.Name))...)
		}
	}
	return string(parts)
}
