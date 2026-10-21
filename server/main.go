package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/api"
	"github.com/acanturgut/home-server/apitokens"
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

	if err := logger.Init(cfg.LogDir); err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not init file logger: %v\n", err)
	}

	nodes := config.NewNodeStore(cfg.DataDir)

	logger.Info("starting home-server on :" + cfg.Port)
	logger.Info(fmt.Sprintf("ollama: %s | classifier: %s", cfg.OllamaHost, cfg.RouterModel))
	for _, node := range nodes.All() {
		logger.Info(fmt.Sprintf("node: %s [%s] (%s) at %s", node.Name, node.Tier, node.GPU, node.Host))
	}

	router := ai.NewRouter(cfg, nodes)
	ns := nodestate.NewStore()
	settingsStore := assistant.NewSettingsStore(cfg.DataDir)
	handler := api.NewHandler(router, cfg, nodes, ns, settingsStore, version)
	handler.StartSysCollector(5*time.Second, 60) // 5min of 5s samples

	// Smart-home device manager (Hue, Dirigera, webOS, HTTP). Bridges are
	// configured via the web UI; without any registered bridges this is a
	// no-op poll loop.
	hdStore := homedevices.NewStore(cfg.DataDir)
	hdManager := homedevices.NewManager(hdStore)
	handler.SetHomeDevices(hdManager)
	router.SetHomeController(hdManager)

	// Network device override store (per-MAC custom names).
	network.AttachStore(network.NewStore(cfg.DataDir))

	// ASUS router HTTP client (config persisted under DATA_DIR/asusrouter.json).
	handler.SetRouter(asusrouter.NewManager(cfg.DataDir))

	// Home DNS server. Binds UDP+TCP :53 (host networking required); records
	// persisted to DATA_DIR/dns_records.json. On first run, auto-points
	// canshome.com → the home-server's primary LAN IP so a freshly-pointed
	// router immediately resolves the deployment hostname.
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
	handler.SetDNS(dnsSrv)

	// Auth: users + sessions. Bootstraps an "admin" account with a random
	// one-time password (logged to stderr) on first run.
	authStore, err := auth.NewStore(cfg.DataDir)
	if err != nil {
		logger.Error("auth init: " + err.Error())
		os.Exit(1)
	}
	handler.SetAuth(authStore)

	// API tokens (bearer auth for Shortcuts and scripts).
	// On first run, an existing siri.json is migrated automatically.
	tokenStore := apitokens.NewStore(cfg.DataDir)
	handler.SetTokens(tokenStore)

	mux := api.NewRouter(handler)

	// Start HomeKit bridge
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start home devices polling loop.
	go hdManager.Run(ctx, 15*time.Second)
	// Periodic sensor-history compaction (drops samples older than 30 days).
	go func() {
		t := time.NewTicker(6 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				hdManager.History().Compact()
			}
		}
	}()

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
		Addr:    ":" + cfg.Port,
		Handler: mux,
	}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		logger.Info("shutting down...")
		cancel()
		server.Close()
	}()

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		logger.Error("server error: " + err.Error())
		os.Exit(1)
	}
}
