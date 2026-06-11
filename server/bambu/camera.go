package bambu

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/logger"
)

// cameraProxy reads the printer's RTSPS stream once with FFmpeg and fans
// the resulting MJPEG out to every connected HTTP client. The FFmpeg
// child process is started lazily on the first subscriber and shut down
// after `idleStop` with no subscribers, so an idle dashboard tab costs
// zero CPU.
//
// Bambu A1/P1 expose the camera as RTSPS on port 322. The URL is
// `rtsps://bblp:{access_code}@{ip}:322/streaming/live/1` and uses a
// self-signed cert (FFmpeg's `tls_verify=0`).
type cameraProxy struct {
	cfg      Printer
	idleStop time.Duration

	mu      sync.Mutex
	cmd     *exec.Cmd
	cancel  context.CancelFunc
	subs    map[chan []byte]struct{}
	latest  []byte // most recent JPEG, for instant-paint of new subscribers
	running bool
	lastErr error
}

func newCameraProxy(cfg Printer) *cameraProxy {
	return &cameraProxy{
		cfg:      cfg,
		idleStop: 30 * time.Second,
		subs:     map[chan []byte]struct{}{},
	}
}

// subscribe registers a per-client channel. The returned cleanup func MUST
// be deferred by the caller. A nil err means the proxy is alive (or will
// be very shortly).
func (c *cameraProxy) subscribe() (chan []byte, []byte, func(), error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.running {
		if err := c.startLocked(); err != nil {
			return nil, nil, nil, err
		}
	}
	ch := make(chan []byte, 4) // small buffer; drop if client is slow
	c.subs[ch] = struct{}{}
	latest := c.latest
	cleanup := func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		delete(c.subs, ch)
		close(ch)
	}
	return ch, latest, cleanup, nil
}

// LastError returns the most recent ffmpeg or pipeline failure, if any.
func (c *cameraProxy) LastError() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastErr
}

// Stop terminates the ffmpeg process. Called when the printer is removed.
func (c *cameraProxy) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stopLocked()
}

func (c *cameraProxy) stopLocked() {
	if c.cancel != nil {
		c.cancel()
		c.cancel = nil
	}
	c.running = false
	c.cmd = nil
}

// startLocked launches the camera producer. Must be called with c.mu held.
//
// Bambu printers fall into two camera families:
//   - X1 / X1C / X1E         → RTSPS on port 322 (we use ffmpeg)
//   - A1 / A1 mini / P1S/P1P → proprietary TLS+JPEG on port 6000 (native Go)
func (c *cameraProxy) startLocked() error {
	if c.running {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	c.running = true
	c.lastErr = nil

	if !strings.HasPrefix(strings.ToUpper(c.cfg.Model), "X1") {
		logger.Info("bambu/" + c.cfg.Name + ": camera starting (A1/P1 native protocol on :6000)")
		go c.runA1(ctx)
		go c.watchIdle(ctx)
		return nil
	}

	rtsp := fmt.Sprintf("rtsps://bblp:%s@%s:322/streaming/live/1",
		c.cfg.AccessCode, c.cfg.Host)
	// -tls_verify 0      : trust the printer's self-signed cert
	// -rtsp_transport tcp: more reliable on Wi-Fi
	// -fflags nobuffer / -flags low_delay: keep latency tight
	// -an                : no audio
	// -c:v mjpeg -q:v 6  : transcode H.264 → JPEG, quality 6 (~180KB/frame at 720p)
	// -r 10              : 10fps is plenty for monitoring + halves CPU vs 20fps
	// -f mpjpeg          : multipart MJPEG to stdout
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-loglevel", "warning",
		"-tls_verify", "0",
		"-rtsp_transport", "tcp",
		"-fflags", "nobuffer",
		"-flags", "low_delay",
		"-i", rtsp,
		"-an",
		"-c:v", "mjpeg",
		"-q:v", "6",
		"-r", "10",
		"-f", "mpjpeg",
		"pipe:1",
	)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		c.running = false
		return fmt.Errorf("ffmpeg pipe: %w", err)
	}
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		cancel()
		c.running = false
		return fmt.Errorf("ffmpeg start: %w", err)
	}
	c.cmd = cmd

	logger.Info("bambu/" + c.cfg.Name + ": camera ffmpeg started (X1 RTSPS)")

	// Drain stderr into the log so we can debug auth/cert failures.
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			logger.Error("bambu/" + c.cfg.Name + ": ffmpeg: " + line)
		}
	}()

	// Producer: parse the multipart MJPEG and broadcast each frame.
	go c.run(stdout, ctx)

	// Idle watchdog: tear down ffmpeg when no subscribers for `idleStop`.
	go c.watchIdle(ctx)
	return nil
}

