// Package apps — app builder pipeline.
//
// Generation is delegated to **aider** running locally in the home-server
// container, pointed at the heavy LM Studio worker via its OpenAI-compatible
// /v1 endpoint. After aider writes files we run a small set of idempotent
// patchers (vite base, missing scaffold deps, geist font, host-api proxy,
// absolute URL rewrite), then docker build & run.
package apps

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// PipelineEvent is streamed to the client during a build.
type PipelineEvent struct {
	Step      string `json:"step"` // planning, generating, building, running, done, error, keepalive
	Message   string `json:"message"`
	Detail    string `json:"detail,omitempty"`
	Latency   string `json:"latency,omitempty"`
	Timestamp string `json:"timestamp"`
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
	Tier  string
}

// CallLMFunc calls an LM Studio node and returns the assistant message.
type CallLMFunc func(ctx context.Context, host, model string, messages []map[string]string) (string, error)

// Pipeline orchestrates the build-deploy cycle.
type Pipeline struct {
	store    *Store
	prompts  *PromptStore
	settings *SettingsStore
	mu       sync.Mutex
	cancels  map[string]context.CancelFunc
	active   map[string]bool
	// events keeps the most recent ~maxEventLog PipelineEvents per app so the
	// UI can re-attach after a tab switch / page refresh and still see the
	// build log instead of an empty pane.
	events map[string][]PipelineEvent
}

const maxEventLog = 1000

func NewPipeline(store *Store, prompts *PromptStore, settings *SettingsStore) *Pipeline {
	return &Pipeline{
		store:    store,
		prompts:  prompts,
		settings: settings,
		cancels:  make(map[string]context.CancelFunc),
		active:   make(map[string]bool),
		events:   make(map[string][]PipelineEvent),
	}
}

// recordEvent appends to the per-app ring buffer (capped at maxEventLog).
func (p *Pipeline) recordEvent(name string, e PipelineEvent) {
	if name == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	lst := p.events[name]
	lst = append(lst, e)
	if len(lst) > maxEventLog {
		lst = lst[len(lst)-maxEventLog:]
	}
	p.events[name] = lst
}

// resetEvents clears the buffered events for a fresh build/rebuild/fix run.
func (p *Pipeline) resetEvents(name string) {
	if name == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.events, name)
}

// Events returns a copy of the buffered events for an app (oldest first).
func (p *Pipeline) Events(name string) []PipelineEvent {
	p.mu.Lock()
	defer p.mu.Unlock()
	lst := p.events[name]
	out := make([]PipelineEvent, len(lst))
	copy(out, lst)
	return out
}

// wrapEmit returns an emit fn that records each event into the per-app log
// (so the UI can re-attach after a refresh) AND forwards to the original
// streaming emit (for the still-connected client).
func (p *Pipeline) wrapEmit(name string, emit func(PipelineEvent)) func(PipelineEvent) {
	return func(e PipelineEvent) {
		p.recordEvent(name, e)
		if emit != nil {
			emit(e)
		}
	}
}

func (p *Pipeline) IsActive(name string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.active[name]
}

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

// ── Public entry points ─────────────────────────────────────────────

// Build creates a new app from a prompt.
func (p *Pipeline) Build(ctx context.Context, prompt, nameHint string, heavy, _ NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	start := time.Now()

	appName := sanitizeName(nameHint)
	if appName == "" || appName == "app" {
		appName = sanitizeName(prompt)
	}
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

	// Buffer events server-side so the wizard can re-attach after a tab
	// switch / page refresh and still see the build log instead of an empty
	// pane. Wrap the streaming emit so each event is recorded too.
	p.resetEvents(appName)
	emit = p.wrapEmit(appName, emit)

	emit(newEvent("planning", fmt.Sprintf("Creating '%s' on port %d using %s", appName, port, heavy.Name)))

	projectDir := p.store.ProjectDir(appName)
	os.MkdirAll(projectDir, 0755)

	// 1. Scaffold the boilerplate.
	scaffoldProject(projectDir, appName, port, route)
	emit(newEvent("planning", "Project scaffold ready"))

	// 2. Ask the LLM for the app source.
	if err := p.generateAppSources(ctx, projectDir, prompt, port, heavy, callLM, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, fmt.Sprintf("Code generation failed: %v", err))
		return
	}

	// 3. Build & run docker. If the first build fails (almost always due to
	// LLM mistakes — missing exports, fictional packages, syntax errors), we
	// auto-retry once by feeding the build output back to the model as a fix
	// request. This rescues a *lot* of builds without bothering the user.
	if err := p.dockerBuildAndRun(ctx, appName, port, projectDir, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		emit(newEvent("generating", "Build failed — asking model to fix and retrying once"))
		if fixErr := p.generateAppFix(ctx, projectDir, "", err.Error(), port, heavy, callLM, emit); fixErr != nil {
			p.fail(app, emit, fmt.Sprintf("%v\n\nAuto-fix also failed: %v", err, fixErr))
			return
		}
		if err2 := p.dockerBuildAndRun(ctx, appName, port, projectDir, emit); err2 != nil {
			if p.cancelled(ctx, app, emit) {
				return
			}
			p.fail(app, emit, err2.Error())
			return
		}
	}

	app.Status = StatusRunning
	app.Healthcheck = "/health"
	app.Error = ""
	p.addBuild(app, "build", prompt, heavy.Name, "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("App '%s' deployed", appName), route, time.Since(start).String()))
}

