package apps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// PipelineEvent is streamed to the client during a build.
type PipelineEvent struct {
	Step      string         `json:"step"` // planning, task, merging, validating, deploying, done, error
	Message   string         `json:"message"`
	Detail    string         `json:"detail,omitempty"`
	Latency   string         `json:"latency,omitempty"`
	Timestamp string         `json:"timestamp"`
	Tasks     []PipelineTask `json:"tasks,omitempty"`  // sent once during planning to define the task board
	TaskID    int            `json:"taskId,omitempty"` // which task this event is about
}

// PipelineTask is a single TODO item in the build plan.
type PipelineTask struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Worker      string `json:"worker"` // "heavy" or "light"
	NodeName    string `json:"nodeName,omitempty"`
	Model       string `json:"model,omitempty"`
	Status      string `json:"status"` // "pending", "running", "done", "error"
	Latency     string `json:"latency,omitempty"`
}

func newEvent(step, message string) PipelineEvent {
	return PipelineEvent{Step: step, Message: message, Timestamp: time.Now().Format(time.RFC3339)}
}

func newEventDetail(step, message, detail string) PipelineEvent {
	return PipelineEvent{Step: step, Message: message, Detail: detail, Timestamp: time.Now().Format(time.RFC3339)}
}

func newEventLatency(step, message, detail, latency string) PipelineEvent {
	return PipelineEvent{Step: step, Message: message, Detail: detail, Latency: latency, Timestamp: time.Now().Format(time.RFC3339)}
}

// NodeInfo describes a compute node.
type NodeInfo struct {
	Name  string
	Host  string
	Model string
	Tier  string // "high-end" or "low-end"
}

// CallLMFunc is the function type for calling an LM Studio node.
type CallLMFunc func(ctx context.Context, host, model string, messages []map[string]string) (string, error)

// Pipeline orchestrates the full build-deploy cycle.
type Pipeline struct {
	store    *Store
	prompts  *PromptStore
	settings *SettingsStore
	mu       sync.Mutex
	cancels  map[string]context.CancelFunc // active build cancel functions keyed by app name
	active   map[string]bool               // app names with an in-flight build/rebuild/fix
}

func NewPipeline(store *Store, prompts *PromptStore, settings *SettingsStore) *Pipeline {
	return &Pipeline{store: store, prompts: prompts, settings: settings, cancels: make(map[string]context.CancelFunc), active: make(map[string]bool)}
}

// IsActive reports whether an app currently has a build/rebuild/fix in flight.
func (p *Pipeline) IsActive(name string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.active[name]
}

// Cancel cancels an active build for the given app name.
func (p *Pipeline) Cancel(name string) bool {
	p.mu.Lock()
	cancel, ok := p.cancels[name]
	p.mu.Unlock()
	if ok {
		cancel()
	}
	return ok
}

func (p *Pipeline) registerCancel(name string, cancel context.CancelFunc) {
	p.mu.Lock()
	p.cancels[name] = cancel
	p.active[name] = true
	p.mu.Unlock()
}

func (p *Pipeline) unregisterCancel(name string) {
	p.mu.Lock()
	delete(p.cancels, name)
	delete(p.active, name)
	p.mu.Unlock()
}

