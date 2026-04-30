# web — folder structure

Bulletproof-React feature-folder layout. Each feature owns its panel,
components, hooks, types, and `api.ts`. Cross-feature imports must go through
the feature barrel (`@/features/<name>`); deep imports are blocked by ESLint.

```
src/
├── main.tsx                  # entry: mounts <App />
├── app/                      # composition root (shell, routing, global hooks)
│   ├── App.tsx
│   ├── PageLayout.tsx        # standard chrome (header + rails + dock)
│   ├── Sidebar.tsx
│   ├── StatusBar.tsx
│   ├── LogsOverlay.tsx
│   ├── api.ts                # global polling endpoints
│   └── hooks/
│       ├── useSystemStatus.ts
│       └── useNavGoto.ts
│
├── features/                 # self-contained domains (one per page)
│   ├── apps/                 # app builder / deploy / files / logs
│   │   ├── AppsPanel.tsx
│   │   ├── api.ts            # all /api/apps/* HTTP calls
│   │   ├── index.ts          # public barrel (only export: AppsPanel)
│   │   ├── components/       # AppSidebar, BuildPanel, BottomPanel,
│   │   │                     # CodeEditor, DiffView, ClarifyWizard, …
│   │   └── hooks/
│   │       └── useAppsPanel.ts
│   │
│   ├── chat/                 # chat UI, streaming, schedules, personas
│   │   ├── ChatPanel.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   │   ├── index.ts
│   │   ├── components/       # SchedulesModal, SearchPalette, PersonaQuickAdd
│   │   └── hooks/
│   │       └── useChatPanel.ts
│   │
│   ├── dashboard/            # system overview + node/app grids
│   │   ├── DashboardPage.tsx
│   │   ├── api.ts
│   │   ├── index.ts
│   │   └── components/       # ServerStats, NodesList
│   │
│   ├── homekit/              # HomeKit bridge pairing + WoL
│   │   ├── HomeKitPanel.tsx
│   │   ├── api.ts
│   │   └── index.ts
│   │
│   ├── logs/                 # server log viewer
│   │   ├── LogsPanel.tsx
│   │   ├── api.ts
│   │   └── index.ts
│   │
│   └── settings/             # config, runtime settings, prompts, nodes CRUD
│       ├── SettingsPanel.tsx
│       ├── api.ts
│       ├── index.ts
│       ├── components/       # NodeFormInline, EndpointCard, PromptsEditor,
│       │                     # SettingsRows
│       └── hooks/
│           └── useSettings.ts
│
├── components/ui/            # cross-feature primitives (button, panel, chart,
│                             # spinner, status-dot, scroll-area, …)
├── lib/                      # framework-agnostic utilities
│   ├── api.ts                # API_BASE + apiFetch / apiJson / apiJsonSafe
│   ├── format.ts
│   ├── icons.ts
│   ├── markdown.tsx
│   ├── endpoints.ts
│   └── types.ts              # shared DTOs (SystemInfo, AppInfo, NodeStats…)
└── assets/
```

## Conventions

- **Feature boundary**: outside code may only import `@/features/<name>` (the
  `index.ts` barrel). Deep imports like `@/features/chat/hooks/useChatPanel`
  from another feature are blocked by `no-restricted-imports` in
  [eslint.config.js](eslint.config.js).
- **Data layer**: every feature has `api.ts` with thin typed wrappers around
  `lib/api` helpers. Hooks are pure state + glue. Streaming endpoints
  (`/api/chat/stream`, build NDJSON, deploy stream) intentionally stay inline
  in their hooks because they consume `Response.body.getReader()` directly.
- **Path alias**: `@/` → `src/` (configured in `vite.config.ts` and
  `tsconfig.app.json`).

## Scripts

```sh
yarn dev      # vite dev server
yarn build    # tsc -b && vite build
yarn lint     # eslint src
yarn preview  # serve built assets
```