// Rebuild applies a change request to an existing app.
func (p *Pipeline) Rebuild(ctx context.Context, name, changeRequest string, heavy, _ NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	p.registerCancel(name, cancel)
	defer p.unregisterCancel(name)
	p.resetEvents(name)
	emit = p.wrapEmit(name, emit)
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

	emit(newEvent("planning", fmt.Sprintf("Applying change to '%s' on %s", name, heavy.Name)))

	if err := p.generateAppChange(ctx, projectDir, changeRequest, port, heavy, callLM, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, fmt.Sprintf("Change generation failed: %v", err))
		return
	}

	if err := p.dockerBuildAndRun(ctx, name, port, projectDir, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		emit(newEvent("generating", "Build failed — asking model to fix and retrying once"))
		if fixErr := p.generateAppFix(ctx, projectDir, "", err.Error(), port, heavy, callLM, emit); fixErr != nil {
			p.fail(app, emit, fmt.Sprintf("%v\n\nAuto-fix also failed: %v", err, fixErr))
			return
		}
		if err2 := p.dockerBuildAndRun(ctx, name, port, projectDir, emit); err2 != nil {
			if p.cancelled(ctx, app, emit) {
				return
			}
			p.fail(app, emit, err2.Error())
			return
		}
	}

	app.Status = StatusRunning
	app.Error = ""
	p.addBuild(app, "rebuild", changeRequest, heavy.Name, "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("Updated '%s'", name), fmt.Sprintf("Port: %d", port), time.Since(start).String()))
}

// FixErrors reads container logs + optional user description, asks the LLM
// to patch the project, then rebuilds.
func (p *Pipeline) FixErrors(ctx context.Context, name, userDescription string, heavy, _ NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	p.registerCancel(name, cancel)
	defer p.unregisterCancel(name)
	p.resetEvents(name)
	emit = p.wrapEmit(name, emit)
	start := time.Now()

	app, ok := p.store.Get(name)
	if !ok {
		emit(newEvent("error", fmt.Sprintf("App '%s' not found", name)))
		return
	}
	projectDir := p.store.ProjectDir(name)
	port := app.Port

	emit(newEvent("planning", "Collecting container logs"))
	logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "60", name)
	if strings.TrimSpace(logs) == "" {
		logs = "(no container logs)"
	}

	app.Status = StatusBuilding
	p.store.Set(app)

	if err := p.generateAppFix(ctx, projectDir, userDescription, logs, port, heavy, callLM, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, fmt.Sprintf("Fix generation failed: %v", err))
		return
	}

	if err := p.dockerBuildAndRun(ctx, name, port, projectDir, emit); err != nil {
		if p.cancelled(ctx, app, emit) {
			return
		}
		p.fail(app, emit, err.Error())
		return
	}

	app.Status = StatusRunning
	app.Error = ""
	p.addBuild(app, "fix", userDescription, heavy.Name, "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("Fixed '%s'", name), fmt.Sprintf("Port: %d", port), time.Since(start).String()))
}

// Deploy rebuilds the docker image from current files (no AI) and restarts.
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

	if err := p.dockerBuildAndRun(ctx, name, port, projectDir, emit); err != nil {
		p.fail(app, emit, err.Error())
		return
	}
	app.Status = StatusRunning
	p.addBuild(app, "deploy", "redeploy", "", "success", time.Since(start))
	p.store.Set(app)
	emit(newEventLatency("done", fmt.Sprintf("Re-deployed '%s'", name), fmt.Sprintf("Port: %d", port), time.Since(start).String()))
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

