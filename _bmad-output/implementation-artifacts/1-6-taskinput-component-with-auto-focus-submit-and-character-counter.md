# Story 1.6: TaskInput Component with Auto-Focus, Submit, and Character Counter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a text input that's already focused on page load and accepts my task text via Enter,
so that I can capture a thought without clicking, hovering, or navigating any chrome.

## Acceptance Criteria

1. **TaskInput component shape and ARIA** — `apps/web/src/components/TaskInput.tsx` exports a named `TaskInput` Solid component that renders a 48 px-tall single-line `<input type="text">` with `aria-label="New task"`, `placeholder="What needs doing?"`, `maxlength="500"`, `autocomplete="off"`, `autocapitalize="sentences"`, `spellcheck="true"`. The input has no visible label (placeholder carries intent). The component accepts a single prop `onSubmit: (text: string) => void`. Token-backed styling renders default border `color.border.default`, hover border `color.border.strong`, focused border `color.border.strong` with 2 px `color.accent.default` outline at 2 px offset, caret `color.accent.default`, padding `space.4` horizontal and `space.3` vertical, border radius `radius.sm`. No hard-coded color, spacing, radius, or duration values.

2. **Auto-focus on mount (FR18)** — TaskInput captures the input element via a Solid `ref` and calls `.focus()` inside `onMount` so the input is the focused element on first paint. The hello-world `<h1>` currently in `apps/web/src/App.tsx` is removed; `App.tsx` renders `<main>` with the TaskInput instead. No competing element claims initial focus.

3. **Enter submits trimmed value, clears, retains focus** — When Enter is pressed and `value.trim().length > 0`, TaskInput invokes `props.onSubmit(value.trim())`, sets its internal value back to `""`, and keeps focus on the input. When Enter is pressed and the input is empty or whitespace-only, the component does nothing — no submit, no clear, no error state, no announcement.

4. **Escape clears non-empty input** — When Escape is pressed and the input contains any text, the component clears its value and retains focus. When Escape is pressed and the input is already empty, the component does nothing.

5. **Shift+Enter is a no-op** — When Shift+Enter is pressed, the component does nothing — no submit, no newline insertion, no clear. Reserved for future multiline.

6. **CharacterCounter visibility threshold (UX-DR5)** — A CharacterCounter is rendered only when the current input length is ≥ 400 characters. Below 400 characters it is not in the DOM at all (no hidden node, no `display: none` placeholder). At ≥ 400 characters it renders the text `{count} / 500` right-aligned below the input using `text.caption` size and `color.text.secondary` color, with `aria-live="polite"`. The 400-char threshold and the 500-char limit are both expressed as named constants.

7. **maxlength enforces at the input level (FR1, NFR-S5)** — The native `maxlength="500"` attribute on the input rejects further keystrokes once the input value reaches 500 characters. The CharacterCounter therefore has no over-limit visual state — at exactly 500 characters it still renders `500 / 500`.

8. **TaskInput has no fetching, mutation, or list behavior** — TaskInput does not call `api.api.tasks.post(...)`, does not import `useCreateTask`, does not interact with TanStack Query, and does not render a SyncIndicator, error message, or any list affordance. The Eden client wiring already exported by `apps/web/src/data/api.ts` is untouched. App.tsx wires TaskInput's `onSubmit` to a no-op placeholder for now; the optimistic-create flow is Story 1.8's responsibility. The "typing-anywhere-captures" pattern (FR3, Journey 3) is Epic 4's responsibility and is **not** added in this story.

9. **Component unit tests cover behavior, not just source contract** — `apps/web/src/components/TaskInput.test.tsx` uses `@solidjs/testing-library` to render the component into a real DOM and assert behavior. It covers, at minimum: auto-focus on mount; Enter with non-whitespace value invokes `onSubmit` with the trimmed value, clears the input, and the input still has focus; Enter with empty / whitespace-only value does not invoke `onSubmit`; Escape clears a non-empty input and retains focus; Escape on an empty input is a no-op; Shift+Enter is a no-op; CharacterCounter is absent below 400 chars and present at and above; native `maxlength` attribute is `"500"` on the rendered input. Tests use `userEvent` (or `fireEvent`) for keyboard interactions, not implementation-detail signals.

10. **DOM shim for Bun's test runtime** — Because Bun's test runtime has no DOM by default, this story introduces a `happy-dom` global registrator (or equivalent zero-config DOM) loaded via a Bun test preload so that `@solidjs/testing-library` can render. The preload module registers the DOM once before the suite and is the *only* test-environment dependency added. The `bunfig.toml` `[test]` block lists it via `preload`. A short note in the README or the dev notes records that frontend component tests now run against a happy-dom DOM. This DOM dependency is added to `apps/web/devDependencies` only — backend tests do not consume it.

11. **axe-core unit assertion on the rendered input** — The TaskInput test suite runs `axe-core` against the rendered input subtree and asserts zero violations at `critical` (and `serious`, if axe surfaces any) impact. The dependency is `axe-core` itself (not `@axe-core/playwright`), added to `apps/web/devDependencies`. The assertion runs at least once per test file, against the populated state where it is most meaningful (e.g. typed value with counter visible).

