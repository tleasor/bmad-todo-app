# Implementation Patterns & Consistency Rules

These rules prevent contributors (human or AI agent) from making divergent choices on cross-cutting concerns. Most are forced by step 4's decisions; this section makes them explicit and adds the gaps step 4 didn't cover.

## Naming Conventions

**TypeScript identifiers:**

| Construct | Convention | Example |
|---|---|---|
| Functions, methods, variables | camelCase | `createTask`, `taskList` |
| Type aliases, interfaces, classes | PascalCase | `Task`, `ErrorCode`, `AppError` |
| Module-level immutable config | UPPER_SNAKE_CASE | `MAX_TASK_LENGTH`, `UNDO_WINDOW_MS` |
| String-literal union members | snake_case | `"validation_error"`, `"rate_limited"` |
| `as const` objects (enum stand-ins) | object PascalCase, keys PascalCase, string values | `const Severity = { Info: "info", Warn: "warn" } as const` |
| TanStack Query keys | hierarchical array, first element matches resource | `["tasks"]`, `["tasks", id]` |

Numeric separators encouraged for clarity (`5_000`, `100_000`).

**Files and directories:**

| Surface | Convention | Example |
|---|---|---|
| Solid components | PascalCase | `TaskRow.tsx`, `UndoSnackbar.tsx` |
| TS modules (utilities, hooks, services, repos) | camelCase | `taskRepo.ts`, `useTasks.ts` |
| Test files | sibling `.test.ts(x)` | `taskRepo.test.ts`, `TaskRow.test.tsx` |
| Config files | kebab-case (ecosystem norms) | `vite.config.ts`, `lighthouserc.json`, `bunfig.toml` |
| Constants per package | `constants.ts` at package src root | `apps/api/src/constants.ts` |
| Env validation per package | `env.ts` at package src root | `apps/api/src/env.ts` |

**Database (already locked in D2, repeated for completeness):** snake_case for tables and columns. JSON keys camelCase. Storage layer translates at the boundary.

**API (already locked in D3):** plural resource paths (`/api/tasks`), path params as `:id`, JSON keys camelCase.

## Structure Conventions

**Component organization:** by-type, single flat directory at MVP.

```
apps/web/src/components/
  TaskInput.tsx          TaskList.tsx          TaskRow.tsx
  EmptyState.tsx         LoadingState.tsx      SkeletonRow.tsx
  LiveRegion.tsx         UndoSnackbar.tsx      ErrorBoundary.tsx
```

Sub-components used only by one parent are co-located in the parent's file (e.g. `TaskRow`'s internal `Checkbox`, `DeleteButton`, `SyncIndicator`). Re-evaluate by-type vs by-feature if `components/` grows past ~15 files.

**Test colocation:** `*.test.ts(x)` files sit next to the source under test. Playwright specs live in `e2e/` at repo root. No `__tests__/` directories.

**Per-package src layout (backend):**

```
apps/api/src/
  index.ts              # Elysia app, exports App type for Eden, mounts routes
  constants.ts          # Module-level config (port, DB path default, limits)
  env.ts                # Environment validation; the only consumer of Bun.env
  log.ts                # Structured JSON logger
  errors/
    AppError.ts         # AppError class
    codes.ts            # ErrorCode enum, status mapping
    envelope.ts         # errorEnvelope() helper
  routes/
    tasks.ts            # Elysia route group, schemas inline via `t`
    health.ts
  middleware/
    rateLimit.ts        # Token-bucket implementation
    requestLogger.ts    # Per-request logger; assigns requestId
  storage/
    db.ts               # Bun:sqlite Database singleton, PRAGMA setup
    tasks.ts            # taskRepo: list, get, create, update, delete
    migrations/
      001_create_tasks.up.sql
      runner.ts         # Hand-rolled migration runner
```

**Per-package src layout (frontend):**

```
apps/web/src/
  index.tsx             # Solid mount + QueryClient + ErrorBoundary
  App.tsx               # Top-level component
  constants.ts
  env.ts
  components/           # See above
  data/
    api.ts              # Eden client; treaty<App>(...)
    queries.ts          # TanStack Query hooks (useTasks, useCreateTask, ...)
    keys.ts             # Query-key constants
    uuid.ts             # UUIDv7 generator
  styles/
    tokens.css          # CSS custom properties from UnoCSS tokens
    reset.css
```

## Module Conventions

- **Named exports only.** No `export default`. Exception: framework-mandated defaults (Vite config; Solid component for the App root if HMR requires it).
- **Type-only imports use `import type`** to ensure type-stripping erases them.
- **Import ordering** (oxlint enforces): external deps → internal package imports → relative imports. Alphabetized within each group.

## Code Style Conventions

**Async pattern:**

- `async/await` only. No `.then()` chains. No callbacks.
- Backend handlers throw `AppError`; the global `onError` middleware envelopes. Handlers do not return error envelopes manually.
- Frontend hooks let TanStack Query observe failures; `mutationFn` / `queryFn` may throw, the discriminated `error` field surfaces them. Don't try/catch inside TanStack hooks.

**Solid-specific rules:**

- Primitive signals: destructured tuple. `const [count, setCount] = createSignal(0)`. No `Signal` / `Sig` suffix on names.
- Object state: `createStore`. Same destructured-tuple shape.
- Derived values: `createMemo` when re-computation cost matters; bare function otherwise.
- Effects: `createEffect`. Use `onMount` only when the effect must run exactly once at mount.
- **Never destructure component props** — breaks reactivity. Always access as `props.foo`.
- JSX components are PascalCase; lowercase tags reserved for HTML elements.