// scaffoldProject creates the boilerplate files for a new app so aider only has to implement the logic.
func scaffoldProject(projectDir, appName string, port int, route string) {
	// package.json
	writeIfMissing(projectDir+"/package.json", fmt.Sprintf(`{
  "name": "%s",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1",
    "lucide-react": "^0.344.0",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-checkbox": "^1.0.4",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "@radix-ui/react-accordion": "^1.1.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "tailwindcss-animate": "^1.0.7",
    "vite": "^5.0.12"
  }
}
`, appName))

	// server.js
	writeIfMissing(projectDir+"/server.js", fmt.Sprintf(`const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || %d;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Add your API routes here

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
`, port))

	// vite.config.js
	writeIfMissing(projectDir+"/vite.config.js", `const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('path');

module.exports = defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`)

	// tailwind.config.js
	writeIfMissing(projectDir+"/tailwind.config.js", `const { fontFamily } = require('tailwindcss/defaultTheme');

module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
`)

	// postcss.config.js
	writeIfMissing(projectDir+"/postcss.config.js", `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`)

	// index.html
	writeIfMissing(projectDir+"/index.html", `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>`+appName+`</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`)

	// src/main.jsx
	os.MkdirAll(projectDir+"/src", 0755)
	writeIfMissing(projectDir+"/src/main.jsx", `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`)

	// src/App.jsx — minimal placeholder with shadcn theming
	writeIfMissing(projectDir+"/src/App.jsx", `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <h1 className="text-2xl font-bold">Loading...</h1>
    </div>
  );
}
`)

	// src/lib/utils.js
	os.MkdirAll(projectDir+"/src/lib", 0755)
	writeIfMissing(projectDir+"/src/lib/utils.js", `import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
`)

	// components.json — shadcn project config (enables CLI + AI detection)
	writeIfMissing(projectDir+"/components.json", `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
`)

	// jsconfig.json — required by shadcn CLI to resolve @ alias
	writeIfMissing(projectDir+"/jsconfig.json", `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
`)

	// src/components/ui/ directory
	os.MkdirAll(projectDir+"/src/components/ui", 0755)

	// src/index.css — shadcn CSS variables
	writeIfMissing(projectDir+"/src/index.css", `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`)

	// Dockerfile
	writeIfMissing(projectDir+"/Dockerfile", fmt.Sprintf(`FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY components.json jsconfig.json ./
RUN npm install
COPY . .
RUN npx shadcn@latest add button card input label badge separator textarea switch scroll-area -y --overwrite 2>/dev/null || true
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./
COPY --from=build /app/package*.json ./
COPY --from=build /app/*.js ./
RUN npm install --production
ENV NODE_ENV=production
EXPOSE %d
CMD ["node", "server.js"]
`, port))

	// app.json
	writeIfMissing(projectDir+"/app.json", fmt.Sprintf(`{"name": "%s", "port": %d, "healthcheck": "/health", "route": "%s", "type": "webapp"}
`, appName, port, route))
}

func writeIfMissing(path, content string) {
	if _, err := os.Stat(path); err != nil {
		os.WriteFile(path, []byte(content), 0644)
	}
}

// discoverModel queries the LM Studio /v1/models endpoint and returns the first non-embedding model.
func discoverModel(host string) (string, error) {
	apiBase := strings.TrimSuffix(host, "/v1")
	url := apiBase + "/v1/models"
	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to reach %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse models response: %v", err)
	}
	for _, m := range result.Data {
		// Skip embedding models
		if strings.Contains(strings.ToLower(m.ID), "embed") {
			continue
		}
		return m.ID, nil
	}
	if len(result.Data) > 0 {
		return result.Data[0].ID, nil
	}
	return "", fmt.Errorf("no models loaded on %s", host)
}

// runAider runs aider in the given directory with the specified message, using the heavy node's LM Studio API.
func (p *Pipeline) runAider(ctx context.Context, projectDir string, message string, heavy NodeInfo, emit func(PipelineEvent)) error {
	// Extract base URL — ensure it ends with /v1
	apiBase := strings.TrimSuffix(heavy.Host, "/v1")
	if !strings.HasSuffix(apiBase, "/v1") {
		apiBase = apiBase + "/v1"
	}

	// Auto-detect model from LM Studio if not configured
	model := heavy.Model
	if model == "" {
		discovered, err := discoverModel(heavy.Host)
		if err != nil {
			return fmt.Errorf("no model configured and auto-detect failed: %v", err)
		}
		model = discovered
		emit(newEvent("task", fmt.Sprintf("Auto-detected model: %s", model)))
	}

	args := []string{
		"--message", message,
		"--yes-always",
		"--no-git",
		"--no-auto-commits",
		"--no-suggest-shell-commands",
		"--no-analytics",
		"--no-fancy-input",
		"--no-show-model-warnings",
		"--model", "openai/" + model,
		"--openai-api-key", "dummy",
		"--openai-api-base", apiBase,
	}

	// Explicitly add all source files so aider can edit them (critical for fix phase)
	sourceFiles := listSourceFiles(projectDir)
	for _, f := range sourceFiles {
		args = append(args, "--file", f)
	}

	// Add a 10-minute timeout so aider can't hang forever
	aiderCtx, aiderCancel := context.WithTimeout(ctx, 10*time.Minute)
	defer aiderCancel()

	cmd := exec.CommandContext(aiderCtx, "aider", args...)
	cmd.Dir = projectDir
	cmd.Env = append(os.Environ(), "OPENAI_API_KEY=dummy")

	// Explicitly pipe stdin and close it so aider sees EOF and exits
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %v", err)
	}

	// Stream output line by line
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %v", err)
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start aider: %v", err)
	}

	// Close stdin immediately — aider should process --message then exit
	stdinPipe.Close()

	buf := make([]byte, 4096)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			line := strings.TrimSpace(string(buf[:n]))
			if line != "" {
				emit(newEvent("task", line))
			}
		}
		if readErr != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil {
		if aiderCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("aider timed out after 10 minutes")
		}
		return fmt.Errorf("aider failed: %v", err)
	}
	return nil
}

