# Architecture Validation Results

## Coherence Validation ✅

**Decision compatibility:** all current versions (Bun 1.3.11, Elysia 1.4.28, Solid 1.9.12, Vite 8.0.10, UnoCSS 66.6.8, oxlint, oxfmt, tsgo) are mutually compatible and represent current stable / preview lines. Eden Treaty is first-class on Elysia + Bun; TanStack Solid Query has no Bun-compat issues; oxc toolchain pieces are independent of the runtime stack. No conflicts.

**Pattern consistency:** naming (camelCase code / PascalCase types & components / snake_case DB), structure (by-type components, colocated tests, repo pattern, single Elysia app, named exports only), and communication (Eden client → TanStack hooks → components) are internally consistent across all sections.

**Structure alignment:** every FR has a documented home in `apps/{web,api}`. Bun workspaces work with the no-`packages/contracts` shape because Eden carries the shared types via the `App` type export. Boundaries (API, component, storage, env) are documented and respected by the structure.

## Requirements Coverage Validation ✅

**Functional Requirements (34 FRs across 8 categories):** every FR is mapped to specific files in the *Requirements-to-Structure Mapping* section above.

**Non-Functional Requirements (21 NFRs across 5 categories):** every NFR has a documented enforcement location in the *Cross-Cutting NFR Locations* table.

**UX-spec decisions (FR10 delete safety, keyboard shortcut set, focus-landing rule, sync-status indicator, retry-exhausted state, completed-task visual treatment):** all flow through the locked architectural decisions (D1, D3, D4, D5, D7) and the component placements (TaskRow, UndoSnackbar, LiveRegion).

## Implementation Readiness Validation ✅

**Decision completeness:** D1–D12 are documented with versions, rationale, and concrete configuration locks (status codes, retry policy, token-bucket parameters, log fields, etc.). No "TBD" remains.

**Structure completeness:** the directory tree is complete to the file level for all MVP components. Test files are explicitly listed alongside source.

**Pattern completeness:** Implementation Patterns section addresses naming, structure, modules, code style, Solid-specific rules, TanStack Query rules, Eden rules, backend handler discipline, logging, constants, env access, comments, test structure, and an explicit anti-pattern list.

## Gaps Found and Resolved

Three small gaps surfaced during validation; each is resolved inline below.

**Gap 1 — Vite `build.target` not configured.**

The PRD browser matrix requires Safari 15+ on iOS (FR20). Vite's default `build.target` is `["chrome87", "edge88", "firefox78", "safari14"]` — `safari14` under-targets the PRD by one major version, causing esbuild to downlevel features that Safari 15 supports natively, slightly inflating the bundle.

**Resolution:** set `build.target` explicitly in `apps/web/vite.config.ts`:

```ts
build: {
  target: ["chrome120", "edge120", "firefox120", "safari15"],
}
```

These versions track "latest 2 majors" approximately — refresh at major release time. iOS Safari is governed by the desktop Safari version (15 covers iOS 15+).

**Gap 2 — Backend env var inventory not enumerated.**

The architecture references `apps/api/src/env.ts` as the only consumer of `Bun.env`, but doesn't list the actual variables. Locking the inventory here prevents drift.

**Resolution:** the backend reads exactly these environment variables; all are read once in `env.ts`, validated on import, and re-exported as typed values:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `3000` | HTTP listen port |
| `DATABASE_PATH` | no | `./tasks.db` (dev) / `/data/tasks.db` (container) | SQLite file location |
| `NODE_ENV` | no | `development` | Toggles dev-only behaviours (verbose error envelope `details`, etc.) |

The frontend reads no environment variables at MVP. `apps/web/src/env.ts` exists for forward optionality; it reads `import.meta.env` and currently exports only `IS_DEV` (boolean from `import.meta.env.DEV`).

**Gap 3 — Operational facts (API versioning, backup recovery) implicit.**

Two operational properties were obvious from context but not stated.

**Resolution:**

- **API versioning:** there is no path-versioning at MVP. Frontend and backend are deployed as a single container image; breaking changes deploy in lock-step. If/when the API ever opens to third-party consumers (Vision-phase), introduce `/api/v1/*` and the parallel-versioning ceremony at that time.
- **Backup and recovery:** the SQLite file at the `tasks-data` volume mount (`/data/tasks.db`) is the entire persistent state of the application. Backup is a filesystem copy of that file (the WAL `journal_mode` makes hot-copy safe). Recovery is restoring the file into the volume before starting the container. No application-level backup mechanism is provided at MVP.

## Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context analyzed (PRD + UX spec, 34 FRs, 21 NFRs)
- [x] Scale and complexity assessed (low complexity, single-user, polished-execution bar)
- [x] Technical constraints identified (bundle ≤100KB, deps ≤25, ≥WCAG AA, single-container deploy)
- [x] Cross-cutting concerns mapped (optimistic-mutation contract, error envelope, structured logging, ARIA live regions, quality gates, atomic persistence, input safety, theming, reduced-motion)

**✅ Architectural Decisions**