12. **Reduced-motion compliance** — TaskInput introduces no animation that competes with the existing global `prefers-reduced-motion` reset. State-change visuals (border color shift on hover/focus, counter appearing at threshold) either use `motion.short`/`motion.instant` token-backed transitions or no transition at all. The counter appearing at 400 chars never animates in.

13. **Touch / hover / responsive behavior** — On `(hover: none)` (touch devices), the hover-border affordance is allowed to be absent — `:focus-visible` carries the focus signal. The 48 px tall input meets the ≥ 44 × 44 px touch target (PRD FR20 / NFR-A1). The input fills the content column at every tier (Compact 100 %, Medium ≤ 560 px, Expanded/Large ≤ 640 px) using the existing `.app-shell` container that Story 1.5 already establishes — no new outer wrapper is introduced.

14. **Quality gates pass** — `bun run check` and `bun run check:full` pass after this story. `bun audit` runs cleanly against the two new dev deps (happy-dom registrator + axe-core). Bundle size stays within the existing budget — neither dep ships in the production bundle (devDependencies only, and TaskInput itself adds < 2 KB gzipped expected). Per-package dep counts stay under the 25-cap (NFR-M5).

## Tasks / Subtasks

- [x] **Task 1 — Add named constants for the input limits** (AC: #6, #7)
  - [x] In `apps/web/src/constants.ts`, export `MAX_TASK_LENGTH = 500` and `CHARACTER_COUNTER_THRESHOLD = 400` (UPPER_SNAKE_CASE per architecture naming).
  - [x] Replace the existing `export {};` placeholder; the file becomes a real exporter.
  - [x] Reference these constants from `TaskInput.tsx` and the test file — no inline `500` or `400` literals.

- [x] **Task 2 — Build TaskInput with token-backed styling and auto-focus** (AC: #1, #2, #12, #13)
  - [x] Create `apps/web/src/components/TaskInput.tsx` exporting a named `TaskInput` Solid component with prop `onSubmit: (text: string) => void`.
  - [x] Use `createSignal` for the current value; do not destructure `props`.
  - [x] Capture the `<input>` element via a `ref` and `.focus()` it inside `onMount`.
  - [x] Apply token-backed styling using UnoCSS utilities (`bg-token-*`, `text-token-*`, `border-token-*`) and/or token-driven classes in `reset.css`. No hard-coded color, spacing, radius, or motion values.
  - [x] Set `aria-label="New task"`, `placeholder="What needs doing?"`, `maxlength={MAX_TASK_LENGTH}`, `autocomplete="off"`, `autocapitalize="sentences"`, `spellcheck={true}`.
  - [x] Update `apps/web/src/App.tsx`: remove the placeholder `<h1>bmad-todo-app</h1>`, render `<TaskInput onSubmit={...noop or stub...} />` inside `<main class="app-shell">`. Keep the existing `.app-shell` container and tier padding.

- [x] **Task 3 — Implement keyboard handling (Enter, Escape, Shift+Enter)** (AC: #3, #4, #5)
  - [x] On `keydown` for `Enter` without `shiftKey`: if `value.trim() === ""`, no-op (preventDefault not required, but no submit and no clear); otherwise call `props.onSubmit(value.trim())`, then set value to `""`. Re-focus is implicit because focus never leaves the input.
  - [x] On `keydown` for `Enter` with `shiftKey`: no-op (preventDefault to suppress newline insertion is fine but not required for `<input type="text">`).
  - [x] On `keydown` for `Escape`: if value is non-empty, clear to `""` and keep focus; if empty, no-op.
  - [x] Do not introduce a window/document-level keydown listener — keys are scoped to the input only. Typing-anywhere-captures is Epic 4.

- [x] **Task 4 — Add CharacterCounter sub-component** (AC: #6, #7, #11)
  - [x] Co-locate `CharacterCounter` in `TaskInput.tsx` as an internal sub-component (architecture allows co-location for single-parent sub-components). It is not a standalone file unless it is reused, which it currently is not.
  - [x] CharacterCounter renders only when `currentLength >= CHARACTER_COUNTER_THRESHOLD`. Use `<Show when={...}>` so the node is fully absent below the threshold (not just hidden via CSS).
  - [x] Render text as `{count} / {MAX_TASK_LENGTH}` (e.g. `412 / 500`) using `text.caption` size and `color.text.secondary`.
  - [x] Apply `aria-live="polite"`. Right-align below the input using token-backed spacing and the existing column width.

- [x] **Task 5 — Install happy-dom registrator and wire Bun test preload** (AC: #10)
  - [x] Add `@happy-dom/global-registrator` to `apps/web/devDependencies` at an exact version (no `^` / `~`, per existing pattern). Confirm it is the maintained registrator package — if the canonical name has shifted, use the current registrator entrypoint published by the happy-dom project.
  - [x] Create a tiny preload module under `apps/web` (e.g. `apps/web/test-setup/happy-dom.ts`) whose only side effect is calling `GlobalRegistrator.register()` once at module load. The path is workspace-local; it is not consumed by SPA source code.
  - [x] Update root `bunfig.toml` `[test]` block to add `preload = ["apps/web/test-setup/happy-dom.ts"]` (or the equivalent `[test.preload]` shape Bun's current docs require). Verify `bun test apps/api` is not broken by the preload (the registrator should be a no-op on backend modules; if it interferes, scope the preload to a per-package `bunfig.toml` under `apps/web/`).
  - [x] Confirm `bun test` for the existing `apps/api/**` suites still passes after the preload is wired.

- [x] **Task 6 — Add axe-core unit dependency** (AC: #11)
  - [x] Add `axe-core` to `apps/web/devDependencies` at an exact version. The root devDeps already include `@axe-core/playwright`; this is a different package (the unit-level engine) and the two should not be confused.
  - [x] Confirm `bun audit` passes against the new dep when running `bun run check:full`.
  - [x] Confirm `apps/web/package.json` total dep count stays ≤ 25 (`scripts/check-dep-count.sh`).

- [x] **Task 7 — Author component tests with @solidjs/testing-library and axe-core** (AC: #9, #11)
  - [x] Create `apps/web/src/components/TaskInput.test.tsx`.
  - [x] Use `render` from `@solidjs/testing-library`; clean up between tests (`cleanup` is auto in v0.8 if `afterEach` is wired, otherwise call it explicitly).
  - [x] Use the library's `userEvent` (or `fireEvent.keyDown`) for Enter, Shift+Enter, Escape, and typing.
  - [x] Assertions cover, in named `it(...)` blocks: auto-focus on mount; Enter with `"  hi  "` calls `onSubmit("hi")`, clears, keeps focus; Enter with `""` and `"   "` is a no-op (`onSubmit` mock not called); Escape clears non-empty input; Escape on empty input is a no-op; Shift+Enter does not call `onSubmit`; CharacterCounter is absent at `length === 399` and present at `length >= 400`; counter text matches `{n} / 500`; rendered input has `maxlength="500"`.
  - [x] Add at least one axe-core run on the populated state: `await axe.run(container)`, assert no `critical` or `serious` violations. Filter to the input subtree; do not scan the whole `document.body` (happy-dom may emit unrelated baseline noise).
  - [x] Use named `describe`/`it` per the existing test pattern (no `test(...)`); restore any global stubs in `afterEach`.

- [x] **Task 8 — Reuse CSS where useful, no per-component CSS file** (AC: #1, #12)
  - [x] Prefer UnoCSS utility classes for all styling. If a small token-backed class is shared (e.g. visually-hidden `.sr-only` already in `reset.css`), reuse it.
  - [x] If absolutely required, add a small token-driven rule to `apps/web/src/styles/reset.css` (the global stylesheet — no per-component CSS files per architecture). Do not introduce CSS Modules, vanilla-extract, or any new styling system.

- [x] **Task 9 — Confirm scope boundaries** (AC: #8)
  - [x] No `useCreateTask`, `useTasks`, or any TanStack Query mutation hook is introduced in this story.
  - [x] No `TaskList.tsx`, `TaskRow.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `SkeletonRow.tsx`, or `UndoSnackbar.tsx` is added. Those belong to later stories.
  - [x] No raw `fetch`, no direct call to `api.api.tasks.post(...)`, no global keydown listener, no announcement to LiveRegion (silent success per UX-DR16). LiveRegion is mounted from Story 1.5; this story does not call `announce`.
  - [x] Production frontend code contains no `console.log` (`oxlint` enforces).

- [x] **Task 10 — Verify quality gates** (AC: #14)
  - [x] Run `bun run check` (oxlint + format + tsgo + dep-count). It must pass.
  - [x] Run `bun run check:full` (adds `bun test` across workspaces, `bun audit`, build, bundle-size). It must pass. If `bun audit` blocks on a sandboxed network call, document the escalation in the Dev Agent Record exactly as Story 1.5 did.
  - [x] Record any deviation (e.g. happy-dom version pick) in the Dev Agent Record.

## Dev Notes

### Critical Context

This is the first **interactive UI** story after Story 1.5's foundation. The user-visible product surface starts here: removing the hello-world `<h1>bmad-todo-app</h1>` and putting a focused, type-into input in its place.

The product's **defining moment** is captured in this story (Journey 1's first keypress after page load — the input must already be focused with a visible caret, FR18). The bar for this surface is high: any latency, any focus glitch, any spurious DOM node leaks into the perceived quality of the whole product. Treat the focus and key-handling assertions as load-bearing.

Existing scaffold this story extends:

- `apps/web/src/index.tsx` — already wraps `<App />` in `QueryClientProvider`, `<ErrorBoundary>`, and the single mounted `<LiveRegion />`. Do not change this layout.
- `apps/web/src/App.tsx` — currently a placeholder `<main class="app-shell"><h1>bmad-todo-app</h1></main>`. Replace the `<h1>` with `<TaskInput onSubmit={...} />`. Keep `<main class="app-shell">` and its tier padding.
- `apps/web/src/styles/reset.css` — establishes the `.app-shell` container, `:focus-visible` 2 px `accent.default` outline at 2 px offset, and `prefers-reduced-motion` reset. Reuse these. Do not duplicate.
- `apps/web/src/styles/tokens.css` — full token set (color, typography, spacing, radii, motion) as CSS custom properties.
- `apps/web/uno.config.ts` — exposes the same tokens as UnoCSS theme + `bg-token-*`/`border-token-*`/`text-token-*` rules.
- `apps/web/src/data/uuid.ts` — UUIDv7 generator. **Not used in this story** (Story 1.8 generates IDs in the create flow).
- `apps/web/src/data/api.ts` — Eden client. **Not used in this story** (Story 1.8 calls `api.api.tasks.post(...)`).

### Locked Decisions (carry-forward)

- Frontend framework: SolidJS 1.9.12. Use `createSignal`, `onMount`, `<Show when>`. Never destructure props.
- Styling: UnoCSS + token CSS custom properties. No Tailwind, CSS Modules, vanilla-extract, styled-components, or another styling system.
- API typing: Eden Treaty (already wired); not exercised in this story.
- Server-state cache: TanStack Solid Query (already provided); not exercised in this story.
- No raw `fetch` in app code.
- No `console.log` in production frontend code.
- No magic numbers — use module-level constants.
- Named exports only. Default exports limited to framework-mandated configs (Vite, Uno).
- bun:test idiom: `describe(...)` + `it(...)` (no `test(...)`).

### Component Spec (authoritative — UX spec §Component Strategy → TaskInput, CharacterCounter)

**TaskInput**

- Anatomy: single-line text input, full content-column width, 48 px height.
- States:
  - **default** — border `color.border.default`, placeholder visible.
  - **hover** — border transitions to `color.border.strong`.
  - **focus** — 2 px `accent.default` outline at 2 px offset, border `color.border.strong`, caret `accent.default`.
  - **typed** — border `color.border.strong` while focused, placeholder hidden (native input behavior).
- ARIA: `aria-label="New task"`, `maxlength="500"`, `autocomplete="off"`, `autocapitalize="sentences"`, `spellcheck="true"`. Always in tab order; default `tabindex`. Auto-focused on mount (FR18).
- Interaction:
  - Enter submits if `value.trim() !== ""`; otherwise no-op. On submit, clear value and retain focus.
  - Shift+Enter: no-op.
  - Escape: clears value if non-empty; no-op when empty.

**CharacterCounter**

- Anatomy: single-line text, right-aligned below the input.
- States: **hidden** (< 400 chars — not in DOM); **visible** (≥ 400 chars — renders `{count} / 500`); **at-limit** (= 500 chars — same rendering, limit enforced at the input, no over-limit visual).
- ARIA: `aria-live="polite"`. Token: `text.caption`, `color.text.secondary`.

### Visual Token Recipe

Apply tokens via UnoCSS utilities or token classes. Concrete recipe for the input shell (express via tokens, not raw values):

- `width`: 100 % of `.app-shell` container.
- `height`: 48 px (use `h-12` from UnoCSS spacing scale, since `space.12 = 48 px`).
- `padding`: vertical `space.3` (12 px), horizontal `space.4` (16 px) → `py-3 px-4`.
- `border-radius`: `radius.sm` (4 px) → `rounded-sm`.
- `border`: 1 px solid `color.border.default` default; transitions to `color.border.strong` on `:hover` and `:focus-visible`.
- `caret-color`: `color.accent.default`. CSS: `caret-color: var(--color-accent-default)`.
- `placeholder color`: `color.text.secondary`.
- `font`: `text.body` size + weight + line-height (1 rem / 1.5 / 400 — already inherited from `body` via `reset.css`).
- `background`: `color.bg.surface` (input pops slightly off the canvas; if `bg.surface` reads identical to `bg.canvas` in light mode, that is the intended quiet register).
- `:focus-visible`: outline already provided globally (2 px `accent.default` at 2 px offset). Do not redeclare per-component.

For the counter row:

- Position: directly below the input, separated by `space.1` or `space.2` (4–8 px).
- Alignment: right.
- Color: `color.text.secondary`. Size: `text.caption`.

### Bun Test DOM Setup (the one new infrastructure lift)

Story 1.5 deferred behavioral component testing because Bun's test runtime has no DOM. Story 1.6 unblocks it.

**Recommended approach:**

1. Add `@happy-dom/global-registrator` to `apps/web/devDependencies` (verify the package name is current at install time — happy-dom occasionally renames its registrator entrypoint).
2. Create `apps/web/test-setup/happy-dom.ts`:

   ```ts
   import { GlobalRegistrator } from "@happy-dom/global-registrator";

   if (!GlobalRegistrator.isRegistered) {
     GlobalRegistrator.register();
   }
   ```

   (Adjust API call to whatever the installed version exposes; the `isRegistered` guard prevents double-registration if the module is preloaded twice.)

3. Add the preload to `bunfig.toml`:

   ```toml
   [test]
   coverage = true
   preload = ["apps/web/test-setup/happy-dom.ts"]
   ```

   `bunfig.toml` keys are documented at <https://bun.com/docs/runtime/bunfig>; if the current Bun release uses a different syntax (e.g. `preload` at the top-level `[test]` table or a separate `[test.preload]`), follow Bun's docs at install time over this template.

4. Verify the backend suite (`bun test apps/api`) still passes — happy-dom registers `window`, `document`, `HTMLElement`, etc. globally, but should not interfere with backend modules that do not reference them. If interference appears (e.g. the registrator changes `process` or `Bun` globals in a breaking way), scope the preload to a per-package `apps/web/bunfig.toml` instead of the root file.

5. The preload module itself is *not* part of `apps/web/src/`; it lives in a sibling `test-setup/` folder so it is not bundled into production. oxlint should treat it as test infrastructure.

**axe-core direct dependency:**

- Add `axe-core` (the engine) to `apps/web/devDependencies`. The root `@axe-core/playwright` is for E2E; this is the unit-level engine.
- Use `axe.run(node, options)` where `node` is the rendered container. Filter axe results to `impact: "critical" | "serious"` and assert the filtered list is empty.

### Previous Story Intelligence (Story 1.5 carryover)

Story 1.5 established the foundation and shipped the following directly relevant points:

- `LiveRegion` is mounted exactly **once** at the app shell level. **Do not** add a per-component `aria-live` region on TaskInput or CharacterCounter beyond CharacterCounter's own `aria-live="polite"` on its visible-only node — that is the spec contract for the counter and does not duplicate LiveRegion's role.
- Story 1.5's component tests use `readFileSync` source-string assertions because no DOM was available. Story 1.6's tests use `@solidjs/testing-library` (real render). Story 1.5's `LiveRegion.test.tsx` and `ErrorBoundary.test.tsx` are *not* migrated in this story — that is a separate cleanup that the deferred-work log will track. Do not delete those tests; do not "improve" them in this story.
- The `__resetLiveRegionForTests` and `__getLiveRegionMessageForTests` helpers in `LiveRegion.tsx` are dead code today; Story 1.6 does not use them.
- App.tsx currently renders an `<h1>bmad-todo-app</h1>` that the Story 1.5 review flagged as user-facing copy of the codebase identifier. **Remove this `<h1>` in Story 1.6** — UX spec §Heading hierarchy says "No visible headings ship at MVP." `<main>` plus the input is the correct structure.
- The Story 1.5 review applied a patch moving `<LiveRegion />` *outside* `<ErrorBoundary>` in `index.tsx`. Do not move it back. Do not touch `index.tsx` unless absolutely required (it should not be required for this story).
- The Story 1.5 review patched `registerGlobalErrorHandlers` for the "undefined" log fallback. Leave it alone.

### Git Intelligence Summary (recent commits)

- `1692502 Story 1.5` — frontend foundation; touches `apps/web/src/{index.tsx, App.tsx, components/, data/, errors/, styles/}` and `apps/web/uno.config.ts`. Read this commit's diff if any pattern question comes up.
- `8e3f0d2 Review story 1.4` — backend rate-limit `X-RateLimit-Reset` fix. Backend-only.
- `44bb1c5 Dev story 1.4` — backend `GET`/`POST /api/tasks` shipping. Backend-only.

### File Structure Requirements

**Create:**

```text
apps/web/src/components/TaskInput.tsx
apps/web/src/components/TaskInput.test.tsx
apps/web/test-setup/happy-dom.ts
```

**Modify:**

```text
apps/web/src/App.tsx                # remove <h1>; render <TaskInput onSubmit={noop} />
apps/web/src/constants.ts           # export MAX_TASK_LENGTH and CHARACTER_COUNTER_THRESHOLD
apps/web/package.json               # add @happy-dom/global-registrator and axe-core devDeps
bunfig.toml                         # add preload for the happy-dom registrator
```

**Do not modify** without strong cause:

```text
apps/web/src/index.tsx              # Story 1.5 layout is correct as-is
apps/web/src/components/LiveRegion.tsx
apps/web/src/components/ErrorBoundary.tsx
apps/web/src/data/api.ts            # Story 1.8 will exercise this
apps/web/src/data/uuid.ts           # Story 1.8 will exercise this
apps/web/src/data/keys.ts
apps/web/src/styles/tokens.css      # token set is complete
apps/web/src/styles/reset.css       # add a small rule only if utilities cannot express it
apps/web/uno.config.ts              # token rules already in place
apps/api/**                         # backend untouched
```

CharacterCounter is **co-located** in `TaskInput.tsx` per architecture's "Sub-components used only by one parent are co-located in the parent's file" rule. Do not create `CharacterCounter.tsx` as a top-level file unless a second parent appears (none does at MVP).

### Testing Requirements

- **Test runner:** `bun:test`. Idiom is `describe(...)` + `it(...)` (no `test(...)`).
- **DOM:** real DOM via the happy-dom registrator preload (Task 5). Tests can read/assert against `document` and the rendered container.
- **Component testing library:** `@solidjs/testing-library` (already installed). Use `render`, `screen`, and `userEvent`/`fireEvent`. Call `cleanup()` between tests if the version requires it.
- **Keyboard simulation:** prefer `userEvent.keyboard("{Enter}")`, `userEvent.keyboard("{Shift>}{Enter}{/Shift}")`, `userEvent.keyboard("{Escape}")`. Type into the input via `userEvent.type(input, "...")`.
- **Behavior over implementation:** assert the *visible* result (input value cleared, callback invoked, counter present/absent), not internal signals.
- **Axe assertion:** import from `axe-core`, run on the populated state subtree, assert no critical/serious violations.
- **Restore globals:** any test that stubs `Date.now`, `crypto.getRandomValues`, `console.error`, or document-level state must restore the original in `afterEach`. (TaskInput tests likely won't stub anything, but the rule still stands.)
- **Coverage:** the new TaskInput module + tests should keep the aggregate coverage threshold (`bun test --coverage`) green. No new coverage thresholds are introduced in this story.
- **No Playwright spec is added in this story.** `e2e/capture.spec.ts` is Story 1.8's territory (it asserts the full optimistic-prepend round-trip, not just the input). If a smoke-level Playwright test is added defensively, keep it scoped to "input is focused on load and accepts text" and do **not** assert list/sync/Eden behavior.

### Anti-Patterns to Avoid

- **Do not** add a window/document-level keydown listener for `Enter`/`Escape`/typing. Keys are scoped to the input. Typing-anywhere-captures is Epic 4's pattern.
- **Do not** call `useCreateTask`, `api.api.tasks.post(...)`, `queryClient.setQueryData(...)`, or any TanStack Query primitive in this story. The optimistic flow is Story 1.8.
- **Do not** call `announce(...)` from LiveRegion. Capture is silent per UX-DR16.
- **Do not** render the CharacterCounter with `display: none` below 400 chars — it must be absent from the DOM. Use `<Show when>`.
- **Do not** add a per-component `<style>` block, CSS module, or inline color/spacing/duration values. Tokens only.
- **Do not** destructure the component's `props`. Solid reactivity breaks if you do.
- **Do not** use `console.log` in `TaskInput.tsx` or `App.tsx`.
- **Do not** add an `aria-label` to the placeholder text or duplicate the label across `aria-label` and `aria-labelledby`. The placeholder is visual only; the `aria-label="New task"` is the programmatic label per UX spec.
- **Do not** mark Shift+Enter as "submit on a new line." It is a no-op at MVP, reserved for future multiline.
- **Do not** introduce a "validation" border / red ring on empty submit. Empty submit is a silent no-op per UX-DR. The input has no error state at MVP.
- **Do not** normalize trailing whitespace beyond `String.prototype.trim()` on submit (no collapsing of internal whitespace, no Unicode normalization, no smart-quote replacement). Trim only.
- **Do not** add `enterkeyhint`, `inputmode`, or other mobile-soft-keyboard hints in this story unless a follow-up touch story requires them — keep the surface area minimal.
- **Do not** add a "clear" button (×) inside the input. The Escape key is the clear affordance.
- **Do not** add `prefers-reduced-data` handling, lazy-load logic, or any optimization that competes with the existing motion/contrast tokens.
- **Do not** add new dependencies beyond `@happy-dom/global-registrator` and `axe-core`. No `uuid`, `nanoid`, color libraries, accessibility libraries beyond axe-core, mock libraries, or test runners.

### Project Structure Notes

The story aligns cleanly with the architecture's frontend layout (`apps/web/src/components/TaskInput.tsx` per the directory tree in `architecture/project-structure-boundaries.md`). The new `apps/web/test-setup/` folder is a **new sibling** to `src/` — it is the canonical place for Bun test preload modules and is not consumed by SPA source. If oxlint or tsgo complains about the folder being outside `src/`, add the path to the relevant include list (`apps/web/tsconfig.json` `include`, or root `oxlint` ignore/include). Do not relocate the preload into `src/` — keeping it out of `src/` prevents Vite from accidentally bundling it into the SPA.

`bunfig.toml` already exists at the repo root with `[install] exact = true` and `[test] coverage = true`. Adding `preload` under `[test]` (or in a `[test.preload]` array per Bun's current docs) is a single-key extension. The same `bunfig.toml` is read by every workspace; verify the preload path resolves correctly when `bun test` is invoked from the repo root and from `apps/web/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.6-TaskInput-Component-with-Auto-Focus-Submit-and-Character-Counter] — story statement and BDD acceptance criteria.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#TaskInput] — TaskInput component anatomy, states, ARIA, interaction.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#CharacterCounter] — CharacterCounter visibility threshold, ARIA, token usage.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Keyboard-Shortcut-Set] — Enter, Escape, Shift+Enter, Arrow Down behavior in the TaskInput-focused context.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Input-Patterns] — placeholder copy, no error state on input, character-counter at 80 % cap.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Chosen-Direction] — Input visual recipe (height, padding, radius, border, focus ring, caret, placeholder).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — silent success on capture; no toast, no announcement.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Naming-Conventions] — PascalCase components, UPPER_SNAKE_CASE constants.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules] — never destructure props, `createSignal`, `onMount`.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Per-package-src-layout-frontend] — `apps/web/src/components/TaskInput.tsx + .test.tsx` is the prescribed location.
- [Source: _bmad-output/implementation-artifacts/1-5-frontend-foundation-solid-app-design-tokens-eden-client-errorboundary-liveregion.md#Dev-Agent-Record] — tokens, font stack, focus ring, LiveRegion mount, accepted source-string-test deviation that this story replaces with real render.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — explicit deferred entry "Component tests `readFileSync` the source… revisit when a happy-dom global registrator is added." Story 1.6 is the resolution of that deferred item *for TaskInput specifically* (LiveRegion / ErrorBoundary tests stay deferred until a separate cleanup story).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- **Bun + Solid JSX runtime gap.** Solid does not ship a React-style automatic JSX runtime — its `solid-js/jsx-runtime` falls back to `dist/solid.js` which has no `jsxs` export, and `solid-js/h/jsx-runtime` produces non-reactive output. Setting `--jsx-import-source=solid-js` directly is therefore not enough. To get reactive Solid render() under `bun test`, the test preload registers `bun-plugin-solid` via `Bun.plugin()` so .tsx files pass through the same babel-preset-solid transform Vite uses at build time. This is the same plugin path Solid templates use for Bun.
- **`node` condition first.** With the plugin in place, Solid components compiled into the test loader still resolve `solid-js`/`solid-js/web` to their **server** builds because `solid-js`'s `package.json` `exports` lists `node` ahead of `browser` and Bun's default condition set is node-first. `render()` then throws `Client-only API called on the server side`. Fix: pass `--conditions=browser` when running `bun test`. Bun 1.3.11 does not honor `conditions` in `bunfig.toml` under `[test]`, `[runtime]`, or top-level (verified empirically), so the flag is wired in two places: `scripts/check-coverage.ts` (for `bun run check:full`) and a new root `test` script (`bun test apps --conditions=browser`) for ad-hoc runs.
- **happy-dom vs. Bun native fetch primitives.** `@happy-dom/global-registrator` overwrites `Response`, `Request`, `Blob`, `Headers`, `FormData`, and `fetch` on `globalThis` with happy-dom shims. Backend tests that call `await Response.text()` against `Bun.file(...)` then read `[object Blob]` instead of file contents (3 `apps/api` tests fail). Solid rendering does not exercise these primitives, so the preload saves Bun's native descriptors before `register()` and restores them after — DOM globals (`document`, `window`, `HTMLElement`, …) remain happy-dom-provided, fetch primitives stay Bun-native. Verified all 102 backend tests still pass.

### Completion Notes List

- **All 14 ACs satisfied.** TaskInput implements ARIA / shape / styling (AC1), auto-focus via `onMount` (AC2), Enter trim+submit+clear+retain-focus (AC3), Escape clear (AC4), Shift+Enter no-op (AC5), counter visibility threshold (AC6), `maxlength=500` enforcement (AC7), zero fetching/mutation surface (AC8), behavioral component tests in real DOM (AC9), happy-dom preload (AC10), axe-core unit assertion (AC11), reduced-motion neutral (AC12), 48 px touch target inside `.app-shell` (AC13), all quality gates passing (AC14).
- **Two devDeps explicitly required by the story** added to `apps/web` at exact versions: `@happy-dom/global-registrator@20.9.0`, `axe-core@4.11.4`.
- **Deviation: 4 additional devDeps required to make Solid run under `bun test`.** Added `bun-plugin-solid@1.0.0` plus its three peer-required babel packages: `babel-preset-solid@1.9.12`, `@babel/core@7.29.0`, `@babel/preset-typescript@7.28.5`. The story's "no other deps" constraint cannot be met given Solid's lack of a React-compatible automatic JSX runtime — without this plugin chain, the entire test approach (real-DOM render via `@solidjs/testing-library`) is impossible in Bun. `apps/web/package.json` total deps are 17 (well under the 25 cap, NFR-M5). All four deps are devDependencies only — production bundle is unaffected.
- **Bundle size:** main JS chunk is 14 KB gzipped, far below the 100 KB budget. TaskInput + counter together add < 2 KB gz vs. the prior Story 1.5 build.
- **Coverage:** project-wide funcs 98.91% / lines 97.16% (threshold 70%). TaskInput.tsx is at 100% / 100%.
- **`bun audit` passed** in the same `check:full` run that exercised the new deps — no high-severity advisories on `@happy-dom/global-registrator`, `axe-core`, `bun-plugin-solid`, `babel-preset-solid`, `@babel/core`, or `@babel/preset-typescript`.
- **App.tsx:** placeholder `<h1>bmad-todo-app</h1>` removed. `<main class="app-shell">` now contains only `<TaskInput onSubmit={handleTaskSubmit} />`. `handleTaskSubmit` is a typed no-op stub with a comment marking Story 1.8 as the optimistic-create owner.
- **Solid ref + lint-clean.** oxlint flags `let ref` declarations that are never explicitly assigned. Adopted the callback-ref form (`ref={(el) => (inputRef = el)}`) so the ref capture is statically visible. Behaviorally equivalent — Solid's ref attribute compiler accepts both forms.
- **Reset.css additions kept minimal.** Two small token-driven rules: `.text-caption` (typography token bundle for the counter) and `.task-input` + `.task-input::placeholder` (caret-color and placeholder color, since UnoCSS preset-mini does not expose these via `*-token-*` rules without arbitrary-value gymnastics). Per the story, `reset.css` is the canonical place for token-driven additions.
- **bunfig.toml.** Root file now has `preload = ["./apps/web/test-setup/happy-dom.ts"]` under `[test]`. The leading `./` is required — Bun 1.3.11 errors on bare `apps/web/...` preload paths.
- **scripts/check-coverage.ts** updated to add `--conditions=browser` to its `bun test` invocation. Backend tests are unaffected by the extra condition (no api dependencies branch on `browser`).
- **Visual / browser verification.** I ran `bun run dev` and confirmed Vite's dev server boots cleanly and serves the SPA shell on `:5173`. I did not perform an interactive browser walkthrough of focus/typing/counter behavior — the headless harness here cannot drive a real browser. The 12-test happy-dom suite asserts the full behavior contract (focus on mount, Enter/Escape/Shift+Enter handling, counter threshold and aria-live, axe-core a11y on the populated state, all required input attributes), which is the highest-confidence verification available without a Playwright spec. A manual sanity pass in a real browser before merge is recommended.

### File List

**Created**

- `apps/web/src/components/TaskInput.tsx` — TaskInput component + co-located CharacterCounter sub-component.
- `apps/web/src/components/TaskInput.test.tsx` — 12 behavioral + accessibility tests via `@solidjs/testing-library` and `axe-core`.
- `apps/web/test-setup/happy-dom.ts` — Bun test preload: registers happy-dom globals (preserving Bun's native fetch primitives) and `bun-plugin-solid` for .tsx loader transform.

**Modified**

- `apps/web/src/App.tsx` — removed `<h1>bmad-todo-app</h1>` placeholder; renders `<TaskInput onSubmit={handleTaskSubmit} />` inside the existing `<main class="app-shell">`.
- `apps/web/src/constants.ts` — replaced the `export {}` placeholder with `MAX_TASK_LENGTH = 500` and `CHARACTER_COUNTER_THRESHOLD = 400`.
- `apps/web/src/styles/reset.css` — added token-driven `.text-caption`, `.task-input`, and `.task-input::placeholder` rules.
- `apps/web/package.json` — added devDeps `@happy-dom/global-registrator@20.9.0`, `axe-core@4.11.4`, `bun-plugin-solid@1.0.0`, `babel-preset-solid@1.9.12`, `@babel/core@7.29.0`, `@babel/preset-typescript@7.28.5` (all exact, dev-only, total deps still ≤ 25).
- `apps/web/tsconfig.json` — added `test-setup/**/*` to `include` so the preload module is type-checked.
- `bunfig.toml` — added `preload = ["./apps/web/test-setup/happy-dom.ts"]` under `[test]`.
- `scripts/check-coverage.ts` — added `--conditions=browser` to the `bun test` invocation; documented why.
- `package.json` — added `"test": "bun test apps --conditions=browser"` script for ad-hoc runs.
- `bun.lock` — regenerated for the new devDependencies.

### Review Findings

- [x] [Review][Decision→Patch] Bare `bun test apps/web/src/...` is broken without `--conditions=browser` — resolved 2026-04-30 by documenting the entrypoint contract in README ("Running tests" subsection) and adding a comment to `bunfig.toml [test]`. Single-file invocation is intentionally unsupported until Bun ships condition support in config; documented `bun test <file> --conditions=browser` as the manual escape hatch.
- [x] [Review][Patch] IME composition guard added on Enter [apps/web/src/components/TaskInput.tsx:20] — `event.isComposing` short-circuits the handler, plus a new `it("does not submit on Enter while an IME composition is in progress")` test.
- [x] [Review][Patch] AC7 at-limit coverage added [apps/web/src/components/TaskInput.test.tsx] — new `it("renders 500 / 500 at the maxlength limit")` exercises the populated state at MAX_TASK_LENGTH and asserts both `input.value.length === 500` and the counter text. Real-browser keystroke-rejection at the 501st key remains a Playwright concern (happy-dom does not simulate the native clamp on synthetic events).
- [x] [Review][Patch] `bunfig.toml [jsx]` block removed 2026-04-30 — it was dead config (bun-plugin-solid transforms `.tsx` via babel-preset-solid before Bun's JSX runtime is consulted) and a monorepo-wide scope expansion the spec did not authorize.
- [x] [Review][Defer] Four extra devDeps beyond AC10's "only" constraint [apps/web/package.json:devDependencies] — deferred, justified deviation acknowledged in Dev Agent Record (`bun-plugin-solid`, `babel-preset-solid`, `@babel/core`, `@babel/preset-typescript` are required to run Solid under Bun; AC10 wording violated but no realistic alternative).
- [x] [Review][Defer] "Retains focus after Enter / Escape" assertions are fireEvent-trivial under happy-dom [apps/web/src/components/TaskInput.test.tsx:59, 90] — deferred, requires real-browser focus algorithm. Story 1.8's `e2e/capture.spec.ts` Playwright run is the natural place to add the assertion.

## Change Log

| Date       | Change                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-04-30 | Implemented TaskInput + CharacterCounter, wired Bun test preload (happy-dom + bun-plugin-solid), added 12 component tests. Story moved to `review`. |
| 2026-04-30 | Code review run. 1 decision-needed, 3 patches, 2 deferred, ~21 dismissed as noise/spec-compliant.                       |
| 2026-04-30 | Review patches applied: IME composition guard + at-limit (500/500) test + bunfig `[jsx]` block removal + README "Running tests" docs. 14 component tests now (was 12). Story → done. |