// Restart restarts the app container from its existing image.
func (p *Pipeline) Restart(ctx context.Context, name string) error {
	app, ok := p.store.Get(name)
	if !ok {
		return fmt.Errorf("app '%s' not found", name)
	}
	app.Status = StatusBuilding
	p.store.Set(app)
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
	if err := p.healthCheck(ctx, name, app.Port, func(PipelineEvent) {}); err != nil {
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

// ── Git helpers (unchanged passthroughs) ────────────────────────────

func (p *Pipeline) GitLog(name string, limit int) []GitCommit {
	return gitLog(p.store.ProjectDir(name), limit)
}
func (p *Pipeline) GitDiff(name, sha string, maxBytes int) string {
	return gitDiff(p.store.ProjectDir(name), sha, maxBytes)
}
func (p *Pipeline) GitRevert(name, sha string) (string, error) {
	return gitRevert(p.store.ProjectDir(name), sha)
}
func (p *Pipeline) GitCommit(name, message string) string {
	if message == "" {
		message = "manual save"
	}
	return gitCommit(p.store.ProjectDir(name), "manual", message)
}

// ── LLM-driven code generation ──────────────────────────────────────

// generateAppSources asks aider to write the initial app source.
func (p *Pipeline) generateAppSources(ctx context.Context, projectDir, prompt string, port int, heavy NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) error {
	emit(newEvent("generating", fmt.Sprintf("Asking aider (%s) to write the app", heavy.Name)))

	system := p.prompts.Get().Build
	message := fmt.Sprintf("%s\n\nBuild this app: %s\n\nListen on port %d (process.env.PORT).", system, prompt, port)

	if err := p.runAider(ctx, projectDir, message, heavy, emit); err != nil {
		return err
	}

	patchViteBase(projectDir)
	ensurePackageDeps(projectDir)
	patchGeistImports(projectDir)
	ensureHostApiProxy(projectDir)
	patchAbsoluteHomeApiUrls(projectDir, emit)
	if appJsxIsPlaceholder(projectDir) {
		emit(newEvent("generating", "Warning: aider did not overwrite src/App.jsx — placeholder welcome screen will be shown."))
	}
	return nil
}

// generateAppChange asks aider for a focused change set.
func (p *Pipeline) generateAppChange(ctx context.Context, projectDir, change string, port int, heavy NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) error {
	emit(newEvent("generating", fmt.Sprintf("Asking aider (%s) for the change", heavy.Name)))

	system := p.prompts.Get().Build
	user := strings.NewReplacer("{{change}}", change, "{{port}}", fmt.Sprintf("%d", port)).Replace(p.prompts.Get().Rebuild)
	message := system + "\n\n" + user

	if err := p.runAider(ctx, projectDir, message, heavy, emit); err != nil {
		return err
	}
	patchViteBase(projectDir)
	ensurePackageDeps(projectDir)
	patchGeistImports(projectDir)
	ensureHostApiProxy(projectDir)
	patchAbsoluteHomeApiUrls(projectDir, emit)
	return nil
}

// generateAppFix asks aider to repair the project given container logs.
func (p *Pipeline) generateAppFix(ctx context.Context, projectDir, userDesc, logs string, port int, heavy NodeInfo, callLM CallLMFunc, emit func(PipelineEvent)) error {
	emit(newEvent("generating", fmt.Sprintf("Asking aider (%s) to diagnose & fix", heavy.Name)))

	system := p.prompts.Get().Build
	portStr := fmt.Sprintf("%d", port)
	var user string
	if userDesc != "" {
		user = strings.NewReplacer("{{description}}", userDesc, "{{logs}}", logs, "{{port}}", portStr).Replace(p.prompts.Get().Fix)
	} else {
		user = strings.NewReplacer("{{logs}}", logs, "{{port}}", portStr).Replace(p.prompts.Get().FixAuto)
	}
	message := system + "\n\n" + user

	if err := p.runAider(ctx, projectDir, message, heavy, emit); err != nil {
		return err
	}
	patchViteBase(projectDir)
	ensurePackageDeps(projectDir)
	patchGeistImports(projectDir)
	ensureHostApiProxy(projectDir)
	patchAbsoluteHomeApiUrls(projectDir, emit)
	return nil
}

// runAider invokes the local `aider` CLI against the heavy worker's LM Studio
// /v1 endpoint. Streams stdout/stderr line-by-line as PipelineEvents so the
// wizard shows live build progress (token-by-token thinking, file edits, etc.).
// 10-minute hard cap so a stuck model can't hang the pipeline forever.
func (p *Pipeline) runAider(ctx context.Context, projectDir string, message string, heavy NodeInfo, emit func(PipelineEvent)) error {
	apiBase := strings.TrimSuffix(heavy.Host, "/v1")
	if !strings.HasSuffix(apiBase, "/v1") {
		apiBase = apiBase + "/v1"
	}

	model := heavy.Model
	if model == "" {
		discovered, err := discoverModel(heavy.Host)
		if err != nil {
			return fmt.Errorf("no model on %s: %v", heavy.Host, err)
		}
		model = discovered
		emit(newEvent("generating", fmt.Sprintf("Auto-detected model: %s", model)))
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
	for _, f := range listSourceFiles(projectDir) {
		args = append(args, "--file", f)
	}

	timeoutMin := 30
	if v := os.Getenv("AIDER_TIMEOUT_MIN"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			timeoutMin = n
		}
	}
	aiderCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMin)*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(aiderCtx, "aider", args...)
	cmd.Dir = projectDir
	cmd.Env = append(os.Environ(), "OPENAI_API_KEY=dummy")

	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %v", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start aider: %v", err)
	}
	stdinPipe.Close()

	buf := make([]byte, 4096)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			line := strings.TrimSpace(string(buf[:n]))
			if line != "" && emit != nil {
				emit(newEvent("generating", line))
			}
		}
		if readErr != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil {
		if aiderCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("aider timed out after %d minutes — try a smaller model or simpler prompt (raise AIDER_TIMEOUT_MIN to allow longer)", timeoutMin)
		}
		return fmt.Errorf("aider failed: %v", err)
	}
	return nil
}

// listSourceFiles returns relative paths of editable source files in a
// project directory — fed to aider with --file so it can edit them. Skips
// node_modules, dist, .git, and binary/lock files.
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
		if skipExts[filepath.Ext(info.Name())] {
			return nil
		}
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

// ── Docker build & run ──────────────────────────────────────────────

