package api

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed web/*
var webFS embed.FS

func webHandler() http.Handler {
	sub, _ := fs.Sub(webFS, "web")
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Serve index.html for SPA routes (non-file paths)
		path := r.URL.Path
		if path != "/" && !strings.Contains(path, ".") {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})
}
