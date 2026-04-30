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
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homedevices"
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
	aiClient := ai.NewClient()
	ns := nodestate.NewStore()
	appStore := apps.NewStore(cfg.DataDir)
	promptStore := apps.NewPromptStore(cfg.DataDir)
	settingsStore := apps.NewSettingsStore(cfg.DataDir)
	pipeline := apps.NewPipeline(appStore, promptStore, settingsStore)
	handler := api.NewHandler(router, cfg, nodes, ns, appStore, pipeline, aiClient, promptStore, settingsStore, version)
	handler.StartSysCollector(5*time.Second, 60) // 5min of 5s samples

	// Smart-home device manager (Hue, Dirigera, webOS, HTTP). Bridges are
	// configured via the web UI; without any registered bridges this is a
	// no-op poll loop.
	hdStore := homedevices.NewStore(cfg.DataDir)
	hdManager := homedevices.NewManager(hdStore)
	handler.SetHomeDevices(hdManager)

	// Network device override store (per-MAC custom names).
	network.AttachStore(network.NewStore(cfg.DataDir))

	mux := api.NewRouter(handler)

	// Start HomeKit bridge
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start crash monitor — auto-fixes deployed apps when their container exits.
	// Honours the AutoFixOnCrash runtime setting; polls every 30s.
	pipeline.StartCrashMonitor(ctx, handler.CrashMonitorDeps(), 30*time.Second)

	// Start home devices polling loop.
	go hdManager.Run(ctx, 15*time.Second)

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
