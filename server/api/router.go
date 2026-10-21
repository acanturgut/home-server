package api

import (
	"net/http"

	"github.com/acanturgut/home-server/auth"
)

func NewRouter(h *Handler) http.Handler {
	mux := http.NewServeMux()

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
	mux.HandleFunc("GET /api/config", h.GetConfig)
	mux.HandleFunc("PUT /api/config", h.UpdateConfig)
	mux.HandleFunc("GET /api/homekit", h.HomeKit)
	mux.HandleFunc("GET /api/system", h.System)
	mux.HandleFunc("GET /api/system/history", h.SystemHistory)
	mux.HandleFunc("POST /api/agent/heartbeat", h.AgentHeartbeat)
	mux.HandleFunc("GET /api/nodes/stats", h.NodeStats)

	// Home devices (Hue / Dirigera / webOS / generic HTTP)
	mux.HandleFunc("GET /api/home/bridges", h.ListHomeBridges)
	mux.HandleFunc("POST /api/home/bridges", h.AddHomeBridge)
	mux.HandleFunc("PUT /api/home/bridges/{id}", h.UpdateHomeBridge)
	mux.HandleFunc("DELETE /api/home/bridges/{id}", h.DeleteHomeBridge)
	mux.HandleFunc("GET /api/home/devices", h.ListHomeDevices)
	mux.HandleFunc("POST /api/home/devices/{id}/action", h.ApplyHomeAction)
	mux.HandleFunc("PUT /api/home/devices/{id}/override", h.SetHomeDeviceOverride)
	mux.HandleFunc("GET /api/home/devices/{id}/history", h.GetHomeDeviceHistory)
	mux.HandleFunc("POST /api/home/refresh", h.RefreshHomeDevices)
	mux.HandleFunc("POST /api/home/dirigera/pair", h.PairDirigera)

	// Network discovery (LAN ARP table + reverse DNS)
	mux.HandleFunc("GET /api/network/devices", h.NetworkDevices)
	mux.HandleFunc("PUT /api/network/devices/{mac}", h.RenameNetworkDevice)

	// ASUS router (asusrouter-style HTTP client against AsusWRT/Merlin)
	mux.HandleFunc("GET /api/router/config", h.RouterConfig)
	mux.HandleFunc("PUT /api/router/config", h.UpdateRouterConfig)
	mux.HandleFunc("POST /api/router/test", h.TestRouter)
	mux.HandleFunc("GET /api/router/status", h.RouterStatus)
	mux.HandleFunc("GET /api/router/clients", h.RouterClients)
	mux.HandleFunc("POST /api/router/reboot", h.RouterReboot)
	mux.HandleFunc("POST /api/router/restart-wireless", h.RouterRestartWireless)
	mux.HandleFunc("POST /api/router/wol", h.RouterWOL)
	mux.HandleFunc("POST /api/router/block", h.RouterBlock)
	mux.HandleFunc("GET /api/router/blocked", h.RouterBlocked)

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
	mux.HandleFunc("GET /api/auth/users", auth.RequireAdmin(h.AuthListUsers))
	mux.HandleFunc("POST /api/auth/users", auth.RequireAdmin(h.AuthCreateUser))
	mux.HandleFunc("PUT /api/auth/users/{id}/role", auth.RequireAdmin(h.AuthSetRole))
	mux.HandleFunc("PUT /api/auth/users/{id}/password", auth.RequireAdmin(h.AuthResetPassword))
	mux.HandleFunc("DELETE /api/auth/users/{id}", auth.RequireAdmin(h.AuthDeleteUser))

	// Dashboard overview (location, public IP, weather, cluster aggregate, recent clients)
	mux.HandleFunc("GET /api/dashboard/overview", h.DashboardOverview)
	mux.HandleFunc("GET /api/dashboard/cluster", h.DashboardCluster)
	mux.HandleFunc("GET /api/dashboard/clients", h.DashboardClients)

	// Runtime settings
	mux.HandleFunc("GET /api/settings", h.GetSettings)
	mux.HandleFunc("PUT /api/settings", h.UpdateSettings)
	mux.HandleFunc("POST /api/settings/reset", h.ResetSettings)

	// Chat utilities
	mux.HandleFunc("POST /api/fetch-url", h.FetchURL)
	mux.HandleFunc("GET /api/chats", h.ListChats)
	mux.HandleFunc("PUT /api/chats", h.SaveChats)
	mux.HandleFunc("GET /api/snippets", h.ListSnippets)
	mux.HandleFunc("POST /api/snippets", h.CreateSnippet)
	mux.HandleFunc("DELETE /api/snippets/{id}", h.DeleteSnippet)

	// Web search
	mux.HandleFunc("POST /api/web/search", h.WebSearch)
	mux.HandleFunc("POST /api/web/search-fetch", h.WebSearchFetch)

	// Tools
	mux.HandleFunc("GET /api/tools", h.ListTools)
	mux.HandleFunc("POST /api/tools/run/{name}", h.RunTool)

	// Multi-node compare & scheduler
	mux.HandleFunc("POST /api/chat/compare", h.ChatCompare)
	mux.HandleFunc("GET /api/schedules", h.ListSchedules)
	mux.HandleFunc("POST /api/schedules", h.UpsertSchedule)
	mux.HandleFunc("DELETE /api/schedules/{id}", h.DeleteSchedule)
	mux.HandleFunc("POST /api/schedules/{id}/run", h.RunScheduleNow)

	// AI / voice ask endpoint. /api/ai/ask is bearer-token authed inline
	// against the API tokens store. /api/siri/ask is kept as an alias so
	// the existing iPhone Shortcut keeps working without re-pairing.
	mux.HandleFunc("POST /api/ai/ask", h.AIAsk)
	mux.HandleFunc("POST /api/siri/ask", h.AIAsk)

	// API token CRUD (cookie-authed admin endpoints).
	mux.HandleFunc("GET /api/tokens", h.ListTokens)
	mux.HandleFunc("POST /api/tokens", h.CreateToken)
	mux.HandleFunc("PATCH /api/tokens/{id}", h.RenameToken)
	mux.HandleFunc("POST /api/tokens/{id}/rotate", h.RotateToken)
	mux.HandleFunc("DELETE /api/tokens/{id}", h.DeleteToken)

	// Unknown API paths are 404s, not the SPA shell.
	mux.HandleFunc("/api/", http.NotFound)

	// Serve web UI at root
	mux.Handle("/", webHandler())

	var handler http.Handler = mux
	if h.auth != nil {
		handler = h.auth.Middleware([]string{
			"/api/auth/login",
			"/api/agent/heartbeat", // node agents push without a session
			"/api/health",
			"/api/ai/ask",   // bearer token, no cookie
			"/api/siri/ask", // legacy alias, same handler
		})(handler)
	}
	return corsMiddleware(trackerMiddleware(handler))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