func (p *Pipeline) dockerBuildAndRun(ctx context.Context, name string, port int, projectDir string, emit func(PipelineEvent)) error {
	if _, err := os.Stat(projectDir + "/Dockerfile"); err != nil {
		return fmt.Errorf("no Dockerfile in project — model output was incomplete")
	}

	// Repair common LLM mistakes left over from older runs (e.g. `@import "geist"`
	// in src/index.css that breaks the Tailwind plugin). Cheap & idempotent —
	// safe to run on every build/redeploy regardless of source.
	patchViteBase(projectDir)
	ensurePackageDeps(projectDir)
	patchGeistImports(projectDir)
	ensureHostApiProxy(projectDir)
	patchAbsoluteHomeApiUrls(projectDir, emit)

	emit(newEvent("building", "Building Docker image"))
	runCmd(ctx, ".", "docker", "rm", "-f", name)
	out, err := runCmd(ctx, projectDir, "docker", "build", "-t", name, ".")
	if err != nil {
		return fmt.Errorf("docker build failed: %v\n%s", err, truncate(out, 2000))
	}
	emit(newEvent("building", "Image built"))

	emit(newEvent("running", "Starting container"))
	out, err = runCmd(ctx, projectDir, "docker", "run", "-d",
		"--name", name,
		"--network", "host",
		"-e", fmt.Sprintf("PORT=%d", port),
		name)
	if err != nil {
		return fmt.Errorf("docker run failed: %v\n%s", err, truncate(out, 2000))
	}
	if err := p.healthCheck(ctx, name, port, emit); err != nil {
		return err
	}
	return nil
}

func (p *Pipeline) healthCheck(ctx context.Context, name string, port int, emit func(PipelineEvent)) error {
	for i := 0; i < 10; i++ {
		select {
		case <-ctx.Done():
			return fmt.Errorf("cancelled while health-checking")
		case <-time.After(2 * time.Second):
		}
		state, _ := runCmd(ctx, ".", "docker", "inspect", "-f", "{{.State.Running}}", name)
		if strings.TrimSpace(state) == "false" {
			logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "30", name)
			runCmd(ctx, ".", "docker", "rm", "-f", name)
			return fmt.Errorf("container crashed on startup\n\nLogs:\n%s", truncate(logs, 1000))
		}
		out, err := runCmd(ctx, ".", "curl", "-sf", fmt.Sprintf("http://localhost:%d/health", port))
		if err == nil && strings.Contains(out, "ok") {
			emit(newEvent("running", "Health check passed"))
			return nil
		}
		emit(newEvent("running", fmt.Sprintf("Waiting for app to come up (%d/10)", i+1)))
	}
	logs, _ := runCmd(ctx, ".", "docker", "logs", "--tail", "30", name)
	runCmd(ctx, ".", "docker", "rm", "-f", name)
	return fmt.Errorf("health check failed — app never responded on :%d\n\nLogs:\n%s", port, truncate(logs, 1000))
}

// ── Bookkeeping ─────────────────────────────────────────────────────

func (p *Pipeline) fail(app *App, emit func(PipelineEvent), msg string) {
	app.Status = StatusFailed
	app.Error = msg
	p.store.Set(app)
	emit(newEvent("error", msg))
}

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
	if status == "success" && action != "deploy" {
		go gitCommit(p.store.ProjectDir(app.Name), action, prompt)
	}
}

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

// ── Crash monitor (unchanged behaviour, simplified deps) ────────────

type CrashMonitorDeps struct {
	FindWorkers func(ctx context.Context) (NodeInfo, NodeInfo, error)
	CallLM      CallLMFunc
}

func (p *Pipeline) StartCrashMonitor(ctx context.Context, deps CrashMonitorDeps, interval time.Duration) {
	if deps.FindWorkers == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
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
		out, err := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Status}}|{{.State.ExitCode}}", app.Name).Output()
		if err != nil {
			continue
		}
		state := strings.TrimSpace(string(out))
		if !strings.HasPrefix(state, "exited") && !strings.HasPrefix(state, "dead") {
			continue
		}
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
		emit := func(PipelineEvent) {}
		go p.FixErrors(buildCtx, app.Name, "", heavy, light, deps.CallLM, emit)
	}
}

// ── Helpers ─────────────────────────────────────────────────────────

