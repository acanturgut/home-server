package bambu

import (
	"crypto/tls"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/jlaffaye/ftp"
)

// File represents one entry in printer storage.
type File struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"` // absolute path in printer storage
	Size     uint64    `json:"size"`
	Modified time.Time `json:"modified,omitempty"`
	IsDir    bool      `json:"is_dir"`
}

// dialFTPS opens an explicit-FTPS connection (AUTH TLS, PROT P) to the
// printer on port 990. Bambu uses a self-signed cert so we skip verify.
func (m *Manager) dialFTPS(id string) (*ftp.ServerConn, Printer, error) {
	p, ok := m.store.Get(id)
	if !ok {
		return nil, Printer{}, fmt.Errorf("printer not found")
	}
	addr := fmt.Sprintf("%s:990", p.Host)
	tlsCfg := &tls.Config{InsecureSkipVerify: true, ServerName: p.Host}
	c, err := ftp.Dial(addr,
		ftp.DialWithTimeout(8*time.Second),
		ftp.DialWithExplicitTLS(tlsCfg),
	)
	if err != nil {
		return nil, p, fmt.Errorf("ftps dial: %w", err)
	}
	if err := c.Login("bblp", p.AccessCode); err != nil {
		_ = c.Quit()
		return nil, p, fmt.Errorf("ftps login: %w", err)
	}
	return c, p, nil
}

// ListFiles returns all 3MF / GCODE files under common Bambu storage
// paths (/cache, /timelapse, /model). Recursive only one level.
func (m *Manager) ListFiles(id string) ([]File, error) {
	c, _, err := m.dialFTPS(id)
	if err != nil {
		return nil, err
	}
	defer c.Quit()

	out := []File{}
	for _, dir := range []string{"/cache", "/timelapse", "/model"} {
		entries, err := c.List(dir)
		if err != nil {
			continue // dir may not exist on some firmwares
		}
		for _, e := range entries {
			if e.Name == "." || e.Name == ".." {
				continue
			}
			out = append(out, File{
				Name:     e.Name,
				Path:     path.Join(dir, e.Name),
				Size:     e.Size,
				Modified: e.Time,
				IsDir:    e.Type == ftp.EntryTypeFolder,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Modified.After(out[j].Modified)
	})
	return out, nil
}

// UploadFile streams r into /cache/<filename> on the printer. Returns
// the printer-side path on success (the value to feed PrintProjectFile).
func (m *Manager) UploadFile(id, filename string, r io.Reader) (string, error) {
	if !strings.HasSuffix(strings.ToLower(filename), ".3mf") &&
		!strings.HasSuffix(strings.ToLower(filename), ".gcode") {
		return "", fmt.Errorf("only .3mf and .gcode files are accepted")
	}
	// Sanitize: strip path components.
	filename = path.Base(filename)

	c, _, err := m.dialFTPS(id)
	if err != nil {
		return "", err
	}
	defer c.Quit()

	dest := "/cache/" + filename
	if err := c.Stor(dest, r); err != nil {
		return "", fmt.Errorf("upload: %w", err)
	}
	return dest, nil
}

// DownloadFile opens a read stream for one printer-side file. The caller
// MUST close the returned ReadCloser. The ftp connection is closed when
// the stream is closed.
func (m *Manager) DownloadFile(id, remotePath string) (io.ReadCloser, error) {
	if !strings.HasPrefix(remotePath, "/") {
		return nil, fmt.Errorf("absolute path required")
	}
	c, _, err := m.dialFTPS(id)
	if err != nil {
		return nil, err
	}
	resp, err := c.Retr(remotePath)
	if err != nil {
		_ = c.Quit()
		return nil, fmt.Errorf("retr: %w", err)
	}
	return &ftpReadCloser{Response: resp, conn: c}, nil
}

// DeleteFile removes a printer-side file.
func (m *Manager) DeleteFile(id, remotePath string) error {
	if !strings.HasPrefix(remotePath, "/") {
		return fmt.Errorf("absolute path required")
	}
	c, _, err := m.dialFTPS(id)
	if err != nil {
		return err
	}
	defer c.Quit()
	if err := c.Delete(remotePath); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	return nil
}

type ftpReadCloser struct {
	*ftp.Response
	conn *ftp.ServerConn
}

func (r *ftpReadCloser) Close() error {
	err := r.Response.Close()
	_ = r.conn.Quit()
	return err
}
