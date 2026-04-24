package apps

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// SystemPrompts holds all editable prompt templates.
type SystemPrompts struct {
	Build   string `json:"build"`   // base aider prompt for new apps
	Rebuild string `json:"rebuild"` // template for change requests ({{change}}, {{port}})
	Fix     string `json:"fix"`     // template for error fixes ({{description}}, {{logs}}, {{port}})
	FixAuto string `json:"fixAuto"` // template for auto-fix without user description ({{logs}}, {{port}})
	Clarify string `json:"clarify"` // template for clarifying questions before build ({{prompt}})
}

// PromptStore persists system prompts to disk.
type PromptStore struct {
	mu      sync.RWMutex
	prompts SystemPrompts
	path    string
}

func NewPromptStore(dataDir string) *PromptStore {
	os.MkdirAll(dataDir, 0755)
	ps := &PromptStore{
		path:    filepath.Join(dataDir, "prompts.json"),
		prompts: defaultPrompts(),
	}
	ps.load()
	return ps
}

func (ps *PromptStore) load() {
	data, err := os.ReadFile(ps.path)
	if err != nil {
		return
	}
	var p SystemPrompts
	if json.Unmarshal(data, &p) == nil {
		// Only overwrite non-empty fields so defaults are preserved
		if p.Build != "" {
			ps.prompts.Build = p.Build
		}
		if p.Rebuild != "" {
			ps.prompts.Rebuild = p.Rebuild
		}
		if p.Fix != "" {
			ps.prompts.Fix = p.Fix
		}
		if p.FixAuto != "" {
			ps.prompts.FixAuto = p.FixAuto
		}
		if p.Clarify != "" {
			ps.prompts.Clarify = p.Clarify
		}
	}
}

func (ps *PromptStore) save() error {
	data, err := json.MarshalIndent(ps.prompts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ps.path, data, 0644)
}

func (ps *PromptStore) Get() SystemPrompts {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	return ps.prompts
}

func (ps *PromptStore) Update(p SystemPrompts) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if p.Build != "" {
		ps.prompts.Build = p.Build
	}
	if p.Rebuild != "" {
		ps.prompts.Rebuild = p.Rebuild
	}
	if p.Fix != "" {
		ps.prompts.Fix = p.Fix
	}
	if p.FixAuto != "" {
		ps.prompts.FixAuto = p.FixAuto
	}
	if p.Clarify != "" {
		ps.prompts.Clarify = p.Clarify
	}
	return ps.save()
}

// Reset restores all prompts to defaults.
func (ps *PromptStore) Reset() error {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	ps.prompts = defaultPrompts()
	return ps.save()
}

