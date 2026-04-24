package api

import (
	"net/http"
	"strings"
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
	mux.HandleFunc("GET /api/nodes/{id}/models", h.ListNodeModels)
	mux.HandleFunc("POST /api/nodes/{id}/models/load", h.LoadNodeModel)
	mux.HandleFunc("POST /api/nodes/{id}/models/unload", h.UnloadNodeModel)
	mux.HandleFunc("GET /api/config", h.GetConfig)
	mux.HandleFunc("PUT /api/config", h.UpdateConfig)
	mux.HandleFunc("GET /api/homekit", h.HomeKit)
	mux.HandleFunc("GET /api/system", h.System)
	mux.HandleFunc("GET /api/system/history", h.SystemHistory)
	mux.HandleFunc("POST /api/agent/heartbeat", h.AgentHeartbeat)
	mux.HandleFunc("GET /api/nodes/stats", h.NodeStats)

	// Apps pipeline
	mux.HandleFunc("GET /api/apps", h.ListApps)
	mux.HandleFunc("POST /api/apps/build", h.BuildApp)
	mux.HandleFunc("POST /api/apps/clarify", h.ClarifyApp)
	mux.HandleFunc("DELETE /api/apps/{name}", h.DeleteApp)
	mux.HandleFunc("POST /api/apps/{name}/stop", h.StopApp)
	mux.HandleFunc("POST /api/apps/{name}/cancel", h.CancelBuild)
	mux.HandleFunc("POST /api/apps/{name}/rebuild", h.RebuildApp)
	mux.HandleFunc("POST /api/apps/{name}/fix", h.FixApp)
	mux.HandleFunc("POST /api/apps/{name}/chat", h.AppChat)
	mux.HandleFunc("POST /api/apps/{name}/deploy", h.DeployApp)
	mux.HandleFunc("GET /api/apps/{name}/files", h.ListAppFiles)
	mux.HandleFunc("GET /api/apps/{name}/logs", h.AppLogs)
	mux.HandleFunc("GET /api/apps/{name}/stats", h.AppStats)
	mux.HandleFunc("GET /api/apps/{name}/search", h.AppSearch)
	mux.HandleFunc("POST /api/apps/{name}/exec", h.AppExec)
	mux.HandleFunc("PUT /api/apps/{name}/settings", h.AppSettings)

	// System prompts
	mux.HandleFunc("GET /api/prompts", h.GetPrompts)
	mux.HandleFunc("PUT /api/prompts", h.UpdatePrompts)
	mux.HandleFunc("POST /api/prompts/reset", h.ResetPrompts)

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

	// RAG + tools
	mux.HandleFunc("POST /api/rag/search", h.RAGSearch)
	mux.HandleFunc("GET /api/tools", h.ListTools)
	mux.HandleFunc("POST /api/tools/run/{name}", h.RunTool)

	// Multi-node compare & scheduler
	mux.HandleFunc("POST /api/chat/compare", h.ChatCompare)
	mux.HandleFunc("GET /api/schedules", h.ListSchedules)
	mux.HandleFunc("POST /api/schedules", h.UpsertSchedule)
	mux.HandleFunc("DELETE /api/schedules/{id}", h.DeleteSchedule)
	mux.HandleFunc("POST /api/schedules/{id}/run", h.RunScheduleNow)

	// Serve web UI at root
	webFS := webHandler()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Reverse-proxy deployed apps at /apps/{name}/
		if strings.HasPrefix(r.URL.Path, "/apps/") {
			h.ProxyApp(w, r)
			return
		}
		// File read/write API: /api/apps/{name}/files/{path...}
		if strings.HasPrefix(r.URL.Path, "/api/apps/") && strings.Contains(r.URL.Path, "/files/") {
			if r.Method == http.MethodGet {
				h.GetAppFile(w, r)
			} else if r.Method == http.MethodPut {
				h.PutAppFile(w, r)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		webFS.ServeHTTP(w, r)
	})

	return corsMiddleware(mux)
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
