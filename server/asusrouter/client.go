// Package asusrouter is a small HTTP client for ASUSWRT-powered routers.
//
// It re-implements the subset of the Vaskivskyi/asusrouter Python library
// we actually need:
//
//   - POST /login.cgi with `login_authorization=<base64(user:pass)>`
//     returns JSON {"asus_token":"…"}.
//   - All subsequent requests carry `Cookie: asus_token=<token>` header.
//   - POST /appGet.cgi with `hook=<calls>` returns JSON of NVRAM values.
//   - POST /apply.cgi with action_mode/rc_service triggers system actions
//     (reboot, restart_wireless, wake-on-lan, …).
//
// Tested against AsusWRT stock and AsusWRT-Merlin firmwares.
package asusrouter

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Config describes how to reach the router.
type Config struct {
	Host     string `json:"host"`     // hostname or IP, no scheme
	Username string `json:"username"` // admin user
	Password string `json:"password"` // admin password
	UseSSL   bool   `json:"use_ssl"`
	Port     int    `json:"port"`        // 0 → 80/443 default
	Verify   bool   `json:"verify_ssl"`  // verify TLS cert (most home routers use self-signed)
	Timeout  int    `json:"timeout_sec"` // request timeout, default 10
}

// Client is an authenticated session against one router.
//
// Token is lazily acquired on first call; if a request returns a session
// expiry response we transparently re-login once before failing.
type Client struct {
	cfg Config
	mu  sync.Mutex
	hc  *http.Client
	tok string
}

// New returns a new client. It does not contact the router yet.
func New(cfg Config) *Client {
	jar, _ := cookiejar.New(nil)
	timeout := time.Duration(cfg.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: !cfg.Verify},
	}
	return &Client{
		cfg: cfg,
		hc: &http.Client{
			Jar:       jar,
			Timeout:   timeout,
			Transport: tr,
			// Don't auto-follow redirects: AsusWRT redirects to Login.asp on auth
			// failure, and we want to surface that as an error rather than try
			// to JSON-decode the HTML page.
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (c *Client) base() string {
	scheme := "http"
	port := c.cfg.Port
	if c.cfg.UseSSL {
		scheme = "https"
		if port == 0 {
			port = 443
		}
	} else if port == 0 {
		port = 80
	}
	return fmt.Sprintf("%s://%s:%d", scheme, c.cfg.Host, port)
}

// AsusWRT firmware sniffs the User-Agent and returns the HTML login page if it
// does not recognise the client. "asusrouter--DUTUtil-" is the literal value
// used by the upstream Vaskivskyi/asusrouter Python library; the trailing dash
// is intentional and required.
const userAgent = "asusrouter--DUTUtil-"

// Login obtains a fresh asus_token. Safe to call concurrently; only one
// login at a time will be performed.
func (c *Client) Login(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.loginLocked(ctx)
}

func (c *Client) loginLocked(ctx context.Context) error {
	auth := base64.StdEncoding.EncodeToString(
		[]byte(c.cfg.Username + ":" + c.cfg.Password),
	)
	body := "login_authorization=" + url.QueryEscape(auth)
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.base()+"/login.cgi", strings.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("router login: %w", err)
	}
	defer resp.Body.Close()
	buf, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("router login: HTTP %d: %s", resp.StatusCode,
			strings.TrimSpace(string(buf)))
	}
	// AsusWRT returns the login HTML page (Login.asp / index.asp) when:
	//   - the router only accepts HTTPS but we hit HTTP (or vice-versa),
	//   - the firmware version doesn't expose /login.cgi at this path,
	//   - or the request was rate-limited / IP-blocked after bad attempts.
	trimmed := strings.TrimSpace(string(buf))
	if len(trimmed) == 0 {
		return errors.New("router login: empty response (wrong host/port or HTTPS mismatch?)")
	}
	if trimmed[0] == '<' {
		hint := "got HTML instead of JSON"
		low := strings.ToLower(trimmed)
		switch {
		case strings.Contains(low, "https") && !c.cfg.UseSSL:
			hint = "router requires HTTPS — enable HTTPS in settings"
		case strings.Contains(low, "blocked") || strings.Contains(low, "lock"):
			hint = "router temporarily blocked this IP after failed logins — wait a minute and retry"
		case strings.Contains(low, "login.asp") || strings.Contains(low, "loginpage"):
			hint = "router served the login page — check username/password and that admin login isn't restricted"
		}
		return fmt.Errorf("router login: %s (snippet=%q)", hint, truncate(buf, 200))
	}
	var out struct {
		Token       string `json:"asus_token"`
		ErrorStatus string `json:"error_status"`
	}
	if err := json.Unmarshal(buf, &out); err != nil {
		return fmt.Errorf("router login: decode: %w (body=%q)", err, truncate(buf, 200))
	}
	if out.Token == "" {
		if out.ErrorStatus != "" {
			return fmt.Errorf("router login rejected: error_status=%s", out.ErrorStatus)
		}
		return errors.New("router login: empty asus_token")
	}
	c.tok = out.Token
	return nil
}

