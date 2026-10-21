import { readdirSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// ── Cross-feature import boundary ──────────────────────────────────────────
// Inside any `src/features/<x>/` file, deep imports into a *different*
// feature (e.g. `@/features/settings/api` from `features/dashboard/`)
// are forbidden. Cross-feature consumers must go through the feature barrel
// (`@/features/<other>` → `index.ts`) — that's the only public surface.
// Same-feature deep imports (`@/features/<self>/components/...`) remain
// allowed, since they're internal to the feature and don't break boundaries.
const FEATURES = readdirSync(new URL('./src/features', import.meta.url));
const featureBoundaryConfigs = FEATURES.map((self) => {
  const others = FEATURES.filter((f) => f !== self);
  const groups = others.flatMap((other) => [
    `@/features/${other}/*`,
    `@/features/${other}/*/**`,
  ]);
  return {
    files: [`src/features/${self}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: groups,
              message:
                'Cross-feature deep imports are forbidden. Use the feature barrel `@/features/<name>` instead.',
            },
          ],
        },
      ],
    },
  };
});

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  ...featureBoundaryConfigs,
  // Shared layers sit below the shell and features and never import them.
  {
    files: [
      'src/lib/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app', '@/app/*', '@/features', '@/features/*'],
              message:
                'lib/, hooks/ and components/ are shared layers: they must not import from app/ or features/.',
            },
          ],
        },
      ],
    },
  },
  // The app shell may only consume features through their barrels.
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*'],
              message:
                'Deep feature imports are forbidden. Use the feature barrel `@/features/<name>` instead.',
            },
          ],
        },
      ],
    },
  },
]);
