# web — folder structure

Bulletproof-React feature-folder layout. Each feature owns its pages,
components, hooks, types, and `api.ts`. Cross-feature imports must go through
the feature barrel (`@/features/<name>`); deep imports are blocked by ESLint.

```
src/
├── main.tsx                  # entry: AuthProvider + ConfirmProvider around <App />, plus <Toaster />
├── index.css                 # Tailwind + design tokens (single dark theme)
├── app/                      # composition root (shell chrome)
│   ├── App.tsx               # page switch + shell chrome
│   ├── PageLayout.tsx        # page header + content frame
│   ├── Sidebar.tsx           # desktop rail + mobile bottom nav ("More" drawer)
│   ├── navItems.tsx          # top-level nav entries
│   ├── StatusBar.tsx         # host + cluster load (polls /api/system, /api/dashboard/cluster)
│   ├── LogsOverlay.tsx       # slide-up logs (mounts LogsPanel only while open)
│   └── api.ts                # status-bar endpoints
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
│   ├── network/              # Network page + Settings → Router tab (ASUS API)
│   └── settings/             # config, runtime settings, nodes CRUD, API tokens,
│                             # API explorer catalogue (endpoints.ts)
│
├── components/ui/            # shared primitives, one per file (button, card,
│                             # dialog, drawer, field, menu, toast, …)
├── hooks/                    # usePolling, useAction, useConfirm
└── lib/                      # framework-agnostic utilities
    ├── api.ts                # API_BASE + apiFetch / apiJson / apiJsonSafe
    ├── routing.ts            # URL router: useRoute, pushRoute, gotoPage, useIsMobile
    ├── nodes.ts              # compute-node API (stats, wake, shutdown, models)
    ├── format.ts             # errorMessage, relTime, formatLatency, copyToClipboard, …
    ├── utils.ts              # cn() class merge helper
    └── types.ts              # shared DTOs (LogEntry)
```

## Conventions

- **Feature boundary**: code outside a feature may only import
  `@/features/<name>` (the `index.ts` barrel). Deep imports like
  `@/features/settings/api` from another feature or from `src/app`
  are blocked by `no-restricted-imports` in [eslint.config.js](eslint.config.js).
  `lib/`, `hooks/` and `components/` never import from `app/` or `features/`.
- **Navigation**: the URL is the only channel. Pages read their tab, room or
  prefilled chat prompt from `useRoute()`; other pages link with `gotoPage`.
- **Data layer**: every feature has `api.ts` with thin typed wrappers around
  `lib/api` helpers. Mutations use `apiJson`, which throws on non-2xx; surface
  the error (`toast`, `Alert`, `useAction`) rather than swallowing it. Hooks are pure state + glue. The streaming chat endpoint
  (`/api/chat/stream`) intentionally stays inline because it consumes
  `Response.body.getReader()` directly.
- **Path alias**: `@/` → `src/` (configured in `vite.config.ts` and
  `tsconfig.app.json`).

## Scripts

```sh
yarn dev      # vite dev server
yarn build    # tsc -b && vite build
yarn lint     # eslint .
yarn format   # prettier --write
yarn preview  # serve built assets
```
