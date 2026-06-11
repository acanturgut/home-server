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
	"github.com/acanturgut/home-server/apps"
	"github.com/acanturgut/home-server/asusrouter"
	"github.com/acanturgut/home-server/auth"
	"github.com/acanturgut/home-server/bambu"
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homedevices"
	"github.com/acanturgut/home-server/homedns"
	"github.com/acanturgut/home-server/apitokens"
	"github.com/acanturgut/home-server/homekit"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/network"
	"github.com/acanturgut/home-server/nodestate"
	"github.com/acanturgut/home-server/trader"
	"github.com/acanturgut/home-server/villanos"
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
	aiClient := ai.NewClient()
	ns := nodestate.NewStore()
	appStore := apps.NewStore(cfg.DataDir)
	promptStore := apps.NewPromptStore(cfg.DataDir)
	settingsStore := apps.NewSettingsStore(cfg.DataDir)
	taskHistory := apps.NewTaskHistory(cfg.DataDir)
	pipeline := apps.NewPipeline(appStore, promptStore, settingsStore, taskHistory)
	handler := api.NewHandler(router, cfg, nodes, ns, appStore, pipeline, aiClient, promptStore, settingsStore, version)
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

	// API tokens (bearer auth for Shortcuts, mobile app, scripts).
	// On first run, an existing siri.json is migrated automatically.
	tokenStore := apitokens.NewStore(cfg.DataDir)
	handler.SetTokens(tokenStore)

	// Bambu Lab 3D printers (LAN-only MQTT + RTSPS camera proxy via FFmpeg).
	bambuStore := bambu.NewStore(cfg.DataDir)
	bambuMgr := bambu.NewManager(bambuStore)
	handler.SetBambu(bambuMgr)

	// Paper-trading agent. Single Manager process-wide; persisted to
	// <data>/trader.json. Loop is started below alongside bambuMgr.Run.
	traderStore := trader.NewStore(cfg.DataDir)
	alpaca := trader.NewAlpacaFromEnv() // nil if creds unset → simulated mode
	if alpaca != nil {
		fmt.Fprintln(os.Stderr, "trader: Alpaca paper credentials detected—routing trades through broker")
	}
	traderMgr, err := trader.NewManagerWithBroker(traderStore, router, alpaca)
	if err != nil {
		fmt.Fprintf(os.Stderr, "trader: failed to load state: %v\n", err)
	} else {
		handler.SetTrader(traderMgr)
	}

	mux := api.NewRouter(handler)

	// Start HomeKit bridge
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start crash monitor — auto-fixes deployed apps when their container exits.
	// Honours the AutoFixOnCrash runtime setting; polls every 30s.
	pipeline.StartCrashMonitor(ctx, handler.CrashMonitorDeps(), 30*time.Second)

	// Start home devices polling loop.
	go hdManager.Run(ctx, 15*time.Second)
	// Start Bambu MQTT clients (per-printer; reconnects automatically).
	bambuMgr.Run(ctx)
	if traderMgr != nil {
		go traderMgr.Run(ctx)
	}

	// VillaOS — Love Island AI agent simulation.
	villanosMgr, err := villanos.NewManager(villanos.NewStore(cfg.DataDir), router)
	if err != nil {
		fmt.Fprintf(os.Stderr, "villanos: failed to init: %v\n", err)
	} else {
		handler.SetVillanos(villanosMgr)
		go villanosMgr.Run(ctx)
	}
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
