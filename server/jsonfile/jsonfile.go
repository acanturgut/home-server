// Package jsonfile persists small JSON documents so a crash mid-write can
// never leave a truncated file behind, and a corrupt file is never silently
// overwritten by the next save.
package jsonfile

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// Load decodes path into v. A missing or empty file leaves v untouched and
// returns nil, so callers can pre-fill v with defaults. A file that fails to
// decode is moved aside to <path>.corrupt-<unix> and the error is returned.
func Load(path string, v any) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, v); err != nil {
		aside := fmt.Sprintf("%s.corrupt-%d", path, time.Now().Unix())
		_ = os.Rename(path, aside)
		return fmt.Errorf("%s: %w (moved to %s)", filepath.Base(path), err, aside)
	}
	return nil
}

// Save writes v as indented JSON. See Write.
func Save(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return Write(path, data)
}

// Write atomically replaces path with data (temp file in the same directory,
// fsync, rename). The file is owner-only, since several stores hold secrets.
// Callers serialize writes to the same path with their own store lock.
func Write(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp) // no-op once renamed
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