func runCmd(ctx context.Context, dir string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "DOCKER_BUILDKIT=0")
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func sanitizeName(prompt string) string {
	prompt = strings.ToLower(prompt)
	for _, prefix := range []string{"build me a ", "build a ", "create a ", "make a ", "build me ", "create ", "make "} {
		prompt = strings.TrimPrefix(prompt, prefix)
	}
	words := strings.Fields(prompt)
	if len(words) > 3 {
		words = words[:3]
	}
	name := strings.Join(words, "-")
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

// scaffoldDeps lists every npm package the scaffold's pre-installed UI
// primitives (and shared infra) import. The LLM frequently rewrites
// package.json with a slim dependency list and forgets these, which makes
// vite/rollup fail with `failed to resolve import "@radix-ui/react-..."`.
// We merge anything missing back in before docker build.
var scaffoldDeps = map[string]string{
	"express":                       "^4.18.2",
	"cors":                          "^2.8.5",
	"react":                         "^18.2.0",
	"react-dom":                     "^18.2.0",
	"class-variance-authority":      "^0.7.0",
	"clsx":                          "^2.1.0",
	"tailwind-merge":                "^2.2.1",
	"lucide-react":                  "^0.344.0",
	"@fontsource-variable/geist":    "^5.2.8",
	"@radix-ui/react-slot":          "^1.0.2",
	"@radix-ui/react-label":         "^2.0.2",
	"@radix-ui/react-dialog":        "^1.0.5",
	"@radix-ui/react-dropdown-menu": "^2.0.6",
	"@radix-ui/react-popover":       "^1.0.7",
	"@radix-ui/react-select":        "^2.0.0",
	"@radix-ui/react-separator":     "^1.0.3",
	"@radix-ui/react-switch":        "^1.0.3",
	"@radix-ui/react-tabs":          "^1.0.4",
	"@radix-ui/react-tooltip":       "^1.0.7",
	"@radix-ui/react-avatar":        "^1.0.4",
	"@radix-ui/react-checkbox":      "^1.0.4",
	"@radix-ui/react-scroll-area":   "^1.0.5",
	"@radix-ui/react-accordion":     "^1.1.2",
}

var scaffoldDevDeps = map[string]string{
	"@vitejs/plugin-react": "^4.2.1",
	"tailwindcss":          "^4.0.0",
	"@tailwindcss/vite":    "^4.0.0",
	"tw-animate-css":       "^1.0.0",
	"vite":                 "^5.0.12",
}

// ensurePackageDeps merges any missing scaffold deps back into the LLM's
// package.json so imports of pre-installed primitives (radix, lucide,
// fontsource, tailwind plugin, etc.) keep resolving even when the model
// rewrites the file with a stripped-down dependency list.
func ensurePackageDeps(projectDir string) {
	pkgPath := filepath.Join(projectDir, "package.json")
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		return
	}
	var pkg map[string]any
	if err := json.Unmarshal(data, &pkg); err != nil {
		return
	}
	changed := false
	mergeInto := func(field string, required map[string]string) {
		cur, _ := pkg[field].(map[string]any)
		if cur == nil {
			cur = make(map[string]any)
		}
		for name, ver := range required {
			if _, ok := cur[name]; !ok {
				cur[name] = ver
				changed = true
			}
		}
		pkg[field] = cur
	}
	mergeInto("dependencies", scaffoldDeps)
	mergeInto("devDependencies", scaffoldDevDeps)
	if !changed {
		return
	}
	out, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(pkgPath, append(out, '\n'), 0644)
}

// patchViteBase ensures vite.config.js uses base: './'.
func patchViteBase(projectDir string) {
	viteConfig := filepath.Join(projectDir, "vite.config.js")
	data, err := os.ReadFile(viteConfig)
	if err != nil {
		return
	}
	content := string(data)
	if strings.Contains(content, "base:") || strings.Contains(content, "base :") {
		return
	}
	patched := strings.Replace(content, "defineConfig({", "defineConfig({\n  base: './',", 1)
	if patched != content {
		os.WriteFile(viteConfig, []byte(patched), 0644)
	}
}

// hostApiPrefixes lists the host home-server API roots that the per-app
// proxy middleware forwards. Kept in sync with the JS-side HOST_API_PREFIXES
// in hostApiProxySnippet so the URL rewriter below catches the same set.
var hostApiPrefixes = []string{
	"/api/home", "/api/system", "/api/nodes", "/api/dashboard",
	"/api/logs", "/api/apps", "/api/bridges", "/api/homekit",
}

// patchAbsoluteHomeApiUrls rewrites the LLM's absolute host-API URLs in
// generated source files to the relative form the per-app reverse proxy
// expects.
//
// The pipeline serves apps under /apps/{name}/, so an absolute path like
// fetch('/api/home/devices') from the browser resolves to the *root* of the
// host home-server. That technically reaches the host directly (works), but
// it bypasses the per-app hostApiProxy middleware AND breaks subpath
// portability. Worse, models often invent fully-qualified URLs like
// `http://localhost:8080/api/home/devices` which simply don't work in the
// browser at all. We normalise both shapes to relative URLs.
//
// Targets only .js / .jsx / .ts / .tsx files inside src/ — never touches
// server.js (the proxy snippet there uses hard-coded prefixes legitimately).
func patchAbsoluteHomeApiUrls(projectDir string, emit func(PipelineEvent)) {
	srcDir := filepath.Join(projectDir, "src")
	if _, err := os.Stat(srcDir); err != nil {
		return
	}
	patched := 0
	filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		switch filepath.Ext(info.Name()) {
		case ".js", ".jsx", ".ts", ".tsx":
		default:
			return nil
		}
		data, rerr := os.ReadFile(path)
		if rerr != nil {
			return nil
		}
		original := string(data)
		out := original
		for _, prefix := range hostApiPrefixes {
			rel := strings.TrimPrefix(prefix, "/") // "api/home"
			// Absolute fully-qualified URLs → relative.
			for _, scheme := range []string{"http://localhost:8080", "http://127.0.0.1:8080", "https://localhost:8080", "https://127.0.0.1:8080"} {
				out = strings.ReplaceAll(out, scheme+prefix, rel)
			}
			// Leading-slash relative paths inside string quotes → strip the slash.
			// We only want to touch the URL string, not arbitrary code that
			// happens to mention the path. Scope by quote.
			for _, q := range []string{"'", "\"", "`"} {
				out = strings.ReplaceAll(out, q+prefix, q+rel)
			}
		}
		if out != original {
			os.WriteFile(path, []byte(out), 0644)
			patched++
		}
		return nil
	})
	if patched > 0 && emit != nil {
		emit(newEvent("generating", fmt.Sprintf("Rewrote absolute host-API URLs to relative in %d file(s)", patched)))
	}
}