- [x] D1–D12 documented with versions and rationale
- [x] Technology stack fully specified (Bun + Elysia + Eden, Solid + Vite + UnoCSS + TanStack Query, oxlint + oxfmt + tsgo)
- [x] Integration patterns defined (Eden type-flow, TanStack mutation lifecycle, repo pattern, single Elysia app)
- [x] Performance considerations addressed (≤100KB bundle, Lighthouse ≥90/95, ≤100ms interaction, optimistic UI as the perf primitive)

**✅ Implementation Patterns**

- [x] Naming conventions (TS identifiers, files, DB, API)
- [x] Structure patterns (component organization, test colocation, per-package src layout)
- [x] Module conventions (named exports only, type-only imports, import ordering)
- [x] Code style (async/await, Solid-specific, TanStack Query, Eden, backend handler discipline)
- [x] Cross-cutting (logging, constants, env vars, comments, tests)
- [x] Anti-patterns enumerated and forbidden

**✅ Project Structure**

- [x] Complete directory tree to file level
- [x] Architectural boundaries (API, component, storage, env) explicitly defined
- [x] Integration points documented (request flow, data flow)
- [x] Requirements-to-structure mapping (every FR/NFR traced to a location)

## Architecture Readiness Assessment

**Overall status:** READY FOR IMPLEMENTATION.

**Confidence level:** HIGH.

**Key strengths:**

- Schema-driven type safety end-to-end (Elysia route schemas → Eden type flow → TanStack Query → Solid components) means an AI agent implementing a single layer cannot silently diverge from the contract.
- Optimistic-mutation contract (D1 UUIDv7 + D3 idempotent semantics + D7 TanStack Query no-rollback) is fully specified — the load-bearing property is locked in three matching places.
- Quality gates are version-controlled (`scripts/`, `lighthouserc.json`, oxlint/oxfmt configs) and CI-ready; migration to GitHub Actions or similar is a one-step move when scope warrants.
- Single-tool orchestration (Bun for runtime/PM/test/SQLite; Vite for frontend build; oxc for lint/format) keeps the toolchain narrow.

**Known risks (with mitigation paths):**

- **tsgo is preview-grade.** Mitigation: stable TS 6 is a one-line fallback (swap `tsgo` for `tsc` in `bun run check`). No `--build` or `--declaration` features used, so missing-feature risk is bounded.
- **oxlint has no Solid-specific reactivity rules.** Mitigation: tests catch reactivity bugs at runtime; manual review at code-review time is the second line; if reactivity bugs surface in practice, the migration target is ESLint + `eslint-plugin-solid` (well-trodden path).
- **Bun is younger than Node** in production-grade adoption. Mitigation: Anthropic's own production use plus Bun 1.3.x stability; we use only the well-tested subset (HTTP server, SQLite, test runner, package manager) — no exotic Bun-only APIs.

**Areas for future enhancement (Vision-phase):**

- Multi-user → introduces auth (likely OIDC-based), per-user data isolation (per-user SQLite or shared Postgres), session management.
- Multi-device sync → libsql / Turso embedded replicas, offline-first via service worker, conflict resolution.
- Centralized observability → Pino + transport, OpenTelemetry, hosted metrics backend.
- Real CI → GitHub Actions workflow translating the `bun run check:*` scripts 1:1.
- `compose.yaml` service split → if a reverse proxy (e.g. Caddy with auto-HTTPS) becomes useful for hosted deployment.

## Implementation Handoff

**AI agent guidelines:**

- Treat this document as the single source of truth for architectural questions. When in doubt, search this document first.
- Follow the Implementation Patterns section literally — naming, structure, module conventions, anti-patterns are non-negotiable. Pattern violations are bugs.
- Respect architectural boundaries (API ↔ frontend, component ↔ data layer, handler ↔ storage, env ↔ app code). A boundary violation is a structural bug even if the code "works."
- Add a comment only when the WHY is non-obvious; the codebase aims for zero-comment readability.
- When a real implementation need conflicts with this document, update this document explicitly — never silently violate it.

**First implementation priority:**

The first story scaffolds the workspace per the Initialization Sequence in the *Starter Template Evaluation* section. Specifically:

1. Root: `package.json`, `bunfig.toml`, `tsconfig.base.json`, `compose.yaml`, `Dockerfile`, `.gitignore`, `.env.example`, `README.md`, `.oxlintrc.json`, `oxfmt.toml`, `lighthouserc.json`, `playwright.config.ts`, `scripts/check-bundle-size.sh`, `scripts/check-dep-count.sh`.
2. `apps/api/`: minimal Elysia app at `src/index.ts` exporting the `App` type, `/health` route returning `{ status: "ok", uptime }`, the env module, the constants module, the logger module, the migration runner skeleton, the tasks repository skeleton (no methods implemented yet), the error envelope module.
3. `apps/web/`: minimal Solid app at `src/index.tsx` with the QueryClient provider, top-level `<ErrorBoundary>`, the Eden client, the env module, the constants module, the UnoCSS config with token rules.
4. One backend `bun:test` ("repository connects to in-memory DB and runs migrations cleanly") and one Playwright test ("page loads with focused input; `/health` returns 200") proving the toolchain is wired end-to-end.

Subsequent stories add capability one FR group at a time, in the order of the Implementation Sequence in the *Decision Impact Analysis* section.