// Build runs the full pipeline for a user prompt using aider.
// nameHint is an optional preferred app name (will be sanitised + de-duped); when empty the name is derived from the prompt.
func (p *Pipeline) Build(ctx context.Context, prompt, nameHint string, heavy, light NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	start := time.Now()

	appName := sanitizeName(nameHint)
	if appName == "" || appName == "app" {
		appName = sanitizeName(prompt)
	}
	// ensure uniqueness — if the name is already used, suffix a counter
	if _, ok := p.store.Get(appName); ok {
		base := appName
		for i := 2; i < 100; i++ {
			candidate := fmt.Sprintf("%s-%d", base, i)
			if _, exists := p.store.Get(candidate); !exists {
				appName = candidate
				break
			}
		}
	}
	port := p.store.AllocatePort()
	route := fmt.Sprintf("/apps/%s/", appName)

	app := &App{
		Name:      appName,
		Port:      port,
		Route:     route,
		Type:      "webapp",
		Status:    StatusBuilding,
		Prompt:    prompt,
		CreatedAt: time.Now(),
	}
	p.store.Set(app)
	p.registerCancel(appName, cancel)
	defer p.unregisterCancel(appName)

	emit(newEvent("planning", fmt.Sprintf("App: %s · Port: %d · Using aider + %s", appName, port, heavy.Name)))

	projectDir := p.store.ProjectDir(appName)
	os.MkdirAll(projectDir, 0755)

	// ── Phase 0: Scaffold boilerplate ─────────────────────
	emit(newEvent("planning", "Scaffolding project boilerplate..."))
	scaffoldProject(projectDir, appName, port, route)
	emit(newEvent("planning", "Boilerplate ready — handing off to AI"))

	// ── Phase 1: Generate code with aider ─────────────────
	emit(newEvent("task", fmt.Sprintf("Aider is implementing app on %s...", heavy.Name)))

	aiderMsg := fmt.Sprintf(`%s

Implement this app idea: %s

The app is already scaffolded with package.json, server.js, vite.config.js, etc.
Focus on implementing the actual features in src/App.jsx (and additional components).
Add API routes to server.js if needed. The app listens on port %d.`, p.prompts.Get().Build, prompt, port)

	if err := p.runAider(ctx, projectDir, aiderMsg, heavy, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, fmt.Sprintf("Aider code generation failed: %v", err))
		return
	}

	if p.cancelled(ctx, app, emit) {
		return
	}

	// ── Phase 2: Validate ────────────────────────────────
	emit(newEvent("validating", "Installing dependencies..."))
	if _, err := os.Stat(projectDir + "/package.json"); err != nil {
		p.fail(app, emit, "No package.json found — aider may not have generated the project correctly")
		return
	}
	out, err := runCmd(ctx, projectDir, "npm", "install")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("npm install failed: %v\n%s", err, out))
		return
	}
	emit(newEvent("validating", "Dependencies installed"))

	patchViteBase(projectDir)

	emit(newEvent("validating", "Building frontend..."))
	out, err = runCmd(ctx, projectDir, "npm", "run", "build")
	if err != nil {
		emit(newEvent("validating", fmt.Sprintf("Frontend build failed (non-fatal): %v", err)))
	} else {
		emit(newEvent("validating", "Frontend built successfully"))
	}

	if p.cancelled(ctx, app, emit) {
		return
	}

	// ── Phase 3: Deploy ──────────────────────────────────
	emit(newEvent("deploying", "Building Docker image..."))

	if _, err := os.Stat(projectDir + "/Dockerfile"); err != nil {
		defaultDockerfile := fmt.Sprintf("FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\n\nFROM node:20-alpine\nWORKDIR /app\nCOPY --from=build /app/dist ./dist\nCOPY --from=build /app/server.js ./\nCOPY --from=build /app/package*.json ./\nCOPY --from=build /app/*.js ./\nRUN npm install --production\nENV NODE_ENV=production\nEXPOSE %d\nCMD [\"node\", \"server.js\"]\n", port)
		os.WriteFile(projectDir+"/Dockerfile", []byte(defaultDockerfile), 0644)
	}

	runCmd(ctx, projectDir, "docker", "rm", "-f", appName)
	out, err = runCmd(ctx, projectDir, "docker", "build", "-t", appName, ".")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker build failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	emit(newEvent("deploying", "Docker image built"))

	out, err = runCmd(ctx, projectDir, "docker", "run", "-d",
		"--name", appName,
		"--network", "host",
		"-e", fmt.Sprintf("PORT=%d", port),
		appName)
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker run failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	emit(newEvent("deploying", "Container started, health checking..."))

	if err := p.healthCheck(ctx, appName, port, projectDir, emit); err != nil {
		p.fail(app, emit, err.Error())
		return
	}

	app.Status = StatusRunning
	app.Healthcheck = "/health"
	p.addBuild(app, "build", prompt, heavy.Name, "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("App '%s' deployed at port %d", appName, port), route, time.Since(start).String()))
}