**TanStack Solid Query rules:**

- Query keys are hierarchical arrays; first element matches the resource path segment.
- One `queryFn` per query key, defined alongside the hook.
- Optimistic mutations always set `onMutate`, `onError`, `onSettled`. `onError` does **not roll back** the cache (UX contract — row-local sync state surfaces instead).
- No `useSuspenseQuery` at MVP.

**Frontend mutation pattern — fire on intent, not on animation:**

Mutations triggered by user intent (click, keypress, etc.) must call `mutation.mutate(...)` synchronously inside the user-event handler. Visual exit animations (`animationend`, `transitionend`, `setTimeout` of an animation duration) are presentational treatment only and must not gate the mutation lifecycle. Coupling a mutation to `animationend` is fragile under `prefers-reduced-motion: reduce` — engines may skip the event on zero-duration animations — and adds a race window in which a user can navigate away or close the page before the mutation is dispatched. Trigger the cache update and the network call from the user-event handler; let the CSS animation play independently and let the row unmount when the keyed list (`<For>`) drops it. [Source: Sprint Change Proposal 2026-05-05; Story 5.1]

**Keyed lists for components with internal state:**

Use Solid's `<For>` (keyed by reference identity) — not `<Index>` — for any list whose children carry per-row state (`createSignal`, `createStore`) or DOM attachments tied to the item identity. `<Index>` keys by position and reuses component instances across position-stable slots, causing stale internal state to leak across distinct items. `<Index>` is acceptable only for stateless rendering of stable-position primitives. [Source: Sprint Change Proposal 2026-05-05; Story 5.1]

**Eden Treaty rules:**

- Chained access only, not route-string style.
- Single Eden client instance at module scope (`apps/web/src/data/api.ts`).
- All API calls go through Eden; no raw `fetch` in app code.

**Backend handler discipline:**

- Repository pattern for storage. Routes call `taskRepo.x()`; no inline SQL in handlers.
- Single Elysia app in `apps/api/src/index.ts`; routes mounted via `app.use(...)`. No nested apps.

## Cross-Cutting Conventions

**Logging:**

- Backend: `logger.info/warn/error` in production code. Never `console.log` outside scratch. Per-request middleware emits the per-request line; in-handler log calls explicitly pass `{ requestId }` from the request context.
- Frontend: `console.error` only in the global error handlers (see D9). No `console.log` in production code.

**Constants:**

- No magic numbers. `setTimeout(fn, 5_000)` is wrong; `setTimeout(fn, UNDO_WINDOW_MS)` is right.
- Module-level constants live in the package's `constants.ts`.

**Environment variables:**

- Backend: read via `Bun.env` only inside `apps/api/src/env.ts`, validated on import, re-exported as typed values.
- Frontend: read `import.meta.env` only inside `apps/web/src/env.ts` (the `VITE_` prefix is required for Vite to expose the variable).
- App code never touches `Bun.env` or `import.meta.env` directly.

**Comments:**

- Default to no comments. Add a comment only when the WHY is non-obvious — a workaround, a counter-intuitive constraint, a load-bearing invariant.
- Never add a comment that describes WHAT the code does. That's the code's job.
- No JSDoc on internal functions. Public types are self-documenting via TS; if they need explanation, the type name is wrong.

**Test structure:**

- `bun:test` idiom: `describe(...)` blocks contain `it(...)` (not `test(...)`).
- One top-level `describe` per module/component. Nested `describe` only when sub-behaviors share setup.
- Test names describe behavior, not implementation: `it("returns the task with the given id")`, not `it("getById works correctly")`.
- No mocking of `bun:sqlite`. Tests use `new Database(":memory:")` plus the migration runner. Real query path, real schema, fast.
- No mocking of HTTP. Backend integration tests hit Elysia via its in-process `.handle()` method (no network round-trip needed).

## Anti-Patterns (forbidden)

- TS enums (any kind) — `erasableSyntaxOnly` blocks them
- Default exports outside framework-mandated cases
- Destructuring Solid component props
- Raw `fetch` in app code (use Eden)
- Inline SQL in route handlers (use `taskRepo`)
- `any` (use `unknown` and narrow)
- Non-null assertions (`!`) outside test files
- Unhandled promise rejections — every `await` is observed (try/catch, `.catch()`, or inside a TanStack hook)
- `console.log` in production code (use `logger` on backend; the global handler on frontend)
- Magic numbers (use named constants)
- `// @ts-ignore` (use `// @ts-expect-error <reason>` only when truly unavoidable)
- Implicit return types on exported functions (require explicit return type — oxlint enforces)
- Backend log lines without `requestId` when inside a request context

## Enforcement

These patterns are enforced through three mechanisms:

1. **Compile-time:** TypeScript's strict mode + `erasableSyntaxOnly` block enums, untyped any, and several other issues directly.
2. **Lint-time:** oxlint catches `console.log`, missing return types, import ordering, default exports, non-null assertions. oxfmt enforces formatting.
3. **Convention:** the rest (no inline SQL, no raw fetch, naming, test structure) is reviewed at code-review time. The patterns in this section are the review checklist.

When a pattern conflicts with a real implementation need, the resolution is to update this section explicitly — not to silently violate it.