// hostApiProxySnippet is injected into server.js so generated apps can reach
const hostApiProxySnippet = `import http from 'http';
const HOST_API_PREFIXES = [
  '/api/home', '/api/system', '/api/nodes', '/api/dashboard',
  '/api/logs', '/api/apps', '/api/bridges', '/api/homekit',
];
const HOST_API_TARGET = process.env.HOST_API_TARGET || 'http://127.0.0.1:8080';
function hostApiProxy(req, res, next) {
  if (!HOST_API_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + '/'))) return next();
  const url = new URL(HOST_API_TARGET);
  const proxyReq = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    method: req.method,
    path: req.originalUrl,
    headers: { ...req.headers, host: url.host },
  }, (proxyRes) => { res.writeHead(proxyRes.statusCode || 502, proxyRes.headers); proxyRes.pipe(res); });
  proxyReq.on('error', (e) => res.status(502).json({ error: 'host api unreachable: ' + e.message }));
  req.pipe(proxyReq);
}
`

// ensureHostApiProxy re-injects the host-api reverse-proxy middleware into
// server.js when the LLM rewrites the scaffold and forgets it. Without it,
// browser calls to /api/home/devices (etc.) get answered by the app's own
// express server with a 404 instead of being forwarded to the host.
//
// The patch is conservative: only runs if the file already imports express
// and doesn't already mention HOST_API_PREFIXES.
func ensureHostApiProxy(projectDir string) {
	srvPath := filepath.Join(projectDir, "server.js")
	data, err := os.ReadFile(srvPath)
	if err != nil {
		return
	}
	content := string(data)
	if strings.Contains(content, "HOST_API_PREFIXES") {
		return
	}
	if !strings.Contains(content, "express") {
		return
	}

	// Insert the proxy snippet after the last import line so it sits at the
	// top of the module body, then register it as the very first middleware
	// on whichever variable holds the express() instance.
	lines := strings.Split(content, "\n")
	lastImport := -1
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		if strings.HasPrefix(t, "import ") || strings.HasPrefix(t, "const ") && strings.Contains(t, "require(") {
			lastImport = i
		}
	}
	if lastImport < 0 {
		lastImport = 0
	}

	// Discover the express app variable name (default "app").
	appVar := "app"
	re := regexp.MustCompile(`(?m)(?:const|let|var)\s+(\w+)\s*=\s*express\s*\(`)
	if m := re.FindStringSubmatch(content); len(m) == 2 {
		appVar = m[1]
	}

	useLine := fmt.Sprintf("%s.use(hostApiProxy);", appVar)
	// Find first .use(...) on appVar so we can insert ours just before it.
	useRe := regexp.MustCompile(fmt.Sprintf(`(?m)^\s*%s\.use\s*\(`, regexp.QuoteMeta(appVar)))
	loc := useRe.FindStringIndex(content)

	// Skip the snippet's own `import http from 'http';` line if server.js
	// already imports http (most do).
	snippet := hostApiProxySnippet
	if strings.Contains(content, `from 'http'`) || strings.Contains(content, `from "http"`) {
		snippet = strings.Replace(snippet, "import http from 'http';\n", "", 1)
	}

	var rebuilt string
	if loc != nil {
		// Insert the function definition after the last import, and the
		// .use() call right before the first existing .use(appVar).
		insertAfter := strings.Join(lines[:lastImport+1], "\n") + "\n" + snippet + "\n" + strings.Join(lines[lastImport+1:], "\n")
		// Now find the use call again in the rebuilt content and insert the use line before it.
		loc2 := useRe.FindStringIndex(insertAfter)
		if loc2 == nil {
			rebuilt = insertAfter + "\n" + appVar + ".use(hostApiProxy);\n"
		} else {
			rebuilt = insertAfter[:loc2[0]] + useLine + "\n" + insertAfter[loc2[0]:]
		}
	} else {
		// No existing .use() — just append.
		rebuilt = strings.Join(lines[:lastImport+1], "\n") + "\n" + snippet + "\n" +
			strings.Join(lines[lastImport+1:], "\n") + "\n" + useLine + "\n"
	}
	os.WriteFile(srvPath, []byte(rebuilt), 0644)
}

