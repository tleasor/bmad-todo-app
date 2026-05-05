# Story 1.1: Initialize Monorepo Scaffold with Toolchain

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer joining the project,
I want a working monorepo scaffold with the full toolchain wired up,
so that I can clone, run `bun install && bun run dev`, and have a hello-world frontend + backend running locally and via `docker compose up`.

## Acceptance Criteria

1. **Project tree** — repo contains the complete file tree from architecture's *Project Structure & Boundaries*: root configs (`package.json`, `bunfig.toml`, `tsconfig.base.json`, `.oxlintrc.json`, `oxfmt.toml`, `lighthouserc.json`, `playwright.config.ts`, `compose.yaml`, `Dockerfile`, `.env.example`, `.gitignore`, `README.md`), `apps/web/` (Solid SPA shell), `apps/api/` (Elysia app shell), `scripts/` (`check-bundle-size.sh`, `check-dep-count.sh`), `e2e/` (smoke spec).
2. **Vite browser target** — `apps/web/vite.config.ts` declares `build.target: ["chrome120", "edge120", "firefox120", "safari15"]` (closes Gap 1 of architecture validation; FR20).
3. **Locked versions** — direct deps match the architecture-locked versions exactly: Bun 1.3.11 (runtime), `solid-js@1.9.12`, `elysia@1.4.28`, `vite@8.0.10`, `unocss@66.6.8`, `@tanstack/solid-query`, `@elysiajs/eden`, `oxlint`, `oxfmt`, `@typescript/native-preview` (tsgo), `playwright`, `@axe-core/playwright`, `@lhci/cli`. All runtime-affecting deps pinned exact (no `^`).
4. **Dep cap honored (NFR-M5)** — `scripts/check-dep-count.sh` passes: each package ≤ 25 direct dependencies (frontend and backend counted separately).
5. **`bun run dev` works** — Vite serves the frontend on port 5173 with `/api/*` and `/health` proxied to backend on port 3000. Visiting the dev URL renders a hello-world page with a focused `<input>` element, the document `<title>` set, and `/health` returning HTTP 200 with `{ status: "ok", uptime: <number> }`.
6. **Three check scripts pass** — `bun run check` (~5 s: oxlint + oxfmt + `tsgo --noEmit` + dep-count), `bun run check:full` (~30 s: adds `bun test --coverage --coverage-threshold 70`, `bun audit`, `bun run build`, `scripts/check-bundle-size.sh`), `bun run check:release` (~6–8 min: adds full Playwright across all 3 projects + Lighthouse mobile + desktop). Aggregate coverage across `apps/web` + `apps/api` enforced project-wide; cumulative drift below 70 % fails `check:full` (NFR-M1).
7. **Smoke tests prove wiring** — backend `bun:test` exercises `app.handle('/health')` and asserts 200 + `{ status: "ok", ... }`. `e2e/smoke.spec.ts` asserts page title is set, input is focused on load, and `/health` returns 200.
8. **Multi-browser Playwright config** — `playwright.config.ts` declares three `projects`: `chromium` (Desktop Chrome), `firefox` (Desktop Firefox), `webkit` (Desktop Safari), each with `use` aligned to PRD browser matrix. `bun run check:release` runs every spec in `e2e/` against all three projects (no per-spec project filtering); failure on any project fails the script. README documents `bunx playwright install chromium firefox webkit`.
9. **Single-service container deploys** — running `docker compose up` from a fresh clone succeeds: multi-stage Dockerfile (install → SPA build → runtime on `oven/bun:1.3.11-alpine`) builds, the single service starts on port 3000, `docker compose logs` emits structured JSON log lines containing at minimum `level`, `msg`, `ts`, the SPA is served on `/` (with SPA fallback for paths that don't match `/api/*` or real files in `dist/`), and `/health` returns 200.
10. **README ≤ 30 minute path (NFR-M4)** — README documents `bun install`, `bun run dev`, the three check scripts, `bunx playwright install ...`, `docker compose up`, and the env vars in `.env.example`. A new developer following it reaches a running app in ≤ 30 minutes.

## Tasks / Subtasks

- [ ] **Task 1 — Initialize workspace + root configs** (AC: #1, #3, #4)
  - [ ] Run init sequence: `bun init -y` at root; manually set `workspaces: ["apps/*"]` and root scripts in `package.json`.
  - [ ] Create `tsconfig.base.json` with shared compiler options: `target: esnext`, `module: preserve`, `strict: true`, `noEmit: true`, `skipLibCheck: true`, `erasableSyntaxOnly: true`.
  - [ ] Create `bunfig.toml` (defaults; text `bun.lock` is Bun 1.2+ default — no override needed).
  - [ ] Create `.oxlintrc.json` enforcing: no default exports, no `console.log`, no `any`, no non-null `!`, explicit return types on exported functions, import ordering (external → internal → relative, alphabetized within group), `// @ts-ignore` forbidden (only `// @ts-expect-error`).
  - [ ] Create `oxfmt.toml` (project formatting baseline).
  - [ ] Create `.gitignore` (ignore `node_modules/`, `dist/`, `*.db`, `*.db-shm`, `*.db-wal`, `.env`, `.lighthouseci/`, `playwright-report/`, `test-results/`; **keep `bun.lock`**).
  - [ ] Create `.env.example` documenting `PORT`, `DATABASE_PATH`, `NODE_ENV` with defaults from architecture Gap 2.
  - [ ] Add root scripts in `package.json`: `dev`, `build`, `check`, `check:full`, `check:release` (see Dev Notes for exact bodies).
  - [ ] Create `scripts/check-dep-count.sh`: counts direct deps in each `apps/*/package.json` and root `package.json`; fails if any exceeds 25 (NFR-M5).
  - [ ] Create `scripts/check-bundle-size.sh`: gzips `apps/web/dist/assets/*.js`, sums sizes, fails if main chunk > 100 KB gzipped (NFR-P1).
  - [ ] Make both scripts executable (`chmod +x`).
  - [ ] Add `lighthouserc.json` with thresholds: mobile Performance ≥ 90, desktop Performance ≥ 95, Accessibility ≥ 90 (NFR-P1, NFR-P2).
  - [ ] Run `scripts/check-dep-count.sh` locally to verify it passes after dep installs.

- [ ] **Task 2 — Initialize `apps/web/` (Solid SPA shell)** (AC: #1, #2, #3, #5)
  - [ ] `cd apps/web && bun init -y`; install per architecture initialization sequence.
  - [ ] Direct deps (exact-pinned): `solid-js@1.9.12`, `@elysiajs/eden`, `@tanstack/solid-query`.
  - [ ] Dev deps: `vite@8.0.10`, `vite-plugin-solid`, `unocss@66.6.8`, `@unocss/preset-mini`, `@unocss/vite`, `@solidjs/testing-library`.
  - [ ] Create `apps/web/tsconfig.json` extending base; add `jsx: "preserve"`, `jsxImportSource: "solid-js"`.
  - [ ] Create `apps/web/vite.config.ts` with `vite-plugin-solid()` + `@unocss/vite` plugins, **`build.target: ["chrome120", "edge120", "firefox120", "safari15"]`** (closes Gap 1), and dev-server proxy:
    ```ts
    server: { proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' } }
    ```
  - [ ] Create `apps/web/uno.config.ts` with `presetMini()` + placeholder rules block (token rules added incrementally in Story 1.5).
  - [ ] Create `apps/web/index.html` with `<title>bmad-todo-app</title>`, viewport meta, mount node `<div id="root"></div>`, `<script type="module" src="/src/index.tsx">`.
  - [ ] Create `apps/web/public/robots.txt` (default disallow none).
  - [ ] Create `apps/web/src/index.tsx`: mounts `<App />` to `#root`. Wraps in `<QueryClientProvider>` with a single `QueryClient` instance (defaults are fine for scaffold; full retry config lands in Story 1.5).
  - [ ] Create `apps/web/src/App.tsx`: hello-world body containing a labelled `<input>` with `autofocus` + `ref` setting `.focus()` `onMount` (FR18 baseline). Render text "bmad-todo-app".
  - [ ] Create `apps/web/src/env.ts`: reads `import.meta.env.DEV`; exports `IS_DEV: boolean` (only consumer of `import.meta.env` per architecture).
  - [ ] Create `apps/web/src/constants.ts` (placeholder; populated in later stories).
  - [ ] Create empty directories with `.gitkeep`: `apps/web/src/components/`, `apps/web/src/data/`, `apps/web/src/styles/`.

- [ ] **Task 3 — Initialize `apps/api/` (Elysia shell)** (AC: #1, #3, #5, #7, #9)
  - [ ] `cd apps/api && bun init -y`; install `elysia` (exact-pinned to `1.4.28`). Dev dep: `bun-types`.
  - [ ] No `@sinclair/typebox` install — TypeBox is bundled inside Elysia.
  - [ ] Create `apps/api/tsconfig.json` extending base; add `lib: ["esnext"]`, `types: ["bun-types"]`.
  - [ ] Create `apps/api/src/env.ts`: validates and re-exports `PORT` (default `3000`), `DATABASE_PATH` (default `./tasks.db` dev / `/data/tasks.db` container), `NODE_ENV` (default `development`). **Only consumer of `Bun.env`** per architecture boundary rule.
  - [ ] Create `apps/api/src/constants.ts` (placeholder).
  - [ ] Create `apps/api/src/index.ts`:
    - Construct a single Elysia `app`.
    - Mount `GET /health` returning `{ status: "ok", uptime: process.uptime() }` with HTTP 200 (FR31, NFR-R5).
    - Listen on `env.PORT` only when invoked as the entry point (gate with `if (import.meta.main)`; required so `app.handle()` is callable from tests without listening).
    - **Export `app` as a named export** AND export `type App = typeof app` — Eden Treaty consumes the `App` type via `import type` from `apps/web/src/data/api.ts`. Barrel pattern: `apps/api/src/index.ts` IS the public surface.
  - [ ] Create empty directories with `.gitkeep`: `apps/api/src/routes/`, `apps/api/src/middleware/`, `apps/api/src/errors/`, `apps/api/src/storage/migrations/`.
  - [ ] Add a smoke test `apps/api/src/index.test.ts`: `import { app } from "./index"; describe("health", () => { it("returns 200 ok", async () => { const res = await app.handle(new Request("http://localhost/health")); expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ status: "ok" }); }); });` Use `describe`/`it` (not `test`) per Implementation Patterns.

- [ ] **Task 4 — Wire Eden client + ErrorBoundary placeholder in `apps/web/`** (AC: #1, #5)
  - [ ] Create `apps/web/src/data/api.ts`: `import { treaty } from "@elysiajs/eden"; import type { App } from "@bmad-todo-app/api"; export const api = treaty<App>("/").api;` (chained-access, single module-scope client). Confirm `apps/web/package.json` declares `@bmad-todo-app/api: "workspace:*"` so the type-only import resolves.
  - [ ] Create `apps/web/src/components/ErrorBoundary.tsx`: thin Solid `<ErrorBoundary fallback={...}>` wrapper rendering "Something went wrong. Refresh to try again." (full FR6 copy lands in Story 1.5).
  - [ ] In `apps/web/src/index.tsx`, wrap `<App />` in `<ErrorBoundary>` inside the `<QueryClientProvider>`.
  - [ ] Confirm `bun run --cwd apps/web build` produces `apps/web/dist/index.html` + `dist/assets/*.js`.

- [ ] **Task 5 — Root `dev` orchestration** (AC: #5)
  - [ ] Root `package.json`'s `dev` script runs both apps concurrently. Use Bun-native concurrency (no `concurrently` dep — preserves NFR-M5):
    ```json
    "dev": "bun run --cwd apps/api dev & bun run --cwd apps/web dev & wait"
    ```
    where `apps/api/package.json` defines `dev: "bun --watch src/index.ts"` and `apps/web/package.json` defines `dev: "vite"`.
  - [ ] Verify Vite proxy: visit `http://localhost:5173`, confirm focused input + title + that `fetch('/health')` from devtools returns 200 (proxied to `:3000`).

- [ ] **Task 6 — Playwright config + smoke spec** (AC: #7, #8)
  - [ ] Create `playwright.config.ts` at repo root with three `projects`:
    ```ts
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
      { name: "firefox",  use: { ...devices["Desktop Firefox"] } },
      { name: "webkit",   use: { ...devices["Desktop Safari"] } },
    ]
    ```
  - [ ] Configure `webServer` to start the production preview before specs (`bun run --cwd apps/web preview` against built `dist/` proxied through the running `apps/api` — or simpler: run `bun run dev` and depend on `/health`). Document the chosen approach in README.
  - [ ] Create `e2e/smoke.spec.ts`: assert `await page.title()` is non-empty (FR20 + AC #7), `await page.locator('input').evaluate(el => el === document.activeElement)` is true on load (FR18), `(await page.request.get('/health')).status()` is 200.
  - [ ] No project filter on this spec — it runs across all 3 projects and must pass.

- [ ] **Task 7 — Multi-stage Dockerfile + compose.yaml** (AC: #9)
  - [ ] Create root `Dockerfile`:
    ```
    # Stage 1: install
    FROM oven/bun:1.3.11-alpine AS install
    WORKDIR /app
    COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
    COPY apps/web/package.json apps/web/
    COPY apps/api/package.json apps/api/
    RUN bun install --frozen-lockfile

    # Stage 2: build SPA
    FROM install AS build
    COPY apps/web apps/web
    COPY apps/api apps/api
    RUN cd apps/web && bun run build

    # Stage 3: runtime
    FROM oven/bun:1.3.11-alpine
    WORKDIR /app
    COPY --from=build /app/node_modules ./node_modules
    COPY --from=build /app/apps/api/src ./apps/api/src
    COPY --from=build /app/apps/api/package.json ./apps/api/
    COPY --from=build /app/apps/web/dist ./apps/web/dist
    COPY --from=build /app/tsconfig.base.json ./
    ENV DATABASE_PATH=/data/tasks.db
    EXPOSE 3000
    CMD ["bun", "apps/api/src/index.ts"]
    ```
  - [ ] In `apps/api/src/index.ts` add static-file serving + SPA fallback (any path not matching `/api/*` or `/health` returns either the file under `apps/web/dist` or `index.html`). Use Elysia's `staticPlugin` if available, otherwise a catch-all `app.get("*", serveSpa)`. **In dev (`IS_DEV`), skip the static handler** so Vite's dev server owns SPA serving.
  - [ ] Create `compose.yaml`:
    ```yaml
    services:
      app:
        build: .
        ports: ["3000:3000"]
        volumes:
          - tasks-data:/data
        environment:
          DATABASE_PATH: /data/tasks.db
    volumes:
      tasks-data:
    ```
  - [ ] Verify `docker compose up` builds + starts; `curl http://localhost:3000/health` → 200; `curl http://localhost:3000/` → SPA HTML; `docker compose logs` shows JSON-shaped lines (even minimal — `console.log(JSON.stringify({ level: "info", msg: "listening", ts: Date.now() }))` is acceptable for the scaffold; full logger lands in Story 1.2).

- [ ] **Task 8 — README** (AC: #10)
  - [ ] Document, in this order: prerequisites (Bun 1.3.11, Docker), `bun install`, `bunx playwright install chromium firefox webkit`, `bun run dev`, `bun run check`, `bun run check:full`, `bun run check:release`, `docker compose up`, env vars in `.env.example`.
  - [ ] Include a "what's where" map (one paragraph) pointing at `apps/web`, `apps/api`, `e2e`, `scripts`, `_bmad-output/planning-artifacts/`.
  - [ ] Document the architectural boundary rules briefly (no raw `fetch`; all API calls go through Eden; backend uses repo pattern in later stories).

- [ ] **Task 9 — Run all three check scripts; verify green** (AC: #6, #7, #8)
  - [ ] `bun run check` passes.
  - [ ] `bun run check:full` passes (coverage threshold 70 will be tight with only smoke tests; if it fails, lower the threshold target by extending the smoke `bun:test` until aggregate ≥ 70 across both packages — DO NOT lower the threshold itself; NFR-M1 is project-wide).
  - [ ] `bun run check:release` passes locally on chromium + firefox + webkit.

- [ ] **Task 10 — Commit, verify clone-and-run** (AC: #10)
  - [ ] In a fresh directory, clone the repo and execute the README path end-to-end. Time it; confirm ≤ 30 min including Playwright browser install.

## Dev Notes

### Critical context for the dev agent

This is **Story 1 of 30** — the FIRST implementation story. There is **no previous story intelligence** to draw on. The repo is empty save for `_bmad/`, `_bmad-output/`, `.claude/`, `docs/`, and `.git/`. **Do not assume any code exists.** Every file enumerated in `_bmad-output/planning-artifacts/architecture/project-structure-boundaries.md` (the "Complete Project Directory Structure" section) must be created by this story or stubbed with `.gitkeep`. Subsequent stories (1.2–1.11, 2.x, 3.x, 4.x) populate the empty directories — **do not implement their content here**. Examples of out-of-scope work this story must NOT do:

- Logger implementation (Story 1.2 owns `apps/api/src/log.ts`, error envelope, request middleware).
- SQLite + migrations + repository (Story 1.3 owns `apps/api/src/storage/*`).
- Tasks API routes (Story 1.4 owns `routes/tasks.ts`).
- Design tokens, TaskInput, TaskList, etc. (Stories 1.5–1.7).
- Rate limiting (Story 1.4 covers it; do NOT add `rateLimit.ts` here).

The scaffold's job is **toolchain wiring + hello-world end-to-end proof**, nothing more. Prefer empty `.gitkeep` placeholders in directories owned by later stories over speculative implementation.

### Locked architectural decisions (non-negotiable)

| Concern | Decision | Source |
|---|---|---|
| Runtime | Bun 1.3.11 (runtime, package manager, test runner, SQLite client) | core-architectural-decisions.md → "Already Decided" |
| Frontend framework | SolidJS 1.9.12 (no Solid Router, no SolidStart) | core-architectural-decisions.md |
| Backend framework | Elysia 1.4.28 on `Bun.serve` | core-architectural-decisions.md |
| Build tool | Vite 8.0.10 with Rolldown bundler | core-architectural-decisions.md |
| Styling | UnoCSS 66.6.8 + `presetMini` + custom token rules | core-architectural-decisions.md |
| Lockfile | text `bun.lock` (Bun 1.2+ default) | D12 |
| Container base | `oven/bun:1.3.11-alpine` (patch-pinned) | starter-template-evaluation.md |
| TS configs | shared `tsconfig.base.json` + per-package overrides | starter-template-evaluation.md |
| Type-checker | `@typescript/native-preview` (tsgo); fallback stable TS 6 if blocked | core-architectural-decisions.md → D10 |
| Linter / formatter | oxlint + oxfmt (no Biome, no ESLint, no Prettier) | D10 |
| API client | Eden Treaty (`@elysiajs/eden`); single client at `apps/web/src/data/api.ts`; chained-access only | implementation-patterns-consistency-rules.md |
| Server-state cache | TanStack Solid Query | D7 |
| No shared `packages/contracts` | Eden carries the `App` type via `import type` | starter-template-evaluation.md → "Code Organization" |
| Container topology | Single service: Elysia serves both `/api/*` and SPA static assets | D11 |

### File structure to create (concrete)

Authoritative source: `_bmad-output/planning-artifacts/architecture/project-structure-boundaries.md` → "Complete Project Directory Structure".

**Files this story creates with real content:**

```
README.md
package.json
bunfig.toml
tsconfig.base.json
.oxlintrc.json
oxfmt.toml
.gitignore
.env.example
lighthouserc.json
playwright.config.ts
compose.yaml
Dockerfile
scripts/check-bundle-size.sh
scripts/check-dep-count.sh
e2e/smoke.spec.ts
apps/web/package.json
apps/web/tsconfig.json
apps/web/vite.config.ts
apps/web/uno.config.ts
apps/web/index.html
apps/web/public/robots.txt
apps/web/src/index.tsx
apps/web/src/App.tsx
apps/web/src/env.ts
apps/web/src/constants.ts
apps/web/src/components/ErrorBoundary.tsx
apps/web/src/data/api.ts
apps/api/package.json
apps/api/tsconfig.json
apps/api/src/index.ts
apps/api/src/index.test.ts
apps/api/src/env.ts
apps/api/src/constants.ts
```

**Empty directories (use `.gitkeep`) — owned by later stories:**

```
apps/web/src/styles/
apps/api/src/routes/
apps/api/src/middleware/
apps/api/src/errors/
apps/api/src/storage/migrations/
```

`apps/web/public/favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` are listed in the architecture but are not blockers for this story — leave placeholder files or omit (NFR-M4 path is non-blocking).

### Root `package.json` script bodies (recommended exact text)

```json
{
  "name": "bmad-todo-app",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "bun run --cwd apps/api dev & bun run --cwd apps/web dev & wait",
    "build": "bun run --cwd apps/web build",
    "check": "bun run check:lint && bun run check:format && bun run check:types && bun scripts/check-dep-count.sh",
    "check:lint": "bunx oxlint apps/ scripts/ e2e/",
    "check:format": "bunx oxfmt --check apps/ scripts/ e2e/",
    "check:types": "bunx tsgo --noEmit",
    "check:full": "bun run check && bun test --coverage --coverage-threshold 70 && bun audit && bun run build && bash scripts/check-bundle-size.sh",
    "check:release": "bun run check:full && bunx playwright test && bunx lhci autorun"
  }
}
```

Notes:
- `bun audit` covers NFR-S3 (CVE audit per release).
- `bun test --coverage --coverage-threshold 70` runs from repo root and aggregates across both workspaces (NFR-M1 is project-wide; per-package thresholds are NOT what the AC asks for).
- `bunx playwright test` (no per-project `--project` filter) runs against all three configured projects.

### TypeScript configs (concrete)

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "erasableSyntaxOnly": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "lib": ["esnext", "dom", "dom.iterable"]
  },
  "include": ["src/**/*", "vite.config.ts", "uno.config.ts"]
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["esnext"],
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

### Implementation-Patterns rules that apply NOW

From `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md`:

- **Named exports only.** No `export default`. The lone exception: framework-mandated defaults (Vite config; Solid component for App root if HMR requires it). `App` and `app` are named exports.
- **`import type` for type-only imports.** The `App` type imported in `apps/web/src/data/api.ts` MUST use `import type` so type-stripping erases it (no runtime cross-package coupling).
- **`describe(...)` + `it(...)` in `bun:test`** (not `test(...)`).
- **No `console.log` in production code.** A single `console.log(JSON.stringify({...}))` "listening on port" line in `apps/api/src/index.ts` is acceptable for the scaffold and is replaced by the proper logger in Story 1.2 — leave a one-line comment marking it as a Story 1.2 replacement target.
- **No magic numbers.** `PORT` and `DATABASE_PATH` from `env.ts`. The Playwright timeout default is fine.
- **No `any`.** Use `unknown` and narrow.
- **No raw `fetch` in app code.** The smoke test uses `page.request.get('/health')` (Playwright's API) — that's not app code, it's a test fixture; this is fine.
- **No inline SQL** — N/A this story (no SQL yet).
- **Comments default off.** Only annotate the WHY of:
  - The `console.log` placeholder in `index.ts` (mark Story 1.2 ownership).
  - Why `if (import.meta.main)` gates `app.listen()` (so tests can call `app.handle()` without listening).

### Anti-patterns to actively avoid

- ❌ Adding `concurrently`, `npm-run-all`, `tsx`, `ts-node`, `nodemon`, `pino`, or `dotenv` — Bun handles all of these natively. Each adds a dep against NFR-M5.
- ❌ Adding `cors`, `helmet`, `body-parser` — Elysia handles these natively (and we're same-origin in production via the single-service container; no CORS needed at MVP).
- ❌ Adding `better-sqlite3` — Bun's built-in `bun:sqlite` is the locked choice (Story 1.3 will use it).
- ❌ Adding `vitest`, `jest`, `mocha` — `bun:test` is the locked choice.
- ❌ Adding `eslint`, `prettier`, `biome` — oxlint + oxfmt is the locked choice.
- ❌ Creating a `packages/contracts/` shared types package — Eden Treaty replaces it.
- ❌ Implementing logging, error envelopes, rate limiting, migrations, route handlers, design tokens, TaskInput, TaskList, etc. — those are owned by Stories 1.2–1.11.
- ❌ Wiring CSS with anything other than UnoCSS (no `tailwindcss`, no `styled-components`, no CSS-in-JS).
- ❌ `export default` outside framework-required cases.
- ❌ Solid component prop destructuring (`function App({ x }) {...}`) — breaks reactivity. Use `props.x`. (Not strictly relevant for hello-world, but the pattern is set here.)

### Project Structure Notes

**Alignment with unified project structure:** This story is defined as the implementation of the unified structure itself — so by definition, every path created here must match `_bmad-output/planning-artifacts/architecture/project-structure-boundaries.md` exactly. Treat that document as a checklist; if a file or folder is listed there and not in this story's scope, create it as `.gitkeep`.

**Detected conflicts or variances:**
- The PRD mentions `Vitest/Jest coverage report` for NFR-M1; the architecture overrides this to `bun:test --coverage`. **Architecture wins** — `bun:test --coverage` is what `check:full` invokes.
- The PRD's Success Criteria reference `docker-compose up` (with hyphen); the architecture and modern Compose CLI use `docker compose up` (no hyphen, V2 plugin). **Use `docker compose` (no hyphen)** — both forms work but V2 is the documented surface in the architecture.
- The PRD's "CI required" framing in Project Scoping conflicts with D10's "no CI" decision. **Architecture D10 wins** — `bun run check:*` scripts ARE the gates; CI translation is a future move (Vision-phase).
- The architecture's `package.json` `name` for `apps/api` should be `@bmad-todo-app/api` to make `import type { App } from "@bmad-todo-app/api"` (used in `apps/web/src/data/api.ts`) resolve through Bun workspaces.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#story-1-1-initialize-monorepo-scaffold-with-toolchain] — story BDD acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture/starter-template-evaluation.md#initialization-sequence] — exact init commands and dep list
- [Source: _bmad-output/planning-artifacts/architecture/starter-template-evaluation.md#architectural-decisions-provided-by-the-scaffold] — language, runtime, repo layout, build tooling
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#complete-project-directory-structure] — full file tree
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#architectural-boundaries] — API / component / storage / env boundary rules
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#already-decided-by-prior-steps] — locked tech stack
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#api-communication-patterns] — D3 (REST endpoints), D4 (error envelope), D5 (validation)
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#frontend-architecture] — D7 (TanStack Query)
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#infrastructure-deployment] — D8 (logger), D10 (quality gates), D11 (container topology), D12 (lockfile)
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md] — naming, structure, anti-patterns, code style
- [Source: _bmad-output/planning-artifacts/architecture/architecture-validation-results.md#gaps-found-and-resolved] — Gap 1 (Vite `build.target`), Gap 2 (env var inventory), Gap 3 (operational facts)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-validation-results.md#implementation-handoff] — first-implementation-priority enumeration
- [Source: _bmad-output/planning-artifacts/prd.md#browser-matrix] — browser support matrix backing the Vite `build.target` and Playwright projects
- [Source: _bmad-output/planning-artifacts/prd.md#performance-targets] — bundle ≤ 100 KB gzipped, Lighthouse mobile ≥ 90 / desktop ≥ 95
- [Source: _bmad-output/planning-artifacts/prd.md] FR1, FR18, FR20, FR31, FR32, FR33, FR34; NFR-M1, NFR-M2, NFR-M4, NFR-M5, NFR-P1, NFR-P2, NFR-R4, NFR-R5, NFR-S3

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