// run reads multipart MJPEG frames from ffmpeg's stdout. The "mpjpeg"
// muxer emits:
//
//	--ffmpeg\r\n
//	Content-Type: image/jpeg\r\n
//	Content-Length: 12345\r\n
//	\r\n
//	<jpeg bytes>\r\n
//
// We detect each frame by the Content-Length header and copy the raw JPEG
// out to every subscriber.
func (c *cameraProxy) run(r io.Reader, ctx context.Context) {
	defer func() {
		c.mu.Lock()
		c.stopLocked()
		c.mu.Unlock()
	}()

	br := bufio.NewReaderSize(r, 256*1024)
	for {
		if ctx.Err() != nil {
			return
		}
		// Skip until we see a Content-Length header.
		var clen int
		for {
			line, err := br.ReadString('\n')
			if err != nil {
				c.markErr(fmt.Errorf("ffmpeg ended: %w", err))
				return
			}
			line = trimCRLF(line)
			if line == "" {
				if clen > 0 {
					break
				}
				continue
			}
			if n, ok := parseContentLength(line); ok {
				clen = n
			}
		}
		if clen <= 0 {
			continue
		}
		buf := make([]byte, clen)
		if _, err := io.ReadFull(br, buf); err != nil {
			c.markErr(fmt.Errorf("ffmpeg read frame: %w", err))
			return
		}
		c.broadcast(buf)
		// Trailing CRLF after the binary blob.
		_, _ = br.ReadString('\n')
	}
}

func (c *cameraProxy) broadcast(jpeg []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.latest = jpeg
	for ch := range c.subs {
		select {
		case ch <- jpeg:
		default:
			// Slow client: drop this frame rather than blocking the producer.
		}
	}
}

func (c *cameraProxy) markErr(err error) {
	c.mu.Lock()
	c.lastErr = err
	c.mu.Unlock()
	logger.Error("bambu/" + c.cfg.Name + ": camera: " + err.Error())
}

func (c *cameraProxy) watchIdle(ctx context.Context) {
	t := time.NewTicker(c.idleStop)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c.mu.Lock()
			if len(c.subs) == 0 {
				c.stopLocked()
				c.mu.Unlock()
				logger.Info("bambu/" + c.cfg.Name + ": camera idle, ffmpeg stopped")
				return
			}
			c.mu.Unlock()
		}
	}
}

// ServeMJPEG writes a multipart/x-mixed-replace stream to w. Returns when
// the client disconnects or when the underlying ffmpeg process dies.
func (c *cameraProxy) ServeMJPEG(w http.ResponseWriter, r *http.Request) {
	ch, latest, cleanup, err := c.subscribe()
	if err != nil {
		http.Error(w, "camera unavailable: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	defer cleanup()

	const boundary = "homeserverframe"
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary="+boundary)
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Connection", "close")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)

	flusher, _ := w.(http.Flusher)

	writeFrame := func(jpeg []byte) error {
		var hdr bytes.Buffer
		fmt.Fprintf(&hdr, "--%s\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n", boundary, len(jpeg))
		if _, err := w.Write(hdr.Bytes()); err != nil {
			return err
		}
		if _, err := w.Write(jpeg); err != nil {
			return err
		}
		if _, err := w.Write([]byte("\r\n")); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	}

	// Paint the most recent frame immediately so the user sees the camera
	// before the next 100ms tick arrives.
	if len(latest) > 0 {
		if err := writeFrame(latest); err != nil {
			return
		}
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case jpeg, ok := <-ch:
			if !ok {
				return
			}
			if err := writeFrame(jpeg); err != nil {
				return
			}
		}
	}
}

// ServeSnapshot writes a single still JPEG (the latest cached frame).
// Used by Settings dialogs / status cards as a lightweight preview.
func (c *cameraProxy) ServeSnapshot(w http.ResponseWriter, _ *http.Request) {
	// Trigger ffmpeg to start, wait briefly for the first frame.
	ch, latest, cleanup, err := c.subscribe()
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	defer cleanup()

	if len(latest) == 0 {
		select {
		case f, ok := <-ch:
			if !ok {
				http.Error(w, "stream ended", http.StatusServiceUnavailable)
				return
			}
			latest = f
		case <-time.After(5 * time.Second):
			http.Error(w, "timeout waiting for frame", http.StatusGatewayTimeout)
			return
		}
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(latest)))
	_, _ = w.Write(latest)
}