func defaultPrompts() SystemPrompts {
	return SystemPrompts{
		Build: `You are working on an existing project scaffold with shadcn/ui pre-configured.

The project has components.json, and the Dockerfile runs 'npx shadcn add' to install these
components automatically at build time: button, card, input, label, badge, separator, textarea, switch, scroll-area.

Pre-installed files: server.js, package.json, vite.config.js, tailwind.config.js, postcss.config.js,
index.html, src/main.jsx, src/App.jsx, src/index.css, src/lib/utils.js, components.json, Dockerfile, app.json.

READY-TO-USE IMPORTS (these are installed by the Dockerfile, do NOT create these files):
  import { Button } from '@/components/ui/button';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { Badge } from '@/components/ui/badge';
  import { Separator } from '@/components/ui/separator';
  import { Textarea } from '@/components/ui/textarea';
  import { Switch } from '@/components/ui/switch';
  import { ScrollArea } from '@/components/ui/scroll-area';

The cn() utility is at '@/lib/utils'. Icons: import { IconName } from 'lucide-react'.
All @radix-ui packages are installed for: dialog, dropdown-menu, popover, select, tabs, tooltip, avatar, checkbox, accordion.

Your job: implement the actual application features in the existing files.

RULES:
  - USE the pre-installed shadcn components. Do NOT recreate button.jsx, card.jsx, etc.
  - If you need ADDITIONAL shadcn components not listed above (e.g. dialog, tabs, select), write them
    yourself in src/components/ui/ following shadcn patterns — the radix primitives are already installed.
  - Use lucide-react for all icons.
  - Edit src/App.jsx to build the UI. Create more components in src/components/ as needed.
  - Edit server.js to add API routes if needed. Keep /health endpoint.
  - If server.js needs helper modules, create them NEXT TO server.js (e.g. ./integration.js, ./db.js).
    NEVER put server-side code inside src/ — that directory is for frontend React code only.
  - Do NOT change package.json "type" field. Config files use CommonJS (require/module.exports).
  - Use ES modules ONLY inside src/*.jsx files.
  - Server-side files (server.js and helpers) use CommonJS (require/module.exports).
  - Use the CSS variable theme: bg-background, text-foreground, bg-card, bg-primary, etc.
  - No TypeScript — use .jsx only.
  - Do NOT add any "Built with", "Made with", "Powered by", or credits/attribution section.
  - ALL fetch/API calls in the frontend MUST use relative URLs WITHOUT a leading slash
    (e.g. fetch('api/todos'), NOT fetch('/api/todos') or fetch('http://localhost:4001/api/todos')).
    The app is served behind a reverse proxy at a sub-path and absolute URLs will break.
  - DO NOT TOUCH the "HOME-SERVER HOT RELOAD" block in server.js (the /__hot__ route)
    or the inline <script> tag in index.html marked "HOME-SERVER HOT RELOAD". They power
    automatic page reload on file changes. Removing them breaks the dev experience.`,

		Rebuild: `Add this new feature/change to the existing app: {{change}}

CRITICAL: This is an INCREMENTAL change. You must:
- Keep ALL existing features, code, files, and behavior intact.
- ONLY add or modify what is required for the requested change.
- Do NOT rewrite the app from scratch. Do NOT remove unrelated functionality.
- Do NOT replace existing files unless strictly necessary for this change.
- The app must keep listening on port {{port}} (from process.env.PORT).
- Do not break the /health endpoint.`,

		Fix: `Fix this issue in the application.

User report: {{description}}

Container logs:
` + "```" + `
{{logs}}
` + "```" + `

Fix the issue described. Preserve all existing functionality. The app must keep listening on port {{port}} (from process.env.PORT). Do not break the /health endpoint.`,

		FixAuto: `Fix the errors in this application. Here are the container logs:

` + "```" + `
{{logs}}
` + "```" + `

Fix ONLY the error. Preserve all existing functionality. The app must keep listening on port {{port}} (from process.env.PORT). Do not break the /health endpoint.`,

		Clarify: `You are a senior product designer helping a user scope a small web app before it gets built.

The user wants to build:
"""
{{prompt}}
"""

Your job is two-fold:

(1) Pick a SHORT, memorable, kebab-case app name (1–3 words, lowercase, alphanumeric + hyphens only, max 24 chars). Examples: "todo-board", "habit-tracker", "weather", "notes-zen".

(2) Ask 3 to 5 short, high-leverage clarifying questions that will materially change how the app is built. Focus on things the user has NOT specified.

You MUST always include a question with id "theme" asking which visual theme they prefer, with suggestions ["Dark", "Light", "System"] and default "Dark".

Other useful question topics (pick the most relevant 2–4 in addition to the theme question):
  - core data model and what "items" actually represent
  - persistence (in-memory vs file-backed JSON vs SQLite)
  - single-user vs multi-user / auth needs
  - key user actions, primary screens, MVP scope
  - any external API or integration
  - whether they want sample/seed data on first run

Rules:
  - Ask AT MOST 5 questions total (including the theme one). Skip anything the user already specified.
  - Each question must be one sentence, plain English, friendly.
  - For each question provide 2 to 4 short suggested answers as quick-pick chips.
  - Provide a sensible "default" answer for each question — the value will be pre-selected for the user.
  - Mark a question "required: false" unless answering it is essential.
  - Output STRICT JSON ONLY. No prose, no markdown fences, no commentary.

Respond with EXACTLY this JSON shape:
{
  "summary": "one short sentence describing what you understand the user wants",
  "suggestedName": "kebab-case-name",
  "questions": [
    {
      "id": "theme",
      "question": "Which visual theme do you prefer?",
      "hint": "Sets the default colour scheme of the app",
      "suggestions": ["Dark", "Light", "System"],
      "default": "Dark",
      "required": false
    }
  ]
}`,
	}
}
