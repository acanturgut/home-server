package nodestate

import (
	"strings"
	"testing"
	"time"
)

func TestHistoryRecordsPerMinuteAndSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	h := NewHistory(dir)
	t0 := time.Now().Add(-time.Hour)
	h.Record(Stats{NodeID: "box", CPUTemp: 50}, t0)
	h.Record(Stats{NodeID: "box", CPUTemp: 99}, t0.Add(10*time.Second)) // same minute: skipped
	h.Record(Stats{NodeID: "box", CPUTemp: 60}, t0.Add(time.Minute))
	h.Record(Stats{NodeID: "../etc", CPUTemp: 1}, t0) // unsafe id: ignored

	got := NewHistory(dir).Series("box", time.Time{})
	if len(got) != 2 || got[0].CPUTemp != 50 || got[1].CPUTemp != 60 {
		t.Fatalf("after restart got %+v, want temps 50 then 60", got)
	}
	if s := h.Series("box", t0.Add(30*time.Second)); len(s) != 1 {
		t.Fatalf("since filter: got %d samples, want 1", len(s))
	}
	if s := h.Series("../etc", time.Time{}); len(s) != 0 {
		t.Fatalf("unsafe id was recorded: %+v", s)
	}
}

func TestLogsAreCapped(t *testing.T) {
	s := NewStore()
	long := strings.Repeat("x", 2*maxLogLineLen)
	for range 10 {
		lines := make([]string, 2*maxLogsPerBeat)
		for i := range lines {
			lines[i] = long
		}
		s.Update(Stats{NodeID: "box", Logs: lines})
	}
	got := s.Logs("box")
	if len(got) != keepLogs || len(got[0]) != maxLogLineLen {
		t.Fatalf("got %d lines of %d bytes, want %d of %d", len(got), len(got[0]), keepLogs, maxLogLineLen)
	}
	if s.All()["box"].Logs != nil {
		t.Fatal("logs leaked into the stats snapshot")
	}
}
