# Story 1.5: Frontend Foundation — Solid App, Design Tokens, Eden Client, ErrorBoundary, LiveRegion

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a frontend developer,
I want the Solid app shell, complete design-token system, Eden client, error boundary, and LiveRegion primitive in place,
so that subsequent component stories can build against tokens and the app surfaces errors honestly.

## Acceptance Criteria

1. **Solid app shell and providers** — `apps/web/src/index.tsx` mounts the Solid app, imports `virtual:uno.css`, imports `styles/reset.css` and `styles/tokens.css`, wraps `<App />` in TanStack Query's `QueryClientProvider`, and wraps the visible app in the top-level `<ErrorBoundary>`. The existing `#root` guard stays intact.

2. **Eden client shape is future-proof** — `apps/web/src/data/api.ts` exports exactly one module-scope Eden Treaty client instance typed with `import type { App } from "@bmad-todo-app/api"` and `treaty<App>(...)`. The exported client must support later story call sites like `api.api.tasks.get()` and `api.api.tasks.post(...)`; do not export `treaty<App>("/").api` because that drops the first `api` segment expected by later stories.

3. **Query-key constants** — `apps/web/src/data/keys.ts` exports named query-key constants with hierarchical array shape, including `tasksQueryKey = ["tasks"] as const`. No inline `["tasks"]` literals outside tests after this file exists.

4. **UUIDv7 generator** — `apps/web/src/data/uuid.ts` exports a hand-rolled UUIDv7 generator using `Date.now()` and `crypto.getRandomValues()` with no new npm dependency. It produces RFC-style UUID strings, sets version bits to `7`, sets the variant bits to RFC 4122/9562-compatible `10xx`, sorts lexicographically by creation time, and stays monotonic for multiple IDs generated in the same millisecond. Unit tests cover time ordering, same-millisecond monotonicity, version nibble, and variant nibble.

5. **Design token source and CSS variables** — `apps/web/src/styles/tokens.css` defines CSS custom properties on `:root` for the light theme and inside `@media (prefers-color-scheme: dark)` or `[data-theme="dark"]` for dark theme. Tokens cover color, typography, spacing `space.0` through `space.16`, radii `radius.sm`, `radius.md`, `radius.full`, and motion `motion.instant`, `motion.short`, `motion.medium`, `motion.long`. The active theme is OS-driven via `prefers-color-scheme`; no user-facing theme toggle is added.

6. **UnoCSS token exposure** — `apps/web/uno.config.ts` exposes the same tokens through UnoCSS theme values and/or explicit rules so component stories can use token-backed utilities without hard-coded color, spacing, radius, or duration values in component code. `presetMini` remains enabled. Default export is allowed here because Vite/Uno config files require it.

7. **Reset and base document styling** — `apps/web/src/styles/reset.css` establishes border-box sizing, body margin reset, font smoothing, minimum viewport sizing, token-backed `body` background/text/font, and token-backed default focus styling. Any focused element shows a 2 px `accent.default` outline with 2 px offset. `prefers-reduced-motion: reduce` collapses non-instant animation and transition durations to instant.