// patchGeistImports rewrites the most common bad font imports the LLM tends
// to invent — e.g. `@import "geist/sans"` or `@import "geist"` — to the only
// shape that actually resolves with the packages we ship in package.json.
// Without this, vite's tailwind plugin dies with `Missing "./sans" specifier
// in "geist" package` because the bare `geist` npm package doesn't expose
// CSS subpaths; we use `@fontsource-variable/geist`.
//
// As a second pass, if the LLM also wrote a slim package.json that omits
// the font dep, the rewritten `@import "@fontsource-variable/geist";` will
// itself fail to resolve. To stay robust we drop the line entirely when the
// dep isn't present — the host theme falls back to system fonts cleanly.
func patchGeistImports(projectDir string) {
	cssPath := filepath.Join(projectDir, "src", "index.css")
	data, err := os.ReadFile(cssPath)
	if err != nil {
		return
	}
	original := string(data)
	patched := original
	bad := []string{
		`@import "geist/sans";`,
		`@import "geist/mono";`,
		`@import "geist";`,
		`@import 'geist/sans';`,
		`@import 'geist/mono';`,
		`@import 'geist';`,
		`@import "geist-font";`,
		`@import 'geist-font';`,
	}
	for _, b := range bad {
		patched = strings.ReplaceAll(patched, b, `@import "@fontsource-variable/geist";`)
	}

	// If package.json doesn't list @fontsource-variable/geist, the import
	// will still fail at build time. Strip it (and any blank line it left
	// behind) — the host theme variables fall back to system fonts.
	hasDep := false
	if pkg, perr := os.ReadFile(filepath.Join(projectDir, "package.json")); perr == nil {
		hasDep = strings.Contains(string(pkg), `"@fontsource-variable/geist"`)
	}
	if !hasDep {
		fontImports := []string{
			"@import \"@fontsource-variable/geist\";\n",
			"@import '@fontsource-variable/geist';\n",
			"@import \"@fontsource-variable/geist\";",
			"@import '@fontsource-variable/geist';",
		}
		for _, fi := range fontImports {
			patched = strings.ReplaceAll(patched, fi, "")
		}
	}

	// Collapse duplicate consecutive imports we may have just produced.
	dup := "@import \"@fontsource-variable/geist\";\n@import \"@fontsource-variable/geist\";"
	for strings.Contains(patched, dup) {
		patched = strings.Replace(patched, dup, `@import "@fontsource-variable/geist";`, 1)
	}
	if patched != original {
		os.WriteFile(cssPath, []byte(patched), 0644)
	}
}

// stripThinkBlocks removes <think>…</think> reasoning blocks (and the stray
// closing-tag-only variant) so the file parser only sees the real answer.
func stripThinkBlocks(s string) string {
	for {
		open := strings.Index(s, "<think>")
		if open < 0 {
			break
		}
		close := strings.Index(s[open:], "</think>")
		if close < 0 {
			s = s[:open]
			break
		}
		s = s[:open] + s[open+close+len("</think>"):]
	}
	if idx := strings.Index(s, "</think>"); idx >= 0 {
		s = s[idx+len("</think>"):]
	}
	return strings.TrimSpace(s)
}

func fileNames(files []GeneratedFile) []string {
	out := make([]string, len(files))
	for i, f := range files {
		out[i] = f.Path
	}
	return out
}

// ── Project file helpers ────────────────────────────────────────────

// readProjectFiles serialises a project directory into the same
// `### FILE: path\n```\n…\n``` ` format used by the model. Skipped: large
// binaries, node_modules, dist, lockfiles, .git.
func readProjectFiles(projectDir string) string {
	var buf strings.Builder
	skipDirs := map[string]bool{"node_modules": true, "dist": true, ".git": true, "build": true}
	skipExts := map[string]bool{".lock": true, ".png": true, ".jpg": true, ".jpeg": true, ".ico": true, ".woff": true, ".woff2": true, ".ttf": true}
	skipNames := map[string]bool{"package-lock.json": true, "yarn.lock": true}
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
		if skipNames[info.Name()] || skipExts[filepath.Ext(info.Name())] {
			return nil
		}
		if info.Size() > 60*1024 {
			return nil
		}
		rel, _ := filepath.Rel(projectDir, path)
		data, _ := os.ReadFile(path)
		buf.WriteString(fmt.Sprintf("### FILE: %s\n```\n%s\n```\n\n", rel, string(data)))
		return nil
	})
	return buf.String()
}

