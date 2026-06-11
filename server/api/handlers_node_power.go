package api

import (
	"net/http"
	"time"

	"github.com/acanturgut/home-server/logger"
	"golang.org/x/crypto/ssh"
)

// POST /api/nodes/{id}/shutdown — graceful remote shutdown over SSH using the
// node's stored credentials. Requires SSHUser + SSHPass to be set. Sends
// `sudo -S shutdown -h now` with the password piped on stdin.
func (h *Handler) ShutdownNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	node, ok := h.nodes.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	if node.SSHUser == "" || node.SSHPass == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{
			Error: "node has no SSH credentials configured",
		})
		return
	}
	if node.Host == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node host missing"})
		return
	}

	cfg := &ssh.ClientConfig{
		User:            node.SSHUser,
		Auth:            []ssh.AuthMethod{ssh.Password(node.SSHPass)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         8 * time.Second,
	}
	addr := node.Host
	if !hasPort(addr) {
		addr += ":22"
	}
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		logger.Error("shutdown: ssh dial " + node.Name + ": " + err.Error())
		writeJSON(w, http.StatusBadGateway, errorResp{
			Error: "ssh dial failed: " + err.Error(),
		})
		return
	}
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{
			Error: "ssh session failed: " + err.Error(),
		})
		return
	}
	defer sess.Close()

	// `sudo -S` reads password from stdin; `nohup ... &` lets the process
	// detach so the shutdown command succeeds even after sshd exits.
	cmd := "echo '" + escapeSingle(node.SSHPass) +
		"' | sudo -S nohup shutdown -h now >/dev/null 2>&1 &"
	if err := sess.Run(cmd); err != nil {
		// Connection is often torn down before Run() returns cleanly; treat
		// non-fatal exit reasons as success.
		logger.Info("shutdown: " + node.Name + " ssh run returned: " + err.Error())
	}
	logger.Info("shutdown sent to " + node.Name + " (" + addr + ")")
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "sent",
		"node":   node.Name,
	})
}

func hasPort(host string) bool {
	for i := len(host) - 1; i >= 0; i-- {
		if host[i] == ':' {
			return true
		}
		if host[i] == ']' {
			return false
		}
	}
	return false
}

func escapeSingle(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\'' {
			out = append(out, '\'', '\\', '\'', '\'')
			continue
		}
		out = append(out, s[i])
	}
	return string(out)
}