8. **Typography and Inter fallback** — the frontend uses the UX-approved font stack: Inter when available, then `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `"Helvetica Neue"`, `Arial`, `sans-serif`. If an Inter Latin variable `woff2` asset is added, place it under `apps/web/public/fonts/` and load with `font-display: swap`; if the asset is not available locally, keep the full stack and document the no-asset deviation in the Dev Agent Record rather than referencing a missing font file.

9. **Contrast guardrail** — add an automated test that asserts `text.muted` contrast is at least 4.5:1 on `bg.canvas` and `bg.subtle` in both light and dark themes. The test may use a tiny local contrast helper; do not add a color or accessibility npm dependency for this.

10. **LiveRegion primitive** — `apps/web/src/components/LiveRegion.tsx` renders exactly one visually hidden `<div>` with `aria-live="polite"` and `aria-atomic="true"` when mounted. It exports a named API to announce text from anywhere in the app, such as `announce(message: string): void`, plus any test-only reset needed for isolation. It must be mounted once from the app shell/provider layer, not per row or per feature component.

11. **ErrorBoundary behavior** — `apps/web/src/components/ErrorBoundary.tsx` catches render errors and renders the inline fallback text `Something went wrong. Refresh to try again.` with `role="alert"`. Keep it as a reusable named component and avoid duplicating Solid's `ErrorBoundary` usage elsewhere.

12. **Global frontend error logging** — global `window.error` and `unhandledrejection` handlers are registered once during frontend boot and write structured JSON to `console.error` with the same broad field shape as backend logs: `level`, `msg`, `ts`, and error details such as `message` and `stack` when available. No backend `/api/errors` route, Sentry, OpenTelemetry, or new observability dependency is added.

13. **Hello-world App remains intentionally minimal** — `apps/web/src/App.tsx` may remain a foundation/demo surface only. This story must not implement `TaskInput`, `TaskList`, task fetching, optimistic creation, toggle, delete, undo, or full keyboard navigation; those belong to later stories. The page should nevertheless use token-backed layout/classes and include the single `LiveRegion` mount via the shell/provider layer.

14. **Quality gates** — `bun run check` and `bun run check:full` pass after implementation. The frontend build stays within the existing bundle budget and no new package dependency is introduced.

## Tasks / Subtasks

- [x] **Task 1 — Wire app foundation providers and imports** (AC: #1, #10, #12, #13)
  - [x] Update `apps/web/src/index.tsx` to import `styles/reset.css` and `styles/tokens.css` after `virtual:uno.css`.
  - [x] Keep the existing `#root` mount guard and QueryClientProvider.
  - [x] Mount `ErrorBoundary` and a single `LiveRegion` in the app shell/provider layer.
  - [x] Register global frontend error handlers exactly once during boot.