// ReadProjectFilesPublic is a public wrapper for readProjectFiles.
func ReadProjectFilesPublic(projectDir string) string {
	return readProjectFiles(projectDir)
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

// ── Scaffold ────────────────────────────────────────────────────────

// scaffoldProject creates the boilerplate files for a new app (no hot reload).
// Mirrors the home-server web styling: Tailwind 4, Geist Variable font, the
// same oklch dark theme tokens, and a forced dark mode by default. shadcn-style
// UI primitives are pre-written to src/components/ui so the LLM can import
// them without depending on the shadcn CLI at build time.
func scaffoldProject(projectDir, appName string, port int, route string) {
	writeIfMissing(projectDir+"/package.json", fmt.Sprintf(`{
  "name": "%s",
  "private": true,
  "type": "module",
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
    "@fontsource-variable/geist": "^5.2.8",
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
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "tw-animate-css": "^1.0.0",
    "vite": "^5.0.12"
  }
}
`, appName))

	writeIfMissing(projectDir+"/server.js", fmt.Sprintf(`import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || %d;

// ── Host home-server proxy ──────────────────────────────────────────
// The host home-server (this container's parent) exposes shared APIs at
// http://localhost:8080. Generated apps run on --network host, so we can
// reach those APIs directly. Browser code always hits the *app's* origin
// (because of the /apps/{name}/ reverse proxy), so we forward any request
// matching the prefixes below back to the host so apps can read devices,
// system stats, nodes, etc. without CORS or absolute-URL gymnastics.
const HOST_API_PREFIXES = [
  '/api/home', '/api/system', '/api/nodes', '/api/dashboard',
  '/api/logs', '/api/apps', '/api/bridges', '/api/homekit',
];
const HOST_API_TARGET = process.env.HOST_API_TARGET || 'http://127.0.0.1:8080';

app.use((req, res, next) => {
  if (!HOST_API_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }
  const url = new URL(HOST_API_TARGET);
  const proxyReq = http.request(
    {
      hostname: url.hostname,
      port: url.port || 80,
      method: req.method,
      path: req.originalUrl,
      headers: { ...req.headers, host: url.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (e) => {
    res.status(502).json({ error: 'host api unreachable: ' + e.message });
  });
  req.pipe(proxyReq);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Add your API routes here.

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
`, port))

	writeIfMissing(projectDir+"/vite.config.js", `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`)

	writeIfMissing(projectDir+"/index.html", `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>`+appName+`</title>
</head>
<body class="dark">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`)

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

	writeIfMissing(projectDir+"/src/App.jsx", `import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles size={16} className="text-primary" />
            Welcome
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your app is ready. Replace this screen with your real UI.
        </CardContent>
      </Card>
    </div>
  );
}
`)

	os.MkdirAll(projectDir+"/src/lib", 0755)
	writeIfMissing(projectDir+"/src/lib/utils.js", `import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
`)

	writeIfMissing(projectDir+"/components.json", `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
`)

	writeIfMissing(projectDir+"/jsconfig.json", `{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
`)

	// Tailwind 4 + same oklch dark theme + scrollbars + Geist as the host web.
	writeIfMissing(projectDir+"/src/index.css", `@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/geist";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: 'Geist Variable', sans-serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.72 0.14 230);
  --primary-foreground: oklch(0.18 0.04 230);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.85 0.08 230);
  --accent-foreground: oklch(0.25 0.06 230);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.78 0.11 230);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.78 0.11 230);
  --primary-foreground: oklch(0.18 0.04 230);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.78 0.11 230);
  --accent-foreground: oklch(0.18 0.04 230);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.78 0.11 230);
}

@layer base {
  * { border-color: var(--border); }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
  }
}

/* Minimalist scrollbars (matches the home-server web). */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
}
*:hover { scrollbar-color: rgba(255, 255, 255, 0.15) transparent; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
::-webkit-scrollbar-corner { background: transparent; }
`)

	// ── Pre-installed shadcn-style UI primitives ──────────────────
	os.MkdirAll(projectDir+"/src/components/ui", 0755)

	writeIfMissing(projectDir+"/src/components/ui/button.jsx", `import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:opacity-90",
        destructive: "bg-destructive text-white shadow-sm hover:opacity-90",
        outline: "border border-border bg-transparent shadow-sm hover:bg-accent/10 hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:opacity-80",
        ghost: "hover:bg-accent/10 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
`)

	writeIfMissing(projectDir+"/src/components/ui/card.jsx", `import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-xl border border-border bg-card text-card-foreground shadow', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-4 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
`)

	writeIfMissing(projectDir+"/src/components/ui/input.jsx", `import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
`)

	writeIfMissing(projectDir+"/src/components/ui/label.jsx", `import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
`)

	writeIfMissing(projectDir+"/src/components/ui/badge.jsx", `import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-white',
        outline: 'text-foreground border-border',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
`)

	writeIfMissing(projectDir+"/src/components/ui/separator.jsx", `import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
`)

	writeIfMissing(projectDir+"/src/components/ui/textarea.jsx", `import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
`)

	writeIfMissing(projectDir+"/src/components/ui/switch.jsx", `import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className,
    )}
    {...props}>
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
`)

	writeIfMissing(projectDir+"/src/components/ui/scroll-area.jsx", `import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex touch-none select-none p-0.5 transition-colors w-2.5">
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export { ScrollArea };
`)

	writeIfMissing(projectDir+"/Dockerfile", fmt.Sprintf(`FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
ENV NODE_ENV=production
EXPOSE %d
CMD ["node", "server.js"]
`, port))

	writeIfMissing(projectDir+"/app.json", fmt.Sprintf(`{"name": "%s", "port": %d, "healthcheck": "/health", "route": "%s", "type": "webapp"}
`, appName, port, route))
}

func writeIfMissing(path, content string) {
	if _, err := os.Stat(path); err != nil {
		os.WriteFile(path, []byte(content), 0644)
	}
}

// appJsxIsPlaceholder returns true when src/App.jsx is still the scaffold
// welcome screen — i.e. the LLM never overwrote it.
func appJsxIsPlaceholder(projectDir string) bool {
	data, err := os.ReadFile(filepath.Join(projectDir, "src", "App.jsx"))
	if err != nil {
		return false
	}
	return strings.Contains(string(data), "Replace this screen with your real UI")
}

// discoverModel queries LM Studio for the first non-embedding model.
func discoverModel(host string) (string, error) {
	return DiscoverModel(host)
}

// DiscoverModel is the exported variant used by other server packages
// (e.g. /api/apps/refine) that need the same auto-pick fallback.
func DiscoverModel(host string) (string, error) {
	apiBase := strings.TrimSuffix(host, "/v1")
	url := apiBase + "/v1/models"
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("reach %s: %v", url, err)
	}
	defer resp.Body.Close()
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("parse models: %v", err)
	}
	for _, m := range result.Data {
		if !strings.Contains(strings.ToLower(m.ID), "embed") {
			return m.ID, nil
		}
	}
	if len(result.Data) > 0 {
		return result.Data[0].ID, nil
	}
	return "", fmt.Errorf("no models loaded on %s", host)
}