// Stop stops a running app container.
func (p *Pipeline) Stop(ctx context.Context, name string) error {
	runCmd(ctx, ".", "docker", "stop", name)
	runCmd(ctx, ".", "docker", "rm", "-f", name)
	if app, ok := p.store.Get(name); ok {
		app.Status = StatusStopped
		p.store.Set(app)
	}
	return nil
}

// Restart restarts the app container from its existing Docker image without
// rebuilding. Faster than Deploy. If the image is missing, returns an error
// so the caller can fall back to a full Deploy.
func (p *Pipeline) Restart(ctx context.Context, name string) error {
	app, ok := p.store.Get(name)
	if !ok {
		return fmt.Errorf("app '%s' not found", name)
	}
	app.Status = StatusBuilding
	p.store.Set(app)

	// Always remove any lingering container with the same name first.
	runCmd(ctx, ".", "docker", "rm", "-f", name)

	out, err := runCmd(ctx, ".", "docker", "run", "-d",
		"--name", name, "--network", "host",
		"-e", fmt.Sprintf("PORT=%d", app.Port), name)
	if err != nil {
		app.Status = StatusFailed
		app.Error = fmt.Sprintf("Restart failed: %v\n%s", err, truncate(out, 1000))
		p.store.Set(app)
		return fmt.Errorf("docker run: %v: %s", err, truncate(out, 500))
	}

	if err := p.healthCheck(ctx, name, app.Port, p.store.ProjectDir(name), func(PipelineEvent) {}); err != nil {
		app.Status = StatusFailed
		app.Error = err.Error()
		p.store.Set(app)
		return err
	}

	app.Status = StatusRunning
	app.Error = ""
	p.store.Set(app)
	return nil
}

// Remove stops and deletes an app completely.
func (p *Pipeline) Remove(ctx context.Context, name string) error {
	p.Stop(ctx, name)
	os.RemoveAll(p.store.ProjectDir(name))
	p.store.Delete(name)
	return nil
}

// GitLog returns recent commits for an app's local git repo.
func (p *Pipeline) GitLog(name string, limit int) []GitCommit {
	return gitLog(p.store.ProjectDir(name), limit)
}