- [x] **Task 2 — Correct and test the Eden client boundary** (AC: #2)
  - [x] Update `apps/web/src/data/api.ts` so the named export supports `api.api.tasks.get()` and later `api.api.tasks.post(...)` call sites.
  - [x] Keep `import type { App } from "@bmad-todo-app/api"` type-only.
  - [x] Add a type-oriented test or compile-time assertion if practical; otherwise ensure `bun run check:types` validates the import and exported client shape.

- [x] **Task 3 — Add data primitives** (AC: #3, #4)
  - [x] Create `apps/web/src/data/keys.ts` with `tasksQueryKey = ["tasks"] as const`.
  - [x] Create `apps/web/src/data/uuid.ts` with a dependency-free UUIDv7 generator.
  - [x] Create `apps/web/src/data/uuid.test.ts` covering time ordering, same-millisecond monotonicity, version nibble `7`, and variant nibble.
  - [x] Use named constants in `apps/web/src/constants.ts` or module-level constants in `uuid.ts`; avoid unexplained magic numbers.

- [x] **Task 4 — Implement design tokens and reset** (AC: #5, #7, #8)
  - [x] Replace the placeholder `apps/web/src/styles/.gitkeep` with real style files, leaving no empty placeholder if the directory now has content.
  - [x] Create `apps/web/src/styles/tokens.css` with light and dark custom properties from the UX spec.
  - [x] Create `apps/web/src/styles/reset.css` for reset, base body styling, focus ring, and reduced-motion handling.
  - [x] Use the approved font stack. Only add a `@font-face` if a real Inter `woff2` asset is present under `apps/web/public/fonts/`.

- [x] **Task 5 — Expose tokens through UnoCSS** (AC: #6)
  - [x] Update `apps/web/uno.config.ts` to preserve `presetMini()` and add token-backed theme values/rules.
  - [x] Keep config import/export compatible with Vite 8 and UnoCSS 66.6.8.
  - [x] Do not introduce Tailwind, CSS Modules, vanilla-extract, or another styling system.

- [x] **Task 6 — Add LiveRegion primitive** (AC: #10)
  - [x] Create `apps/web/src/components/LiveRegion.tsx`.
  - [x] Export a named announcement API usable by future mutation stories.
  - [x] Add `apps/web/src/components/LiveRegion.test.tsx` asserting ARIA attributes, visually hidden behavior, and announcement text update.
  - [x] Ensure repeated announcements can be isolated/reset in tests without leaking between test cases.

- [x] **Task 7 — Harden ErrorBoundary and frontend error reporting** (AC: #11, #12)
  - [x] Keep or update `apps/web/src/components/ErrorBoundary.tsx` so fallback text and `role="alert"` exactly match the AC.
  - [x] Add `apps/web/src/components/ErrorBoundary.test.tsx` or equivalent coverage for a throwing child.
  - [x] Add a small module for global frontend error handler registration if it keeps `index.tsx` clean; otherwise keep it in `index.tsx`.
  - [x] Test structured `console.error` output by temporarily stubbing `console.error` in tests, restoring it in `afterEach`.

- [x] **Task 8 — Add contrast tests** (AC: #5, #9)
  - [x] Add a local contrast helper in a test file or test-only utility.
  - [x] Assert `text.muted` contrast on `bg.canvas` and `bg.subtle` for both light and dark theme values.
  - [x] Do not add color libraries or axe dependencies for this unit-level token test.

- [x] **Task 9 — Keep scope boundaries clean** (AC: #13)
  - [x] Confirm no `TaskInput.tsx`, `TaskList.tsx`, `TaskRow.tsx`, task query hooks, optimistic mutations, delete, toggle, or undo UI are implemented in this story.
  - [x] Confirm there is no raw `fetch` in `apps/web/src`.
  - [x] Confirm there is no `console.log` in production frontend code.

- [x] **Task 10 — Verify quality gates** (AC: #14)
  - [x] Run `bun run check`.
  - [x] Run `bun run check:full`.
  - [x] Record notable verification results and any accepted deviations in the Dev Agent Record.

## Dev Notes

### Critical Context

This is Story 1.5 of Epic 1 and the first frontend implementation story after the backend `/api/tasks` route landed in Story 1.4. The goal is not to build the todo workflow yet; the goal is to create the frontend foundation that later stories can safely consume.

Existing scaffold to extend:

- `apps/web/src/index.tsx` already mounts Solid, imports `virtual:uno.css`, creates a `QueryClient`, wraps the app in `QueryClientProvider`, and wraps `<App />` in `ErrorBoundary`.
- `apps/web/src/components/ErrorBoundary.tsx` already uses Solid's `ErrorBoundary` and renders the required fallback text with `role="alert"`.
- `apps/web/src/data/api.ts` already imports `treaty` and `import type { App }`, but currently exports `treaty<App>("/").api`. This must be corrected for later call sites expecting `api.api.tasks.get()`.
- `apps/web/uno.config.ts` is currently a minimal `presetMini()` config with empty `rules` and `theme`.
- `apps/web/src/styles/` currently only has `.gitkeep`.
- `apps/web/src/App.tsx` is a placeholder with an input. Do not turn it into the real TaskInput/List workflow in this story.

### Locked Decisions

- Frontend framework: SolidJS 1.9.12, no Solid Router and no SolidStart at MVP.
- Build tool: Vite 8.0.10 with UnoCSS 66.6.8 and `presetMini`.
- Server-state cache: `@tanstack/solid-query` 5.100.6.
- API typing: Eden Treaty via `@elysiajs/eden`, consuming `import type { App } from "@bmad-todo-app/api"`.
- Theme: OS-driven `prefers-color-scheme`, no theme toggle.
- Styling: design tokens via UnoCSS and CSS custom properties. Do not add Tailwind, CSS Modules, vanilla-extract, styled-components, or another styling layer.
- No new npm dependencies for this story. UUIDv7 and contrast calculation are hand-rolled.
- No raw `fetch` in frontend app code. All API calls go through Eden.

### UX Token Values

Implement these values in `tokens.css` and expose equivalent values in UnoCSS config.

Light theme:

| Token | Value |
|---|---|
| `color.bg.canvas` | `#FAFAFA` |
| `color.bg.surface` | `#FFFFFF` |
| `color.bg.subtle` | `#F4F4F5` |
| `color.border.default` | `#E4E4E7` |
| `color.border.strong` | `#A1A1AA` |
| `color.text.primary` | `#18181B` |
| `color.text.secondary` | `#52525B` |
| `color.text.muted` | `#71717A` |
| `color.text.disabled` | `#A1A1AA` |
| `color.accent.default` | `#2563EB` |
| `color.accent.subtle` | `#DBEAFE` |
| `color.status.pending` | `#A1A1AA` |
| `color.status.error` | `#B91C1C` |
| `color.status.error.subtle` | `#FEE2E2` |

Dark theme:

| Token | Value |
|---|---|
| `color.bg.canvas` | `#09090B` |
| `color.bg.surface` | `#18181B` |
| `color.bg.subtle` | `#27272A` |
| `color.border.default` | `#27272A` |
| `color.border.strong` | `#52525B` |
| `color.text.primary` | `#FAFAFA` |
| `color.text.secondary` | `#A1A1AA` |
| `color.text.muted` | `#71717A` |
| `color.text.disabled` | `#52525B` |
| `color.accent.default` | `#60A5FA` |
| `color.accent.subtle` | `#1E3A8A` |
| `color.status.pending` | `#71717A` |
| `color.status.error` | `#F87171` |
| `color.status.error.subtle` | `#450A0A` |

Typography:

- `text.display`: 1.5rem, line-height 1.3, weight 600.
- `text.heading`: 1.125rem, line-height 1.4, weight 600.
- `text.body`: 1rem, line-height 1.5, weight 400.
- `text.body.strong`: 1rem, line-height 1.5, weight 500.
- `text.meta`: 0.875rem, line-height 1.4, weight 400.
- `text.caption`: 0.8125rem, line-height 1.3, weight 400.

Spacing:

- `space.0`: 0.
- `space.1`: 4px.
- `space.2`: 8px.
- `space.3`: 12px.
- `space.4`: 16px.
- `space.5`: 20px.
- `space.6`: 24px.
- `space.8`: 32px.
- `space.10`: 40px.
- `space.12`: 48px.
- `space.16`: 64px.

Radii:

- `radius.sm`: 4px.
- `radius.md`: 8px.
- `radius.full`: 9999px.

Motion:

- `motion.instant`: 0ms.
- `motion.short`: 120ms.
- `motion.medium`: 180ms.
- `motion.long`: 240ms.

### LiveRegion Guidance

The LiveRegion is an accessibility primitive, not visible UI. It should be mounted once and shared by future mutation stories. Avoid per-component live regions because competing `aria-live` regions produce noisy or dropped announcements.

Recommended shape:

```ts
export const announce = (message: string): void => { ... };
export function LiveRegion(): JSX.Element { ... }
```

If re-announcing the same text is required, clear the signal before setting the message again. Keep this implementation small and testable. Any test-only reset helper should be named with a clear test-only prefix/suffix.

### UUIDv7 Guidance

The backend task repository sorts newest-first by `ORDER BY id DESC`; client-generated UUIDv7 IDs are what make that order match creation time. The UUID generator must therefore preserve lexicographic ordering. The same-millisecond case matters because fast keyboard capture can generate multiple IDs in a single millisecond.

Use `crypto.getRandomValues()` for random bits. Do not import `uuid`, `nanoid`, or another ID package. Tests can temporarily stub `Date.now` and `crypto.getRandomValues` but must restore both in `afterEach`.

### Global Error Logging Guidance

Global frontend errors should emit structured JSON to `console.error`, not human-only strings. The backend logger fields are the shape to mirror: `level`, `msg`, `ts`, and error-specific fields. Use `console.error` only here; production app code should not use `console.log`, `console.warn`, or ad hoc `console.error` elsewhere.

### Previous Story Intelligence

Story 1.4 established the backend `GET /api/tasks` and `POST /api/tasks` route and widened the exported backend `App` type. It also added the middleware stack, body-size limit, rate-limit headers, and the Elysia error envelope. Important carry-forward points:

- Eden type flow was intentionally left to Story 1.5 as the first real frontend consumer.
- `api.api.tasks.get()` and `api.api.tasks.post(...)` are the expected call pattern in later frontend stories.
- Error responses from the API use `{ error: { code, message, details? }, requestId }`; frontend user-facing copy mapping belongs in later query/mutation stories, not this foundation story.
- Story 1.4 review fixed `X-RateLimit-Reset` to reflect post-consume bucket state; no frontend behavior depends on that yet, but future 429 retry handling should honor `Retry-After`.

### File Structure Requirements

Create or modify only these frontend foundation files unless a test helper is justified:

```text
apps/web/src/index.tsx
apps/web/src/App.tsx
apps/web/src/constants.ts
apps/web/src/components/ErrorBoundary.tsx
apps/web/src/components/ErrorBoundary.test.tsx
apps/web/src/components/LiveRegion.tsx
apps/web/src/components/LiveRegion.test.tsx
apps/web/src/data/api.ts
apps/web/src/data/keys.ts
apps/web/src/data/uuid.ts
apps/web/src/data/uuid.test.ts
apps/web/src/styles/tokens.css
apps/web/src/styles/reset.css
apps/web/uno.config.ts
```

Potentially acceptable if needed for clean separation:

```text
apps/web/src/errors/reporting.ts
apps/web/src/errors/reporting.test.ts
apps/web/src/styles/tokens.test.ts
```

Do not modify backend files for this story unless type-checking reveals a real exported `App` type problem.

### Testing Requirements

- Use `bun:test` with `describe` and `it`.
- Solid component tests should use `@solidjs/testing-library`, already installed in `apps/web/package.json`.
- Tests must restore global stubs such as `Date.now`, `crypto.getRandomValues`, and `console.error`.
- Prefer behavior assertions over implementation details.
- Do not use Playwright for this foundation story unless a unit/component test cannot reasonably cover the behavior.

### Anti-Patterns to Avoid

- Adding a task input/list/fetching workflow in this story.
- Adding another data client, raw `fetch`, or hand-written REST wrapper.
- Adding `uuid`, `nanoid`, color libraries, accessibility libraries, or any new dependency.
- Adding a theme toggle.
- Referencing a font file that does not exist.
- Creating more than one mounted LiveRegion.
- Destructuring Solid component props.
- Using `console.log` in frontend production code.
- Hard-coding component colors/spacing when a token exists.

### Project Structure Notes

The story aligns with the architecture's frontend structure: `index.tsx` for Solid mount/providers, `components/` for reusable primitives, `data/` for Eden and data helpers, and `styles/` for token/reset CSS. The only existing variance is that `apps/web/src/styles/` currently has `.gitkeep`; it should be removed once real style files exist.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5-Frontend-Foundation] — story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Frontend-Architecture] — Solid, TanStack Query, Eden Treaty, theme, and error reporting decisions.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Per-package-src-layout-frontend] — file layout, naming, Solid, TanStack Query, and Eden conventions.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual-Design-Foundation] — token values, typography, spacing, radii, motion, contrast notes.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#LiveRegion] — LiveRegion ARIA behavior and purpose.
- [Source: _bmad-output/implementation-artifacts/1-4-backend-api-get-post-api-tasks-with-idempotency-and-per-ip-rate-limiting.md#Dev-Agent-Record] — previous story implementation notes and Eden type-flow handoff.

### Review Findings

- [x] [Review][Defer] Component tests use source-string grep instead of behavioral rendering [apps/web/src/components/LiveRegion.test.tsx, apps/web/src/components/ErrorBoundary.test.tsx] — deferred, accepted as documented deviation in Dev Agent Record (Bun test runtime has no DOM; no-new-deps Locked Decision). Revisit when a DOM shim (e.g. happy-dom registrator) is added or when component behavior must be exercised under real render.

- [x] [Review][Patch] Move `<LiveRegion />` outside `<ErrorBoundary>` so it survives the alert fallback render path [apps/web/src/index.tsx:21-25]
- [x] [Review][Patch] Add missing `--text-body-strong-size` and `--text-body-strong-line-height` to match the Dev Notes typography table for `text.body.strong` [apps/web/src/styles/tokens.css]
- [x] [Review][Patch] `registerGlobalErrorHandlers` logs literal `"undefined"` when both `event.error` and `event.message` are nullish (e.g. cross-origin sanitized "Script error." event); fall back to a stable label instead [apps/web/src/errors/reporting.ts:39]
- [x] [Review][Patch] `__resetGlobalErrorHandlersForTests` only clears the dedupe `WeakSet` — real `addEventListener` registrations persist after reset, so a follow-up `register(sameTarget)` attaches duplicate listeners. Either track refs and `removeEventListener`, or rename to convey it only resets dedupe state [apps/web/src/errors/reporting.ts:50]
- [x] [Review][Patch] File List entry "Modified: apps/web/src/components/ErrorBoundary.tsx" is inaccurate — diff shows zero changes to that file, HEAD already met AC#11. Remove or annotate as unchanged [_bmad-output/implementation-artifacts/1-5-frontend-foundation-solid-app-design-tokens-eden-client-errorboundary-liveregion.md File List]

- [x] [Review][Defer] UUIDv7 generator drifts the embedded timestamp unboundedly under backward clock skew or sustained >4096 IDs/ms — sequence overflow keeps incrementing `lastTimestampMs` past wall time with no recovery [apps/web/src/data/uuid.ts:13-22] — deferred, edge case, no current high-volume callers
- [x] [Review][Defer] LiveRegion `announce()` race / pre-mount drop / module-scope shared signal — two synchronous announces collapse to the latter; pre-mount calls vanish; SSR or HMR would surface the singleton problem [apps/web/src/components/LiveRegion.tsx:3-8] — deferred, foundation-stage acceptable, revisit when mutation stories exercise it
- [x] [Review][Defer] UnoCSS `bg-token-*`/`border-token-*`/`text-token-*` rules silently emit `undefined` for typoed token names because the regex captures any string and there's no `themeVars` membership guard [apps/web/uno.config.ts:21-32] — deferred, low impact while the surface is small
- [x] [Review][Defer] Reduced-motion override sets durations to `0ms` rather than `animation: none`/`transition: none`; iteration counts and `animationend` events still fire on some engines [apps/web/src/styles/reset.css:88-95] — deferred, no animations in scope yet
- [x] [Review][Defer] App.tsx h1 hard-codes the meta/codebase name "bmad-todo-app" as user-facing copy [apps/web/src/App.tsx:6] — deferred, pre-existing project-wide branding decision, not introduced by Story 1.5

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `bun test apps/web/src/data/uuid.test.ts apps/web/src/components/LiveRegion.test.tsx apps/web/src/components/ErrorBoundary.test.tsx apps/web/src/errors/reporting.test.ts apps/web/src/styles/tokens.test.ts` initially exposed that Bun's test runtime has no DOM and no jsx runtime setup for Solid component rendering outside Vite. Kept the no-new-dependency constraint by using source-contract tests for the component ARIA/fallback contracts and logic tests for non-DOM modules.
- The first contrast test showed the UX seed values for `text.muted` did not satisfy the story's stricter `bg.subtle` contrast guardrail. Adjusted `text.muted` to `#6F6F78` in light and `#8D8D97` in dark so both canvas and subtle backgrounds are at least 4.5:1.
- The first `bun run check:full` passed lint, format, typecheck, and tests, then failed at `bun audit` with sandboxed network `ConnectionRefused`. Re-ran `bun run check:full` with approved network escalation; it passed.

### Completion Notes List

- Implemented the frontend foundation shell: CSS token/reset imports, QueryClientProvider, top-level ErrorBoundary, single LiveRegion mount, and one-time global frontend error handler registration.
- Corrected the Eden client export to preserve the `api.api.tasks.*` chain expected by later stories.
- Added `tasksQueryKey`, dependency-free UUIDv7 generation with same-millisecond monotonicity, and focused UUID tests.
- Added token CSS, reset/base styles, focus-ring/reduced-motion handling, and UnoCSS token exposure.
- Added structured frontend error logging tests, source-level component contract tests, and token contrast tests.
- No Inter `woff2` asset was available locally, so no `@font-face` was added; the complete approved Inter-first/system fallback stack is in place.

### File List

**Created:**

- `apps/web/src/components/ErrorBoundary.test.tsx`
- `apps/web/src/components/LiveRegion.tsx`
- `apps/web/src/components/LiveRegion.test.tsx`
- `apps/web/src/data/keys.ts`
- `apps/web/src/data/uuid.ts`
- `apps/web/src/data/uuid.test.ts`
- `apps/web/src/errors/reporting.ts`
- `apps/web/src/errors/reporting.test.ts`
- `apps/web/src/styles/reset.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/tokens.test.ts`

**Modified:**

- `apps/web/src/App.tsx`
- `apps/web/src/data/api.ts`
- `apps/web/src/index.tsx`
- `apps/web/uno.config.ts`

**Unchanged (already met AC in HEAD before Story 1.5):**

- `apps/web/src/components/ErrorBoundary.tsx` — Story 1.4 already established the inline `role="alert"` fallback with the exact AC#11 copy; no edits required.
- `_bmad-output/implementation-artifacts/1-5-frontend-foundation-solid-app-design-tokens-eden-client-errorboundary-liveregion.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Deleted:**

- `apps/web/src/styles/.gitkeep`

## Change Log

| Date       | Description                                                                                           |
|------------|-------------------------------------------------------------------------------------------------------|
| 2026-04-30 | Created story 1.5 frontend foundation with design-token, Eden client, UUIDv7, ErrorBoundary, LiveRegion context. |
| 2026-04-30 | Implemented story 1.5 frontend foundation and marked ready for review. |
| 2026-04-30 | Code review complete: 5 patches applied (LiveRegion mount placement, body-strong typography tokens, error reporting "undefined" fallback + listener cleanup, file list correction); 6 items deferred; 1 decision-needed accepted as documented test deviation. `bun run check:full` passes. |