// post sends an authenticated form-encoded POST and returns the body.
// On the first 401/empty-token style failure it re-logs-in once.
func (c *Client) post(ctx context.Context, path, body string) ([]byte, error) {
	for attempt := 0; attempt < 2; attempt++ {
		c.mu.Lock()
		tok := c.tok
		c.mu.Unlock()
		if tok == "" {
			if err := c.Login(ctx); err != nil {
				return nil, err
			}
			c.mu.Lock()
			tok = c.tok
			c.mu.Unlock()
		}

		req, err := http.NewRequestWithContext(
			ctx, http.MethodPost, c.base()+"/"+path, strings.NewReader(body),
		)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", userAgent)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Cookie", "asus_token="+tok)
		resp, err := c.hc.Do(req)
		if err != nil {
			return nil, err
		}
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if resp.StatusCode == http.StatusUnauthorized ||
			(resp.StatusCode == http.StatusOK && looksLikeAuthError(buf)) {
			// Token expired — clear and retry once.
			c.mu.Lock()
			c.tok = ""
			c.mu.Unlock()
			if attempt == 0 {
				continue
			}
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("router %s: HTTP %d", path, resp.StatusCode)
		}
		return buf, nil
	}
	return nil, errors.New("router request: auth retry exhausted")
}

func looksLikeAuthError(b []byte) bool {
	// AsusWRT returns an HTML page or {"error_status":"7|8"} when token is gone.
	if len(b) == 0 {
		return true
	}
	s := strings.ToLower(string(b))
	return strings.Contains(s, "error_status") &&
		(strings.Contains(s, "\"7\"") || strings.Contains(s, "\"8\""))
}

// Hook calls /appGet.cgi with one or more hook expressions concatenated by ';'.
// Result is the raw JSON object returned by the router (keys are the hook
// names without arguments). The returned map values are usually strings.
func (c *Client) Hook(ctx context.Context, hooks ...string) (map[string]any, error) {
	if len(hooks) == 0 {
		return map[string]any{}, nil
	}
	body := "hook=" + url.QueryEscape(strings.Join(hooks, ";"))
	buf, err := c.post(ctx, "appGet.cgi", body)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	if err := json.Unmarshal(buf, &out); err != nil {
		return nil, fmt.Errorf("hook decode: %w (body=%q)", err, truncate(buf, 200))
	}
	return out, nil
}

// Apply runs an /apply.cgi service action (reboot, restart_wireless, etc.).
// extra is merged into the form payload.
func (c *Client) Apply(ctx context.Context, service string, extra map[string]string) error {
	form := url.Values{}
	form.Set("action_mode", "apply")
	form.Set("rc_service", service)
	for k, v := range extra {
		form.Set(k, v)
	}
	_, err := c.post(ctx, "apply.cgi", form.Encode())
	return err
}

// Reboot reboots the router.
func (c *Client) Reboot(ctx context.Context) error {
	return c.Apply(ctx, "reboot", nil)
}

// RestartWireless restarts the wireless radios.
func (c *Client) RestartWireless(ctx context.Context) error {
	return c.Apply(ctx, "restart_wireless", nil)
}

// WakeOnLAN sends a magic packet via the router. mac may be lower or upper
// case, with ':' or '-' separators.
func (c *Client) WakeOnLAN(ctx context.Context, mac string) error {
	mac = strings.ReplaceAll(strings.ToLower(strings.TrimSpace(mac)), "-", ":")
	if mac == "" {
		return errors.New("wol: empty mac")
	}
	form := url.Values{}
	form.Set("action_mode", "apply")
	form.Set("rc_service", "")
	form.Set("wol_mac", mac)
	_, err := c.post(ctx, "applyapp.cgi", form.Encode())
	return err
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