// GitDiff returns the diff for one commit, capped at maxBytes.
func (p *Pipeline) GitDiff(name, sha string, maxBytes int) string {
	return gitDiff(p.store.ProjectDir(name), sha, maxBytes)
}

// Deploy rebuilds the Docker image from current files and restarts the container (no AI).
func (p *Pipeline) Deploy(ctx context.Context, name string, port int, emit func(PipelineEvent)) {
	start := time.Now()
	app, ok := p.store.Get(name)
	if !ok {
		emit(newEvent("error", fmt.Sprintf("App '%s' not found", name)))
		return
	}
	projectDir := p.store.ProjectDir(name)
	app.Status = StatusBuilding
	p.store.Set(app)

	emit(newEvent("deploying", "Reinstalling dependencies..."))
	out, err := runCmd(ctx, projectDir, "npm", "install", "--production")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("npm install failed: %v\n%s", err, out))
		return
	}

	emit(newEvent("deploying", "Rebuilding Docker image..."))
	runCmd(ctx, ".", "docker", "rm", "-f", name)

	out, err = runCmd(ctx, projectDir, "docker", "build", "-t", name, ".")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker build failed: %v\n%s", err, truncate(out, 2000)))
		return
	}

	out, err = runCmd(ctx, projectDir, "docker", "run", "-d",
		"--name", name, "--network", "host",
		"-e", fmt.Sprintf("PORT=%d", port), name)
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker run failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	emit(newEvent("deploying", "Container started, running health checks..."))

	if err := p.healthCheck(ctx, name, port, projectDir, emit); err != nil {
		p.fail(app, emit, err.Error())
		return
	}

	app.Status = StatusRunning
	p.addBuild(app, "deploy", "redeploy", "", "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("App '%s' re-deployed", name), fmt.Sprintf("Port: %d", port), time.Since(start).String()))
}

// Rebuild takes an existing app and a change request, uses aider to apply changes.
func (p *Pipeline) Rebuild(ctx context.Context, name, changeRequest string, heavy, light NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	p.registerCancel(name, cancel)
	defer p.unregisterCancel(name)
	start := time.Now()

	app, ok := p.store.Get(name)
	if !ok {
		emit(newEvent("error", fmt.Sprintf("App '%s' not found", name)))
		return
	}

	projectDir := p.store.ProjectDir(name)
	port := app.Port

	app.Status = StatusBuilding
	app.Prompt = app.Prompt + " | CHANGE: " + changeRequest
	p.store.Set(app)

	emit(newEvent("planning", fmt.Sprintf("Applying changes to '%s' using aider + %s...", name, heavy.Name)))

	// ── Run aider to apply changes ─────────────────────
	emit(newEvent("task", fmt.Sprintf("Aider is modifying code on %s (%s)...", heavy.Name, heavy.Model)))

	aiderMsg := strings.NewReplacer("{{change}}", changeRequest, "{{port}}", fmt.Sprintf("%d", port)).Replace(p.prompts.Get().Rebuild)

	if err := p.runAider(ctx, projectDir, aiderMsg, heavy, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, fmt.Sprintf("Aider rebuild failed: %v", err))
		return
	}

	if p.cancelled(ctx, app, emit) {
		return
	}

	// ── Validate + Deploy ──────────────────────────────
	emit(newEvent("validating", "Reinstalling dependencies..."))
	out, err := runCmd(ctx, projectDir, "npm", "install")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("npm install failed: %v\n%s", err, out))
		return
	}

	patchViteBase(projectDir)

	emit(newEvent("deploying", "Rebuilding Docker image..."))
	runCmd(ctx, ".", "docker", "rm", "-f", name)
	out, err = runCmd(ctx, projectDir, "docker", "build", "-t", name, ".")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker build failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	out, err = runCmd(ctx, projectDir, "docker", "run", "-d",
		"--name", name, "--network", "host",
		"-e", fmt.Sprintf("PORT=%d", port), name)
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker run failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	emit(newEvent("deploying", "Container started, health checking..."))
	if err := p.healthCheck(ctx, name, port, projectDir, emit); err != nil {
		p.fail(app, emit, err.Error())
		return
	}

	app.Status = StatusRunning
	p.addBuild(app, "rebuild", changeRequest, heavy.Name, "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("App '%s' re-deployed with changes", name), fmt.Sprintf("Port: %d", port), time.Since(start).String()))
}

