# web — folder structure

Bulletproof-React feature-folder layout. Each feature owns its pages,
components, hooks, types, and `api.ts`. Cross-feature imports must go through
the feature barrel (`@/features/<name>`); deep imports are blocked by ESLint.

```
src/
├── main.tsx                  # entry: mounts <AuthProvider><App /></AuthProvider>
├── index.css                 # Tailwind + shadcn theme tokens
├── app/                      # composition root (shell, routing, global hooks)
│   ├── App.tsx               # page switch + shell chrome
│   ├── PageLayout.tsx        # standard page header + content frame
│   ├── Sidebar.tsx           # desktop rail + mobile bottom nav
│   ├── navItems.tsx          # top-level nav entries
│   ├── StatusBar.tsx
│   ├── LogsOverlay.tsx
│   ├── routing.ts            # History-API router (useRoute, pushRoute, useIsMobile)
│   ├── api.ts                # global polling endpoints
│   ├── hooks/                # useSystemStatus, useNavGoto
│   └── pages/                # NetworkPage
│
├── features/                 # self-contained domains
│   ├── auth/                 # login, session context, users tab
│   ├── chat/                 # chat UI + streaming
│   ├── dashboard/            # Dashboard, AI and Cluster pages + shared
│   │                         # DashboardDataProvider polling context
│   ├── dns/                  # Settings → DNS tab (records, ad-block lists)
│   ├── home/                 # smart-home devices page + bridge settings
│   ├── homekit/              # HomeKit bridge pairing + WoL
│   ├── logs/                 # server log viewer
│   ├── router/               # Settings → Router tab + router API
│   └── settings/             # config, runtime settings, nodes CRUD, API tokens
│
├── components/ui/            # cross-feature primitives (button, input, switch,
│                             # chart, section, spinner, status-dot, …)
└── lib/                      # framework-agnostic utilities
    ├── api.ts                # API_BASE + apiFetch / apiJson / apiJsonSafe
    ├── format.ts             # gotoPage, relTime, formatUptime, …
    ├── endpoints.ts          # Settings → API endpoint catalogue
    ├── utils.ts              # cn() class merge helper
    └── types.ts              # shared DTOs (SystemInfo, NodeStats, LogEntry…)
```

## Conventions

- **Feature boundary**: code outside a feature may only import
  `@/features/<name>` (the `index.ts` barrel). Deep imports like
  `@/features/settings/api` from another feature or from `src/app`
  are blocked by `no-restricted-imports` in [eslint.config.js](eslint.config.js).
- **Data layer**: every feature has `api.ts` with thin typed wrappers around
  `lib/api` helpers. Hooks are pure state + glue. The streaming chat endpoint
  (`/api/chat/stream`) intentionally stays inline because it consumes
  `Response.body.getReader()` directly.
- **Path alias**: `@/` → `src/` (configured in `vite.config.ts` and
  `tsconfig.app.json`).

## Scripts

```sh
yarn dev      # vite dev server
yarn build    # tsc -b && vite build
yarn lint     # eslint .
yarn preview  # serve built assets
```