// helpers ---------------------------------------------------------------

func trimCRLF(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\r' || s[len(s)-1] == '\n') {
		s = s[:len(s)-1]
	}
	return s
}

func parseContentLength(line string) (int, bool) {
	const prefix = "content-length:"
	if len(line) < len(prefix) {
		return 0, false
	}
	low := bytes.ToLower([]byte(line[:len(prefix)]))
	if string(low) != prefix {
		return 0, false
	}
	rest := line[len(prefix):]
	for len(rest) > 0 && (rest[0] == ' ' || rest[0] == '\t') {
		rest = rest[1:]
	}
	var n int
	if _, err := fmt.Sscanf(rest, "%d", &n); err != nil {
		return 0, false
	}
	return n, true
}

// errFFmpegMissing is surfaced when the host has no ffmpeg binary on PATH.
var errFFmpegMissing = errors.New("ffmpeg not found in PATH")

// runA1 implements the proprietary A1/P1 camera protocol:
//
//   1. TLS dial port 6000 (self-signed cert)
//   2. Send 80-byte auth packet:
//        magic   uint32 LE = 0x40
//        length  uint32 LE = 0x3000
//        zero    uint32 LE = 0
//        zero    uint32 LE = 0
//        user    [32]byte  "bblp" + null padding
//        pass    [32]byte  <access_code> + null padding
//   3. Loop: read 16-byte header (first u32 LE = JPEG payload size,
//      remaining 12 bytes are unused), then read that many bytes of JPEG.
//
// Reconnects with exponential backoff (capped at 10s) on any error so a
// flaky printer doesn't permanently break the stream.
func (c *cameraProxy) runA1(ctx context.Context) {
	defer func() {
		c.mu.Lock()
		c.stopLocked()
		c.mu.Unlock()
	}()
	backoff := time.Second
	for ctx.Err() == nil {
		if err := c.dialAndStreamA1(ctx); err != nil {
			c.markErr(err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 10*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second
	}
}

func (c *cameraProxy) dialAndStreamA1(ctx context.Context) error {
	addr := net.JoinHostPort(c.cfg.Host, "6000")
	d := &net.Dialer{Timeout: 8 * time.Second}
	rawConn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("camera dial %s: %w", addr, err)
	}
	tlsConn := tls.Client(rawConn, &tls.Config{InsecureSkipVerify: true})
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		_ = rawConn.Close()
		return fmt.Errorf("camera tls: %w", err)
	}
	defer tlsConn.Close()

	auth := make([]byte, 80)
	binary.LittleEndian.PutUint32(auth[0:4], 0x40)
	binary.LittleEndian.PutUint32(auth[4:8], 0x3000)
	// 8..16 left zero
	copy(auth[16:48], []byte("bblp"))
	copy(auth[48:80], []byte(c.cfg.AccessCode))

	_ = tlsConn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if _, err := tlsConn.Write(auth); err != nil {
		return fmt.Errorf("camera auth write: %w", err)
	}
	_ = tlsConn.SetWriteDeadline(time.Time{})

	logger.Info("bambu/" + c.cfg.Name + ": camera connected, streaming")

	hdr := make([]byte, 16)
	for {
		if ctx.Err() != nil {
			return nil
		}
		_ = tlsConn.SetReadDeadline(time.Now().Add(15 * time.Second))
		if _, err := io.ReadFull(tlsConn, hdr); err != nil {
			return fmt.Errorf("camera header: %w", err)
		}
		size := binary.LittleEndian.Uint32(hdr[0:4])
		if size == 0 || size > 4*1024*1024 {
			return fmt.Errorf("camera bogus frame size %d", size)
		}
		jpeg := make([]byte, size)
		if _, err := io.ReadFull(tlsConn, jpeg); err != nil {
			return fmt.Errorf("camera body: %w", err)
		}
		// Sanity-check JPEG SOI marker so we notice a desync immediately.
		if len(jpeg) < 4 || jpeg[0] != 0xFF || jpeg[1] != 0xD8 {
			return fmt.Errorf("camera not-a-jpeg (got %02x %02x)", jpeg[0], jpeg[1])
		}
		c.broadcast(jpeg)
	}
}