// readProjectFiles reads all source files from a project directory into a formatted string.
func readProjectFiles(projectDir string) string {
	var buf strings.Builder
	var walk func(dir, prefix string)
	walk = func(dir, prefix string) {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			name := e.Name()
			if name == "node_modules" || name == ".git" || name == "dist" || name == "package-lock.json" {
				continue
			}
			path := dir + "/" + name
			rel := prefix + name
			if e.IsDir() {
				walk(path, rel+"/")
			} else {
				data, err := os.ReadFile(path)
				if err == nil {
					buf.WriteString(fmt.Sprintf("### FILE: %s\n```\n%s\n```\n\n", rel, string(data)))
				}
			}
		}
	}
	walk(projectDir, "")
	return buf.String()
}

// ReadProjectFilesPublic is a public wrapper for readProjectFiles.
func ReadProjectFilesPublic(projectDir string) string {
	return readProjectFiles(projectDir)
}

// FixErrors reads container logs + optional user description, sends them to aider for diagnosis and fix.
func (p *Pipeline) FixErrors(ctx context.Context, name, userDescription string, heavy, light NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	p.registerCancel(name, cancel)
	defer p.unregisterCancel(name)
	start := time.Now()

	app, ok := p.store.Get(name)
	if !ok {
		emit(newEvent("error", fmt.Sprintf("App '%s' not found", name)))
		return
	}

	projectDir := p.store.ProjectDir(name)
	port := app.Port

	emit(newEvent("planning", "Collecting error logs..."))

	// Get container logs
	logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "50", name)
	if logs == "" {
		logs = "(no logs available — container may have been removed)"
	}

	app.Status = StatusBuilding
	p.store.Set(app)

	// ── Run aider to fix errors ────────────────────────
	emit(newEvent("task", fmt.Sprintf("Aider is diagnosing and fixing on %s...", heavy.Name)))

	var aiderMsg string
	portStr := fmt.Sprintf("%d", port)
	if userDescription != "" {
		aiderMsg = strings.NewReplacer("{{description}}", userDescription, "{{logs}}", logs, "{{port}}", portStr).Replace(p.prompts.Get().Fix)
	} else {
		aiderMsg = strings.NewReplacer("{{logs}}", logs, "{{port}}", portStr).Replace(p.prompts.Get().FixAuto)
	}

	if err := p.runAider(ctx, projectDir, aiderMsg, heavy, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, fmt.Sprintf("Aider fix failed: %v", err))
		return
	}

	if p.cancelled(ctx, app, emit) {
		return
	}

	// ── Rebuild + Deploy ───────────────────────────────
	emit(newEvent("deploying", "Rebuilding and restarting container..."))
	runCmd(ctx, ".", "docker", "rm", "-f", name)

	out, err := runCmd(ctx, projectDir, "npm", "install")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("npm install failed: %v\n%s", err, out))
		return
	}

	patchViteBase(projectDir)

	out, err = runCmd(ctx, projectDir, "docker", "build", "-t", name, ".")
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker build failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	out, err = runCmd(ctx, projectDir, "docker", "run", "-d",
		"--name", name, "--network", "host",
		"-e", fmt.Sprintf("PORT=%d", port), name)
	if err != nil {
		p.fail(app, emit, fmt.Sprintf("Docker run failed: %v\n%s", err, truncate(out, 2000)))
		return
	}
	emit(newEvent("deploying", "Container restarted, running health checks..."))

	if err := p.healthCheck(ctx, name, port, projectDir, emit); err != nil {
		p.fail(app, emit, err.Error())
		return
	}

	app.Status = StatusRunning
	app.Error = ""
	p.addBuild(app, "fix", userDescription, heavy.Name, "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("App '%s' fixed and restarted", name), fmt.Sprintf("Port: %d", port), time.Since(start).String()))
}

