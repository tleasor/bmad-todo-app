# bmad-todo-app

A keyboard-first task list. Single SQLite-backed service, served as one Docker container.

## Prerequisites

- **Bun 1.3.11** (runtime, package manager, test runner). The repo pins this via `.prototools` — install [proto](https://moonrepo.dev/proto) and run `proto install` from the repo root, or grab Bun directly: `curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.11`.
- **Docker** (for `docker compose up`).

## Clone and run

```bash
bun install
bunx playwright install chromium firefox webkit
bun run dev
```

Then open <http://localhost:5173>. The frontend (Vite, port 5173) proxies `/api/*` and `/health` to the backend (Elysia, port 3000).

## Scripts

| Script | What it does | Approx. time |
|---|---|---|
| `bun run dev` | Starts both apps with watch + HMR | continuous |
| `bun run build` | Builds the SPA to `apps/web/dist/` | ~1 s |
| `bun run check` | Lint (oxlint) + format check (oxfmt) + typecheck (tsgo) + dep-count cap | ~5 s |
| `bun run check:full` | `check` + unit tests with 70 % coverage threshold + `bun audit` + bundle size cap | ~30 s |
| `bun run check:release` | `check:full` + Playwright across chromium/firefox/webkit + Lighthouse | ~6–8 min |

## Production container

```bash
docker compose up --build
```

Serves the SPA and API on a single port (3000). `/health` returns `{ "status": "ok", "uptime": ... }`. Logs are JSON lines on stdout — `docker compose logs` to view. SQLite data persists in the `tasks-data` named volume at `/data/tasks.db`.

## Environment variables

Documented in `.env.example`. All read inside `apps/api/src/env.ts`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_PATH` | `./tasks.db` (dev), `/data/tasks.db` (container) | SQLite file location |
| `NODE_ENV` | `development` | `production` enables SPA static serving |

The frontend reads no env vars at MVP. `apps/web/src/env.ts` exports `IS_DEV` from `import.meta.env.DEV` for forward optionality.

## What's where

- `apps/web/` — SolidJS SPA (Vite, UnoCSS, TanStack Solid Query, Eden Treaty client).
- `apps/api/` — Elysia API on Bun. The single Elysia `app` instance is the public surface; its type powers the frontend's typed Eden client.
- `e2e/` — Playwright specs running against all three browser projects.
- `scripts/` — shell guards for the dep-count cap (≤ 25 per package) and bundle-size cap (≤ 100 KB gzipped).
- `_bmad-output/planning-artifacts/` — PRD, UX spec, architecture docs, epics. Source of truth for what to build and why.

## Architectural boundaries

A short list — full text in `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md`:

- **No raw `fetch` in app code.** All API calls go through `apps/web/src/data/api.ts`, the single Eden Treaty client.
- **No inline SQL in route handlers.** Storage code lives behind a repository in `apps/api/src/storage/` (added in story 1.3).
- **`Bun.env` is read only inside `apps/api/src/env.ts`.** Likewise `import.meta.env` only inside `apps/web/src/env.ts`.
- **Named exports only**, with the narrow exceptions Vite/Playwright config files require.
- **Tests use `describe(...)` + `it(...)`**, never `test(...)`.

## Browser support

Chrome ≥ 120, Edge ≥ 120, Firefox ≥ 120, Safari ≥ 15. Vite's `build.target` and Playwright's project list both reflect this.
