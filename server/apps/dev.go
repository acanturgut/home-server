package apps

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Hot-reload dev containers.
//
// A "dev container" runs the app's source via a HOST bind mount so that file
// changes (written by aider into projectDir) are immediately visible inside
// the container. The container runs `npm install && (npm run dev || node
// --watch server.js)` which both watches and serves. AI Fix/Rebuild actions
// can therefore skip the slow Docker build/run cycle entirely while dev mode
// is on.
//
// Caveat: home-server itself runs in a container with /data backed by a named
// volume. To bind-mount the app source into a sibling container we need the
// HOST-side path of that volume. We discover it once via `docker volume
// inspect` and cache it.

var (
	hostDataDirOnce sync.Once
	hostDataDir     string
)

// hostAppsDir returns the absolute HOST path corresponding to /data/apps so
// that we can pass it as the source of a `docker run -v <src>:/app` mount.
// Returns "" if discovery fails.
func (p *Pipeline) hostAppsDir(ctx context.Context) string {
	hostDataDirOnce.Do(func() {
		// Allow explicit override (useful for local dev where the server
		// runs on the host, not in a container).
		if v := strings.TrimSpace(os.Getenv("HOST_APPS_DIR")); v != "" {
			hostDataDir = v
			return
		}
		// Try common compose volume names.
		candidates := []string{"home-server_server-data", "homeserver_server-data", "server-data"}
		for _, vol := range candidates {
			out, err := runCmd(ctx, ".", "docker", "volume", "inspect", vol, "--format", "{{.Mountpoint}}")
			if err == nil {
				mp := strings.TrimSpace(out)
				if mp != "" {
					hostDataDir = filepath.Join(mp, "apps")
					return
				}
			}
		}
		// Last resort: assume the server runs on the host (DATA_DIR=$PWD/data).
		if dd := strings.TrimSpace(os.Getenv("DATA_DIR")); dd != "" {
			hostDataDir = filepath.Join(dd, "apps")
		}
	})
	return hostDataDir
}

// devImageTag returns the image tag for an app's dev container.
func devImageTag(name string) string { return name + "-dev" }

// devContainerName returns the container name for an app's dev container.
// We intentionally use the SAME name as the prod container so only one runs
// at a time (port collision otherwise).
func devContainerName(name string) string { return name }

// IsDevRunning reports whether a dev container is currently running for the app.
func (p *Pipeline) IsDevRunning(ctx context.Context, name string) bool {
	out, err := runCmd(ctx, ".", "docker", "inspect", "-f",
		"{{.State.Running}}|{{index .Config.Labels \"home-server.dev\"}}", devContainerName(name))
	if err != nil {
		return false
	}
	parts := strings.Split(strings.TrimSpace(out), "|")
	return len(parts) == 2 && parts[0] == "true" && parts[1] == "1"
}

// StartDev builds (if needed) the dev image for the app and runs it with a
// host bind mount of the project directory. The current prod container is
// stopped first so the port is free.
func (p *Pipeline) StartDev(ctx context.Context, name string, emit func(PipelineEvent)) error {
	app, ok := p.store.Get(name)
	if !ok {
		return fmt.Errorf("app '%s' not found", name)
	}
	projectDir := p.store.ProjectDir(name)
	hostDir := p.hostAppsDir(ctx)
	if hostDir == "" {
		return fmt.Errorf("could not resolve HOST path for /data/apps (set HOST_APPS_DIR)")
	}
	hostProject := filepath.Join(hostDir, name)

	// Always (re)write Dockerfile.dev so users pick up updates to the recipe.
	devDockerfile := filepath.Join(projectDir, "Dockerfile.dev")
	{
		content := fmt.Sprintf(`FROM node:20-alpine
WORKDIR /app
EXPOSE %d
# Source is bind-mounted at runtime. Startup:
#  1. npm install (cached after first run via the bind-mounted node_modules)
#  2. one synchronous vite build so dist/index.html exists before the server starts
#  3. concurrently: vite build --watch (rebuilds dist/ on every change)
#                   node --watch server.js (restarts on server.js changes)
CMD ["sh","-c","set -e; npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -5; if [ -f components.json ] && [ ! -f src/components/ui/button.jsx ] && [ ! -f src/components/ui/button.tsx ]; then echo '[dev] adding shadcn components...'; npx shadcn@latest add button card input label badge separator textarea switch scroll-area -y --overwrite 2>&1 | tail -10 || echo '[dev] shadcn add failed'; fi; if [ -f vite.config.js ] || [ -f vite.config.ts ]; then echo '[dev] initial vite build...'; npx vite build --mode development; npx --yes concurrently --kill-others-on-fail --names vite,node -c yellow,cyan \"npx vite build --watch --mode development\" \"node --watch server.js\"; else node --watch server.js; fi"]
`, app.Port)
		if err := os.WriteFile(devDockerfile, []byte(content), 0644); err != nil {
			return fmt.Errorf("write Dockerfile.dev: %v", err)
		}
	}

	emit(newEvent("planning", "Building dev image (one-time, ~10s)..."))
	out, err := runCmd(ctx, projectDir, "docker", "build", "-t", devImageTag(name), "-f", "Dockerfile.dev", ".")
	if err != nil {
		return fmt.Errorf("docker build dev: %v\n%s", err, truncate(out, 1500))
	}

	// Stop any existing container with this name (prod or stale dev).
	runCmd(ctx, ".", "docker", "rm", "-f", devContainerName(name))

	emit(newEvent("deploying", fmt.Sprintf("Starting dev container with bind mount %s ...", hostProject)))
	out, err = runCmd(ctx, ".", "docker", "run", "-d",
		"--name", devContainerName(name),
		"--network", "host",
		"--label", "home-server.dev=1",
		"-e", fmt.Sprintf("PORT=%d", app.Port),
		"-v", hostProject+":/app",
		devImageTag(name))
	if err != nil {
		return fmt.Errorf("docker run dev: %v\n%s", err, truncate(out, 1500))
	}

	// Health check (lenient — npm install + first vite build can take a while
	// on slower hosts).
	healthURL := fmt.Sprintf("http://localhost:%d/health", app.Port)
	deadline := time.Now().Add(120 * time.Second)
	healthy := false
	for time.Now().Before(deadline) {
		time.Sleep(2 * time.Second)
		state, _ := runCmd(ctx, ".", "docker", "inspect", "-f", "{{.State.Running}}", devContainerName(name))
		if strings.TrimSpace(state) != "true" {
			logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "30", devContainerName(name))
			return fmt.Errorf("dev container exited.\nLogs:\n%s", truncate(logs, 1500))
		}
		out, _ := runCmd(ctx, ".", "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", healthURL)
		if strings.TrimSpace(out) == "200" {
			healthy = true
			break
		}
	}
	if !healthy {
		emit(newEvent("warning", "Dev container is up but /health hasn't responded yet — vite may still be doing the first build."))
	}

	app.DevMode = true
	app.Status = StatusRunning
	app.Error = ""
	p.store.Set(app)
	emit(newEvent("done", fmt.Sprintf("⚡ Hot reload enabled on port %d", app.Port)))
	return nil
}

// StopDev stops the dev container and clears DevMode. The user typically calls
// Deploy afterwards to restart the prod container from current files.
func (p *Pipeline) StopDev(ctx context.Context, name string) error {
	app, ok := p.store.Get(name)
	if !ok {
		return fmt.Errorf("app '%s' not found", name)
	}
	runCmd(ctx, ".", "docker", "rm", "-f", devContainerName(name))
	app.DevMode = false
	p.store.Set(app)
	return nil
}