// Returns nil on success, or an error with container logs on failure.
func (p *Pipeline) healthCheck(ctx context.Context, name string, port int, projectDir string, emit func(PipelineEvent)) error {
	for i := 0; i < 10; i++ {
		time.Sleep(2 * time.Second)

		// First check if container is still running
		state, _ := runCmd(ctx, ".", "docker", "inspect", "-f", "{{.State.Running}}", name)
		if strings.TrimSpace(state) == "false" {
			logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "30", name)
			runCmd(ctx, ".", "docker", "rm", "-f", name)
			return fmt.Errorf("Container crashed on startup.\n\nLogs:\n%s", truncate(logs, 1000))
		}

		out, err := runCmd(ctx, projectDir, "curl", "-sf", fmt.Sprintf("http://localhost:%d/health", port))
		if err == nil && strings.Contains(out, "ok") {
			emit(newEvent("deploying", "✓ Health check passed"))
			return nil
		}
		emit(newEvent("deploying", fmt.Sprintf("Health check attempt %d/10...", i+1)))
	}

	// After 10 attempts, grab logs and fail
	logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "30", name)
	runCmd(ctx, ".", "docker", "rm", "-f", name)
	return fmt.Errorf("Health check failed after 10 attempts — app never responded on port %d.\n\nLogs:\n%s", port, truncate(logs, 1000))
}

func (p *Pipeline) fail(app *App, emit func(PipelineEvent), msg string) {
	app.Status = StatusFailed
	app.Error = msg
	p.store.Set(app)
	emit(newEvent("error", msg))
}

// addBuild appends a build record to the app, respecting the configured
// KeepBuildHistory cap (defaults to 20 if unset).
func (p *Pipeline) addBuild(app *App, action, prompt, node, status string, dur time.Duration) {
	rec := BuildRecord{
		Action:    action,
		Prompt:    prompt,
		Status:    status,
		Duration:  dur.Round(time.Second).String(),
		Node:      node,
		Timestamp: time.Now(),
	}
	app.Builds = append(app.Builds, rec)
	cap := 20
	if p.settings != nil {
		if n := p.settings.Get().KeepBuildHistory; n > 0 {
			cap = n
		}
	}
	if len(app.Builds) > cap {
		app.Builds = app.Builds[len(app.Builds)-cap:]
	}
	// Auto-commit successful changes to the per-app local git repo so the user
	// has a real change log they can browse in the UI. Best-effort; failures
	// here never break the build pipeline.
	if status == "success" && action != "deploy" {
		go gitCommit(p.store.ProjectDir(app.Name), action, prompt)
	}
}

// cancelled checks if the context was cancelled and marks the app as failed.
// Returns true if cancelled, in which case the caller should return immediately.
func (p *Pipeline) cancelled(ctx context.Context, app *App, emit func(PipelineEvent)) bool {
	if ctx.Err() != nil {
		app.Status = StatusFailed
		app.Error = "Build cancelled"
		p.store.Set(app)
		emit(newEvent("error", "Build cancelled by user"))
		return true
	}
	return false
}

func runCmd(ctx context.Context, dir string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "DOCKER_BUILDKIT=0")
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// patchViteBase ensures vite.config.js uses base: './' so assets load correctly under /apps/{name}/
func patchViteBase(projectDir string) {
	viteConfig := filepath.Join(projectDir, "vite.config.js")
	data, err := os.ReadFile(viteConfig)
	if err != nil {
		return
	}
	content := string(data)
	// Already has base set
	if strings.Contains(content, "base:") || strings.Contains(content, "base :") {
		return
	}
	// Inject base: './' into defineConfig({...})
	patched := strings.Replace(content, "defineConfig({", "defineConfig({\n  base: './',", 1)
	if patched != content {
		os.WriteFile(viteConfig, []byte(patched), 0644)
	}
}

