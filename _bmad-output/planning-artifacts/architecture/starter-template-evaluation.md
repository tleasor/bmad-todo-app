# Starter Template Evaluation

## Primary Technology Domain

Full-stack web — SolidJS SPA frontend + Bun-runtime REST API backend on Elysia, single Compose deployable, two-package monorepo via Bun workspaces.

## Starter Options Considered

The PRD's bundle ceiling (≤100 KB main JS gzipped), dependency cap (≤25 direct deps per package), and "no third-party UI kit" constraint disqualify most off-the-shelf full-stack scaffolds:

- **Next.js / Nuxt / RedwoodJS / T3 / Blitz** — SSR runtimes, opinionated routing, default dependency tails that exceed our cap; the SSR machinery solves problems we don't have (single-view SPA, no auth, no edge deploy).
- **SolidStart** — meta-framework with file-routing and server functions. Useful for SSR/hybrid apps; we ship a client-only SPA, so SolidStart imposes complexity without delivering any feature we need. Its Vite 8 support is also still in flight (issue #2075 open as of Feb 2026).
- **`npm create solid` template (ts-vite)** — the official client-only Solid + Vite template. Tiny (~5 files). The structure is clean enough to reproduce by hand.
- **`create-elysia` template** — minimal Elysia + Bun starter. Trivial to hand-roll.

## Selected Approach: Hand-Rolled Monorepo Scaffold

No third-party scaffolding tool is used. The structure is hand-authored, referencing the official Solid + Vite and Elysia + Bun templates as a layout reference. Justification:

- **Dependency hygiene:** every dependency is added intentionally and traces to a concrete requirement.
- **Bun is the only required tooling.** Runtime, package manager, test runner, and SQLite client are all `bun`. No separate `pnpm`, `vitest`, or `better-sqlite3` install.
- **The total scaffold is ~15 files**, comparable to what any official starter generates. Owning it directly costs less than retrofitting a scaffolder's defaults.
- **Aligns with PRD scope doctrine** ("polish over breadth, always") at the tooling layer.

## Initialization Sequence

The first implementation story will execute, in order:

```bash
# Initialize the workspace
mkdir bmad-todo-app && cd bmad-todo-app
bun init -y                          # root package.json
# Manually configure workspaces in root package.json: ["apps/*"]

# Workspace packages
mkdir -p apps/web apps/api
( cd apps/web && bun init -y )       # SolidJS SPA
( cd apps/api && bun init -y )       # Elysia on Bun.serve

# Frontend deps (apps/web)
bun add solid-js@1.9.12 \
        @elysiajs/eden \
        @tanstack/solid-query
bun add -d vite@8.0.10 vite-plugin-solid \
            unocss@66.6.8 @unocss/preset-mini @unocss/vite \
            @solidjs/testing-library

# Backend deps (apps/api)
bun add elysia
# bun:sqlite is built-in — no install
# bun:test is built-in — no install
# TypeBox is bundled inside Elysia — no separate install

# Repo-level dev tooling (root)
bun add -d -E @typescript/native-preview \
              oxlint oxfmt \
              playwright @axe-core/playwright \
              @lhci/cli

# Build and run via `docker compose up` at the repo root
```

Specific patch versions for `vite-plugin-solid`, `@unocss/preset-mini`, `@unocss/vite`, `elysia`, `@elysiajs/eden`, `@tanstack/solid-query`, `oxlint`, `oxfmt`, and `@typescript/native-preview` are pinned at initialization time against their then-current `latest` tag, recorded in `package.json` as exact versions (no `^` for runtime-affecting deps).

## Architectural Decisions Provided by the Scaffold

**Language & Runtime:**

- **TypeScript everywhere**, executed by Bun directly — no separate transpile step in dev.
- **Bun 1.3.11** as runtime, package manager, test runner, and SQLite client. Container base: `oven/bun:1.3.11-alpine` (patch-pinned).
- Frontend TS targets browser; backend TS targets Bun (DOM types excluded in `apps/api/tsconfig.json`).
- TS configs use a shared `tsconfig.base.json` at the workspace root with `target: esnext`, `module: preserve`, `strict: true`, `noEmit: true`, `skipLibCheck: true`, `erasableSyntaxOnly: true`. Per-package overrides only where needed: backend sets `lib: ["esnext"]` and `types: ["bun-types"]`; frontend sets `jsx: "preserve"` and `jsxImportSource: "solid-js"`. No project references at MVP — barrel-pattern boundary discipline (`apps/api/src/index.ts` is the public surface).
- Type-checking via `@typescript/native-preview` (tsgo). Stable TS 6 is the migration fallback if tsgo blocks.

**Repo Layout:**

```
bmad-todo-app/
├── package.json                  # workspaces: ["apps/*"]; root scripts
├── bunfig.toml                   # Bun-level config (lockfile, install)
├── tsconfig.base.json            # shared TS compiler options
├── bun.lock                      # text-format lockfile (Bun 1.2+ default)
├── compose.yaml
├── Dockerfile                    # multi-stage: install → build SPA → runtime
├── playwright.config.ts          # E2E suite at repo root
├── lighthouserc.json             # Lighthouse thresholds
├── scripts/
│   ├── check-bundle-size.sh
│   └── check-dep-count.sh
├── apps/
│   ├── web/                      # SolidJS SPA
│   │   ├── package.json
│   │   ├── vite.config.ts        # vite-plugin-solid + @unocss/vite
│   │   ├── uno.config.ts         # design tokens → UnoCSS rules
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── index.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/       # TaskInput, TaskList, TaskRow, etc.
│   │   │   ├── data/             # Eden client + TanStack Query setup
│   │   │   └── styles/           # token CSS variables
│   │   └── tests/                # bun:test + Playwright fixtures
│   └── api/                      # Elysia on Bun.serve backend
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts          # bootstraps Elysia, exports App type for Eden
│       │   ├── routes/           # tasks.ts, health.ts (schemas inline via t)
│       │   ├── storage/          # bun:sqlite repository + migrations/
│       │   ├── middleware/       # rate-limit, request-logger
│       │   └── errors/           # AppError + ErrorCode + envelope helpers
│       └── tests/                # bun:test integration tests
└── e2e/                          # Playwright specs
```

**Styling Solution:**

UnoCSS via `@unocss/vite`, configured with `presetMini` plus custom rules expressing the UX-spec design tokens (color, typography, spacing, radii, motion). Tokens additionally exposed as CSS custom properties on `:root` and `[data-theme]` for non-utility consumption. Theme via `prefers-color-scheme`; no toggle.

**Build Tooling:**

- **Vite 8** with Rolldown bundler for the frontend (production builds 10–30× faster than Vite 7).
- **Bun build** for the backend (or run TS directly in dev; container image installs deps and runs `bun apps/api/src/index.ts`).
- Bundle-size check (`scripts/check-bundle-size.sh`) compares `apps/web/dist/assets/*.js` gzipped against the ≤100 KB threshold.

**Testing Framework:**

- **`bun:test`** for unit + integration tests on backend (zero deps, Jest-compatible API).
- **`bun:test`** for unit tests on frontend; Solid components rendered via `@solidjs/testing-library` (one frontend test dep).
- **Playwright** for E2E suite (≥5 tests per NFR-M2), at the repo root in `e2e/`.
- **axe-core** invoked from Playwright tests for accessibility violation gating (NFR-A2).

**Code Organization:**

- Monorepo via **Bun workspaces** (`workspaces: ["apps/*"]` in root `package.json`). No Turborepo, no Nx — too small.
- **No `packages/contracts` shared module.** Eden Treaty (`@elysiajs/eden`) consumes the backend's `App` type via `import type { App } from "@bmad-todo-app/api"`, giving compile-time guarantees that frontend and backend agree on request/response shapes and the FR30 error contract. The barrel pattern in `apps/api/src/index.ts` defines the public surface.
- API client in `apps/web/src/data` is a thin `treaty<App>(...)` wrapper plus TanStack Query hooks — no hand-rolled fetch wrapper.

**Development Experience:**

- `bun run dev` at the repo root starts both apps concurrently (Vite on 5173 with proxy to `/api/*`, `bun --watch apps/api/src/index.ts` on 3000).
- Hot reload: Vite for frontend; `bun --watch` for backend.
- Single TypeScript language server across both packages — go-to-definition crosses package boundaries cleanly.
- Bun's text lockfile (`bun.lock`) committed for reproducible installs.

**Quality gates (no CI, no git hooks):**

Three developer-invoked scripts in root `package.json`:

- `bun run check` — fast (~5s): oxlint format + lint, tsgo `--noEmit`, dep-count check.
- `bun run check:full` — medium (~30s): adds `bun test`, `bun audit` (NFR-S3), `bun run build`, bundle-size check.
- `bun run check:release` — slow (~3min): adds Playwright E2E (with axe-core assertions), Lighthouse mobile + desktop against `vite preview`.

Thresholds live in checked-in config (`lighthouserc.json`, `scripts/check-*.sh`); script bodies translate 1:1 to CI workflow steps if/when CI is introduced.

**Note:** Project initialization using this approach will be the first implementation story. The story owns: workspace config, all three `tsconfig` files, `vite.config.ts`, `uno.config.ts`, `compose.yaml`, `Dockerfile`, the empty `routes/`, `components/`, and `migrations/` folders, the `scripts/` checks, and a "hello world" `bun:test` and Playwright test that proves the toolchain is wired end-to-end.
