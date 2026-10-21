package jsonfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRoundTripMissingAndCorrupt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "doc.json")

	got := map[string]int{"default": 1}
	if err := Load(path, &got); err != nil || got["default"] != 1 {
		t.Fatalf("missing file: err=%v got=%v, want defaults kept", err, got)
	}

	if err := Save(path, map[string]int{"a": 2}); err != nil {
		t.Fatal(err)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, want 0600", info.Mode().Perm())
	}
	got = nil
	if err := Load(path, &got); err != nil || got["a"] != 2 {
		t.Fatalf("round trip: err=%v got=%v", err, got)
	}

	if err := os.WriteFile(path, []byte(`{"a":`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Load(path, &got); err == nil {
		t.Fatal("corrupt file: want error")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("corrupt file should be moved aside")
	}
	if m, _ := filepath.Glob(path + ".corrupt-*"); len(m) != 1 {
		t.Fatalf("want one .corrupt file, got %v", m)
	}
}