func sanitizeName(prompt string) string {
	// Extract a short name from the prompt
	prompt = strings.ToLower(prompt)
	// Remove common prefixes
	for _, prefix := range []string{"build me a ", "build a ", "create a ", "make a ", "build me ", "create ", "make "} {
		prompt = strings.TrimPrefix(prompt, prefix)
	}
	// Take first 2-3 words
	words := strings.Fields(prompt)
	if len(words) > 3 {
		words = words[:3]
	}
	name := strings.Join(words, "-")
	// Keep only alphanumeric and hyphens
	re := regexp.MustCompile(`[^a-z0-9-]`)
	name = re.ReplaceAllString(name, "")
	name = strings.Trim(name, "-")
	if name == "" {
		name = "app"
	}
	if len(name) > 30 {
		name = name[:30]
	}
	return name
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// listSourceFiles returns relative paths of editable source files in a project directory.
// Skips node_modules, dist, .git, and binary/lock files.
func listSourceFiles(projectDir string) []string {
	var files []string
	skipDirs := map[string]bool{"node_modules": true, "dist": true, ".git": true, "build": true}
	skipExts := map[string]bool{".lock": true, ".png": true, ".jpg": true, ".ico": true, ".woff": true, ".woff2": true, ".ttf": true}
	filepath.Walk(projectDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if skipDirs[info.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		ext := filepath.Ext(info.Name())
		if skipExts[ext] {
			return nil
		}
		// Only include small text files (< 100KB)
		if info.Size() > 100*1024 {
			return nil
		}
		rel, _ := filepath.Rel(projectDir, path)
		if rel != "" {
			files = append(files, rel)
		}
		return nil
	})
	return files
}

func fileNames(files []GeneratedFile) []string {
	names := make([]string, len(files))
	for i, f := range files {
		names[i] = f.Path
	}
	return names
}

// ReadAppConfig reads and parses the app.json from a project directory.
func ReadAppConfig(dir string) (*AppConfig, error) {
	data, err := os.ReadFile(dir + "/app.json")
	if err != nil {
		return nil, err
	}
	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// ── Crash monitor ────────────────────────────────────────

// CrashMonitorDeps wires the auto-fix monitor to the same workers/LLM access
// the API handlers use. FindWorkers and CallLM must be set.
type CrashMonitorDeps struct {
	FindWorkers func(ctx context.Context) (NodeInfo, NodeInfo, error)
	CallLM      CallLMFunc
}

// StartCrashMonitor polls deployed apps every `interval` and triggers an
// auto-fix when a container that should be running has exited (and the
// `autoFixOnCrash` setting is enabled). It returns immediately; the monitor
// runs in a goroutine until ctx is cancelled.
func (p *Pipeline) StartCrashMonitor(ctx context.Context, deps CrashMonitorDeps, interval time.Duration) {
	if deps.FindWorkers == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		// per-app cooldown — don't spam fix attempts
		lastFix := make(map[string]time.Time)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				p.scanForCrashes(ctx, deps, lastFix)
			}
		}
	}()
}

func (p *Pipeline) scanForCrashes(ctx context.Context, deps CrashMonitorDeps, lastFix map[string]time.Time) {
	settings := p.settings.Get()
	if !settings.AutoFixOnCrash {
		return
	}
	for _, app := range p.store.All() {
		if app.Status != StatusRunning {
			continue
		}
		if p.IsActive(app.Name) {
			continue
		}
		// container state
		out, err := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Status}}|{{.State.ExitCode}}", app.Name).Output()
		if err != nil {
			continue // container missing; leave status as-is
		}
		state := strings.TrimSpace(string(out))
		if !strings.HasPrefix(state, "exited") && !strings.HasPrefix(state, "dead") {
			continue
		}
		// throttle: don't retry same app within 5 minutes
		if t, ok := lastFix[app.Name]; ok && time.Since(t) < 5*time.Minute {
			continue
		}
		lastFix[app.Name] = time.Now()

		heavy, light, err := deps.FindWorkers(ctx)
		if err != nil {
			continue
		}
		buildCtx := ctx
		if mins := settings.BuildTimeoutMin; mins > 0 {
			var cancel context.CancelFunc
			buildCtx, cancel = context.WithTimeout(ctx, time.Duration(mins)*time.Minute)
			defer cancel()
		}
		// Fire and forget — emit events go nowhere (no streaming client)
		emit := func(PipelineEvent) {}
		go p.FixErrors(buildCtx, app.Name, "", heavy, light, deps.CallLM, emit)
	}
}

