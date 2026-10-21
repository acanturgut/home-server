package api

import (
	"net/http"

	"github.com/acanturgut/home-server/auth"
)

// maxBodyBytes caps every request body; the largest legitimate one is the
// chat-history blob on PUT /api/chats.
const maxBodyBytes = 8 << 20

func NewRouter(h *Handler) http.Handler {
	mux := http.NewServeMux()
	admin := auth.RequireAdmin

	mux.HandleFunc("POST /api/chat", h.Chat)
	mux.HandleFunc("POST /api/chat/stream", h.ChatStream)
	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/logs", h.Logs)
	mux.HandleFunc("GET /api/nodes", h.GetNodes)
	mux.HandleFunc("POST /api/nodes", h.AddNode)
	mux.HandleFunc("PUT /api/nodes/{id}", h.UpdateNode)
	mux.HandleFunc("DELETE /api/nodes/{id}", h.DeleteNode)
	mux.HandleFunc("POST /api/nodes/{id}/wake", h.WakeNode)
	mux.HandleFunc("POST /api/nodes/{id}/shutdown", h.ShutdownNode)
	mux.HandleFunc("GET /api/nodes/{id}/models", h.ListNodeModels)
	mux.HandleFunc("GET /api/nodes/{id}/models/status", h.NodeModelsStatus)
	mux.HandleFunc("POST /api/nodes/{id}/models/load", h.LoadNodeModel)
	mux.HandleFunc("POST /api/nodes/{id}/models/unload", h.UnloadNodeModel)
	mux.HandleFunc("GET /api/nodes/stats", h.NodeStats)
	mux.HandleFunc("GET /api/config", h.GetConfig)
	mux.HandleFunc("PUT /api/config", h.UpdateConfig)
	mux.HandleFunc("GET /api/homekit", h.HomeKit)
	mux.HandleFunc("GET /api/system", h.System)
	mux.HandleFunc("GET /api/system/history", h.SystemHistory)
	mux.HandleFunc("POST /api/agent/heartbeat", h.AgentHeartbeat)

	// Home devices (Hue / DIRIGERA / webOS / generic HTTP). Bridges carry hub
	// credentials, so managing them is admin-only.
	mux.HandleFunc("GET /api/home/bridges", admin(h.ListHomeBridges))
	mux.HandleFunc("POST /api/home/bridges", admin(h.AddHomeBridge))
	mux.HandleFunc("PUT /api/home/bridges/{id}", admin(h.UpdateHomeBridge))
	mux.HandleFunc("DELETE /api/home/bridges/{id}", admin(h.DeleteHomeBridge))
	mux.HandleFunc("POST /api/home/dirigera/pair", admin(h.PairDirigera))
	mux.HandleFunc("POST /api/home/hue/pair", admin(h.PairHue))
	mux.HandleFunc("GET /api/home/devices", h.ListHomeDevices)
	mux.HandleFunc("POST /api/home/devices/{id}/action", h.ApplyHomeAction)
	mux.HandleFunc("PUT /api/home/devices/{id}/override", h.SetHomeDeviceOverride)
	mux.HandleFunc("GET /api/home/devices/{id}/history", h.GetHomeDeviceHistory)
	mux.HandleFunc("POST /api/home/refresh", h.RefreshHomeDevices)

	// Network discovery (LAN ARP table + reverse DNS)
	mux.HandleFunc("GET /api/network/devices", h.NetworkDevices)
	mux.HandleFunc("PUT /api/network/devices/{mac}", h.RenameNetworkDevice)

	// ASUS router (AsusWRT/Merlin HTTP API)
	mux.HandleFunc("GET /api/router/config", h.RouterConfig)
	mux.HandleFunc("PUT /api/router/config", h.UpdateRouterConfig)
	mux.HandleFunc("POST /api/router/test", h.TestRouter)
	mux.HandleFunc("GET /api/router/status", h.RouterStatus)
	mux.HandleFunc("GET /api/router/clients", h.RouterClients)
	mux.HandleFunc("POST /api/router/reboot", h.RouterReboot)
	mux.HandleFunc("POST /api/router/restart-wireless", h.RouterRestartWireless)
	mux.HandleFunc("POST /api/router/wol", h.RouterWOL)
	mux.HandleFunc("POST /api/router/block", h.RouterBlock)

	// Home DNS
	mux.HandleFunc("GET /api/dns/status", h.DNSStatus)
	mux.HandleFunc("GET /api/dns/records", h.DNSRecords)
	mux.HandleFunc("POST /api/dns/records", h.AddDNSRecord)
	mux.HandleFunc("PUT /api/dns/records", h.ReplaceDNSRecords)
	mux.HandleFunc("DELETE /api/dns/records", h.DeleteDNSRecord)

	// Ad-blocker
	mux.HandleFunc("GET /api/dns/blocklist", h.DNSBlocklistStatus)
	mux.HandleFunc("PUT /api/dns/blocklist", h.DNSBlocklistSetEnabled)
	mux.HandleFunc("POST /api/dns/blocklist/sources", h.DNSBlocklistAddSource)
	mux.HandleFunc("DELETE /api/dns/blocklist/sources", h.DNSBlocklistRemoveSource)
	mux.HandleFunc("PUT /api/dns/blocklist/sources/toggle", h.DNSBlocklistToggleSource)
	mux.HandleFunc("POST /api/dns/blocklist/refresh", h.DNSBlocklistRefresh)
	mux.HandleFunc("POST /api/dns/blocklist/allow", h.DNSBlocklistAddAllow)
	mux.HandleFunc("DELETE /api/dns/blocklist/allow", h.DNSBlocklistRemoveAllow)

	// Auth (login + self-service open; user CRUD admin-only)
	mux.HandleFunc("POST /api/auth/login", h.AuthLogin)
	mux.HandleFunc("POST /api/auth/logout", h.AuthLogout)
	mux.HandleFunc("GET /api/auth/me", h.AuthMe)
	mux.HandleFunc("POST /api/auth/change-password", h.AuthChangePassword)
	mux.HandleFunc("GET /api/auth/users", admin(h.AuthListUsers))
	mux.HandleFunc("POST /api/auth/users", admin(h.AuthCreateUser))
	mux.HandleFunc("PUT /api/auth/users/{id}/role", admin(h.AuthSetRole))
	mux.HandleFunc("PUT /api/auth/users/{id}/password", admin(h.AuthResetPassword))
	mux.HandleFunc("DELETE /api/auth/users/{id}", admin(h.AuthDeleteUser))

	// Dashboard overview (location, public IP, weather) and cluster aggregate
	mux.HandleFunc("GET /api/dashboard/overview", h.DashboardOverview)
	mux.HandleFunc("GET /api/dashboard/cluster", h.DashboardCluster)

	// Runtime settings
	mux.HandleFunc("GET /api/settings", h.GetSettings)
	mux.HandleFunc("PUT /api/settings", h.UpdateSettings)
	mux.HandleFunc("POST /api/settings/reset", h.ResetSettings)

	// Chat history
	mux.HandleFunc("GET /api/chats", h.ListChats)
	mux.HandleFunc("PUT /api/chats", h.SaveChats)

	// Unknown API paths are 404s, not the SPA shell.
	mux.HandleFunc("/api/", http.NotFound)

	// Serve web UI at root
	mux.Handle("/", webHandler())

	authed := h.auth.Middleware(
		"/api/auth/login",
		"/api/agent/heartbeat", // node agents push without a session
	)(mux)
	return http.MaxBytesHandler(authed, maxBodyBytes)
}
