package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/api"
	"github.com/acanturgut/home-server/assistant"
	"github.com/acanturgut/home-server/asusrouter"
	"github.com/acanturgut/home-server/auth"
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homedevices"
	"github.com/acanturgut/home-server/homedns"
	"github.com/acanturgut/home-server/homekit"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/network"
	"github.com/acanturgut/home-server/nodestate"
)

// version is set via -ldflags "-X main.version=..." at build time.
var version = "dev"

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "data dir: %v\n", err)
		os.Exit(1)
	}
	if err := logger.Init(cfg.LogDir); err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not init file logger: %v\n", err)
	}

	nodes := config.NewNodeStore(cfg.DataDir)
	logger.Info("starting home-server on :" + cfg.Port)
	logger.Info(fmt.Sprintf("ollama: %s | classifier: %s", cfg.OllamaHost, cfg.RouterModel))
	for _, node := range nodes.All() {
		logger.Info(fmt.Sprintf("node: %s [%s] (%s) at %s", node.Name, node.Tier, node.GPU, node.Host))
	}

	// Auth: users + sessions. Bootstraps an "admin" account with a random
	// one-time password (printed to stderr) on first run.
	authStore, err := auth.NewStore(cfg.DataDir)
	if err != nil {
		logger.Error("auth init: " + err.Error())
		os.Exit(1)
	}

	// Smart-home devices (Hue, DIRIGERA, webOS, HTTP), configured in the UI.
	homeMgr := homedevices.NewManager(homedevices.NewStore(cfg.DataDir))
	settings := assistant.NewSettingsStore(cfg.DataDir)
	ns := nodestate.NewStore()

	// Home DNS server. Binds UDP+TCP :53 (host networking required). On first
	// run it points canshome.com and home.lan at this host's LAN IP.
	dnsSrv := homedns.New(cfg.DataDir, ":53", nil)
	if ip := network.PrimaryIP(); ip != "" {
		dnsSrv.SeedDefault(homedns.Record{Name: "canshome.com.", Type: "A", Value: ip, TTL: 300})
		dnsSrv.SeedDefault(homedns.Record{Name: "home.lan.", Type: "A", Value: ip, TTL: 300})
	}
	if err := dnsSrv.Start(); err != nil {
		logger.Error("homedns: " + err.Error())
	} else {
		logger.Info("homedns: listening on :53")
	}

	handler := api.NewHandler(api.Deps{
		AI:        ai.NewRouter(cfg, nodes, settings, homeMgr),
		Config:    cfg,
		Nodes:     nodes,
		NodeState: ns,
		Settings:  settings,
		Chats:     assistant.NewChatStore(cfg.DataDir),
		Home:      homeMgr,
		Asus:      asusrouter.NewManager(cfg.DataDir),
		LAN:       network.NewScanner(cfg.DataDir),
		DNS:       dnsSrv,
		Auth:      authStore,
		Version:   version,
	})

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go handler.RunSysCollector(ctx, 5*time.Second)
	go homeMgr.Run(ctx, 15*time.Second)
	go compactSensorHistory(ctx, homeMgr)

	hkBridge, err := homekit.NewBridge(nodes, ns, cfg.DataDir, cfg.HomeKitPIN)
	if err != nil {
		logger.Error("homekit bridge failed: " + err.Error())
	} else {
		go func() {
			if err := hkBridge.Start(ctx); err != nil {
				logger.Error("homekit: " + err.Error())
			}
		}()
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.NewRouter(handler),
		ReadHeaderTimeout: 10 * time.Second,
	}
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.ListenAndServe() }()

	select {
	case err := <-serveErr:
		logger.Error("server error: " + err.Error())
		os.Exit(1)
	case <-ctx.Done():
	}
	logger.Info("shutting down...")
	dnsSrv.Stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, context.DeadlineExceeded) {
		logger.Error("shutdown: " + err.Error())
	}
}

// compactSensorHistory drops sensor samples older than 30 days every 6h.
func compactSensorHistory(ctx context.Context, m *homedevices.Manager) {
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.History().Compact()
		}
	}
}
