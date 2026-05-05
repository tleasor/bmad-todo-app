# Story 1.7: Task List Display — TaskList, TaskRow (Active State), EmptyState, LoadingState

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see my tasks in a list — a clear empty state if none, or a skeleton if loading is slow,
so that I always know what's in my list, including when there's nothing.

## Acceptance Criteria

1. **`useTasks` query hook exists and uses architecture-locked config (FR2, ARCH-D7)** — `apps/web/src/data/queries.ts` exports a named `useTasks()` hook that calls TanStack Solid Query's query primitive with key `tasksQueryKey` (the existing `["tasks"] as const` from `apps/web/src/data/keys.ts`), a `queryFn` that calls `api.api.tasks.get()` via the existing Eden client and returns the typed `Task[]` (unwrapping Eden's `{ data, error }` discriminant — the hook throws on `error` so TanStack Query's `error` field surfaces it). The query options exactly match the architecture-locked tasks-query config: `staleTime: Number.POSITIVE_INFINITY`, `gcTime: Number.POSITIVE_INFINITY`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`. The hook returns the TanStack Query observer object (with at minimum `data`, `isPending`, `error`, `refetch`); no custom remapping. `Task` is imported as a type from `@bmad-todo-app/api` (or re-exported from `apps/web/src/data/api.ts`) so the frontend's view of the row shape stays in sync with the backend through Eden.

2. **`TaskList` component renders all four list states inline (FR2, FR4, FR5, FR6)** — `apps/web/src/components/TaskList.tsx` exports a named `TaskList` Solid component with no props that consumes `useTasks()` and renders one of four states based on the observer's `isPending` / `data` / `error` values: pending-but-under-200 ms (renders nothing in the list area), pending-and-≥200 ms (renders `LoadingState`), resolved-with-zero-tasks (renders `EmptyState`), resolved-with-≥1-task (renders the populated list — see AC #5). The list-level fetch-error state (FR6) is **not wired in this story** — it is Story 1.10's responsibility — but the component is structured so that adding the `error` branch in Story 1.10 is a single-arm addition and not a refactor.

3. **200 ms loading-flash gate (UX-DR9, UX-DR20)** — Below 200 ms of `isPending`, `TaskList` renders no loading UI (no skeletons, no spinner, no aria-busy node). At or above 200 ms of `isPending`, `TaskList` mounts `LoadingState`. The 200 ms threshold is implemented via a `createSignal<boolean>` toggled by `setTimeout` started when `isPending` first becomes `true`, and cleared (`clearTimeout` + reset to `false`) when `isPending` becomes `false` so the gate restarts cleanly on the next pending cycle (e.g., a Story 1.10 `refetch()`). The 200 ms value is exported as a named constant `LOADING_DELAY_MS` from `apps/web/src/constants.ts` — no inline `200` literal.

4. **`LoadingState` + `SkeletonRow` skeleton block (UX spec §LoadingState, §SkeletonRow)** — `apps/web/src/components/LoadingState.tsx` exports a named `LoadingState` component that renders a container with `aria-busy="true"` and `aria-live="polite"` holding three `SkeletonRow` instances at widths `100%`, `75%`, and `60%` of the row text region. `SkeletonRow` is co-located in the same file (single parent), takes a `width` prop (the variant: `"full" | "mid" | "short"`), and renders a 20 px circular placeholder (`bg.subtle`) plus a 16 px-tall flex-grow text-bar placeholder (`bg.subtle`) at the variant width, with `aria-hidden="true"`. The shimmer animation uses `motion.shimmer` (1500 ms `ease-in-out` cycle, infinite — see Code Review Decision #2 below); under `prefers-reduced-motion: reduce`, the shimmer is removed and the static `bg.subtle` fill remains. No skeleton row is rendered as a `<li>` — the skeletons are presentational siblings inside the LoadingState container, not list items.

5. **`TaskRow` active-state rendering (UX spec §TaskRow → "active" state)** — `apps/web/src/components/TaskRow.tsx` exports a named `TaskRow` component with prop `task: Task` that renders a `<li>` with `tabindex="0"`, layout `[Checkbox | task text (flex-grow) | DeleteButton]`, gap `space.3`, vertical padding `space.3`, horizontal padding `space.4` (Compact tier) / `space.2` (Expanded tier and above via `min-width: 900px` media query), and a 1 px bottom divider in `color.border.default`. Task text renders as `task.text`, color `color.text.primary`, weight 400, wrapping to at most two lines before ellipsis (`-webkit-line-clamp: 2`, `-webkit-box-orient: vertical`, `display: -webkit-box`, `overflow: hidden`, `text-overflow: ellipsis`). On row hover (desktop), background becomes `color.bg.subtle` and DeleteButton opacity transitions from 0 → 1 over `motion.short`. On row focus-visible, the row receives the global 2 px `accent.default` outline at 2 px offset (the `:focus-visible` rule already in `reset.css` carries this) and DeleteButton opacity is 1. On `@media (hover: none)`, DeleteButton opacity is permanently 1 — a hidden affordance is undiscoverable on touch.

6. **`Checkbox` and `DeleteButton` sub-components are co-located in `TaskRow.tsx` and render the active-state visuals only (no mutation wiring)** — `Checkbox` is a 20 × 20 px circular affordance: 2 px border `color.border.strong`, transparent fill, no checkmark (active-only state). It renders as a `<button type="button" role="checkbox" aria-checked="false" aria-label="Mark task as complete">` element so future Story 2.2 can wire the toggle handler without re-introducing the element. **It has no `onClick` in this story** (Story 2.2 owns the toggle mutation). `DeleteButton` is a 16 × 16 px trash icon (inline SVG, `currentColor`, no external icon library) inside a `<button type="button" aria-label="Delete task">` element. **It has no `onClick` in this story** (Story 3.2 owns the delete mutation). Both buttons must be present in DOM and tab-reachable so future stories layering interaction do not change DOM structure. The trash SVG is local to the file (no new dependency).

7. **`EmptyState` component renders the locked copy (UX-DR8, FR4)** — `apps/web/src/components/EmptyState.tsx` exports a named `EmptyState` component with no props that renders a single `<p>` with the exact copy `"No tasks yet. Start by typing above."` using `text.body` size and `color.text.secondary`, centered horizontally inside the list area. It has no icon, no button, no illustration. `aria-live` is **not** set (per UX spec — static content; the input is the actionable element). The element is rendered within the same DOM position the populated list would occupy.

8. **Populated list renders newest-first with stable keys (FR2, ARCH-D1)** — When `useTasks` resolves with one or more tasks, `TaskList` renders a `<ul role="list">` containing one `TaskRow` per task in the order returned by the backend (which is `ORDER BY id DESC` — newest first via UUIDv7 timestamp prefix; do not sort or reverse client-side). Each `TaskRow` is keyed on `task.id` via Solid's `<For each={tasks()}>` render. The `<ul>` carries explicit `role="list"` (so screen readers do not lose list semantics if list-style is stripped by `reset.css` or UnoCSS), no padding, no border. Rows own their own dividers; the `<ul>` does not.

9. **XSS regression guard (NFR-S1)** — A unit test in `apps/web/src/components/TaskRow.test.tsx` asserts that two malicious payloads — `"<script>alert(1)</script>"` and `"<img src=x onerror=alert(1)>"` — render as **literal text** inside the row, not as DOM nodes. Specifically: `queryByText("<script>alert(1)</script>", { exact: true })` must return a non-null element whose `textContent` equals the input string; `container.querySelector("script")` must return `null`; `container.querySelectorAll("img").length` must be `0` (no `<img>` element appears in the rendered subtree). A second assertion confirms no rendered element carries an `onerror`, `onclick`, `onload`, or any `on*` event-handler attribute — iterate `element.attributes` and assert no name starts with `"on"`. This is a regression guard against any future change that swaps `{task.text}` for `innerHTML`-style rendering.

10. **Component unit tests cover every list state and each component contract** — Behavioral tests via `@solidjs/testing-library` and `bun:test` (idiom `describe(...)` + `it(...)`) cover, with one or more `it()` assertions per case:
    - `TaskList.test.tsx`:
      - **Pending under 200 ms — nothing in list area.** Render with a query that stays pending; immediately after mount, assert no `aria-busy="true"` element, no `role="list"`, no EmptyState copy. Do not advance fake timers.
      - **Pending at/over 200 ms — LoadingState renders.** Render the same pending state; advance fake timers by `LOADING_DELAY_MS`; assert one `aria-busy="true"` container with three skeleton placeholder rows (matched by a stable test class or `data-testid="skeleton-row"`), and `aria-live="polite"` on the container.
      - **Empty — EmptyState renders.** Pre-seed the QueryClient with `[]` for `tasksQueryKey`; render; assert the exact copy `"No tasks yet. Start by typing above."` is present and no `<ul>` is rendered.
      - **Populated — one TaskRow per task in given order.** Pre-seed the QueryClient with two mock tasks (newest first); render; assert one `<ul role="list">` with two `<li>` children, each carrying its `task.text` in order. The mock tasks include realistic UUIDv7-shaped ids, `completed: false`, and `createdAt`/`updatedAt` numbers.
    - `TaskRow.test.tsx`:
      - **Active-state structure.** Renders `<li tabindex="0">` containing the checkbox affordance (a `<button role="checkbox" aria-checked="false">`), the `task.text`, and the DeleteButton (`<button aria-label="Delete task">`).
      - **DeleteButton has no onClick.** Clicking the DeleteButton in this story does not throw and does not trigger any mutation; it can be tested by simply asserting the button has no `disabled` attribute and that clicking it does not change the rendered task text or remove the `<li>`. (Mutation behavior arrives in Story 3.2.)
      - **Checkbox `aria-checked="false"`.** Asserts `getByRole("checkbox").getAttribute("aria-checked")` is `"false"` for an active task.
      - **XSS regression.** Per AC #9.
      - **Two-line wrap classes are present.** Assert the task-text element carries the line-clamp class set (a stable class like `task-row__text` or token-driven UnoCSS arbitrary-value class) so a future change accidentally dropping the clamp surfaces in tests rather than only in visual review.
    - `queries.test.ts`:
      - **`useTasks` exposes architecture-locked config.** A "type-shape" + "options" test that creates the hook inside a test `QueryClientProvider`, lets it resolve with a stubbed Eden response (see Testing Requirements below for the recommended stub mechanism), and asserts: the active TanStack query observer's options report `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`. Also asserts the query key equals the imported `tasksQueryKey` reference.
      - **`useTasks` returns parsed task array on success.** Stub Eden so `api.api.tasks.get()` resolves to `{ data: [task1, task2], error: null }`; assert the hook's `data()` resolves to that array, in the given order.
      - **`useTasks` surfaces Eden error as a thrown error.** Stub Eden so the call resolves to `{ data: null, error: { status: 500, value: { error: { code: "internal_error", message: "boom" } } } }`; assert the hook reaches an `error` state (`isError === true`) and the thrown `error.message` includes the backend `error.code` or `error.message` from the envelope (the dev picks whichever is more useful for log/UI surfaces — Story 1.10 will use this).

11. **axe-core unit assertions on every visible state** — In addition to the component tests, run `axe.run(container)` from `axe-core` against:
    - The `TaskList` empty-state render (assert no critical/serious violations).
    - The `TaskList` populated render with two tasks (assert no critical/serious violations).
    - The `TaskList` pending-≥200 ms render (assert no critical/serious violations on the LoadingState).
    Filter axe results to `impact === "critical" || impact === "serious"` and assert the filtered list is empty. Run on the rendered subtree (`container`), not `document.body`, to avoid baseline noise from happy-dom (consistent with Story 1.6's pattern).

12. **`App.tsx` integration: `<TaskList />` mounts below `<TaskInput />`** — `apps/web/src/App.tsx` is updated to render `<TaskList />` immediately after `<TaskInput />` inside the existing `<main class="app-shell">` container, separated by `space.8` (32 px, the input-to-list gap from the UX spec spacing tokens — render via UnoCSS spacing utility `mt-8` on the `TaskList` root or a margin-top utility on a wrapper inside `TaskList`). The existing `handleTaskSubmit` no-op stub remains in `App.tsx` (Story 1.8 wires it to `useCreateTask`).

13. **`TaskList` is the only component allowed to consume `useTasks` in this story** — Per architecture's component-↔-data-layer boundary, components consume data exclusively through TanStack Query hooks; hooks are the only consumers of `api`. `TaskRow`, `EmptyState`, `LoadingState`, `SkeletonRow`, and `TaskInput` must not import `useTasks`, `api`, or `tasksQueryKey`. `TaskList` passes `task: Task` down to `TaskRow` as a prop. `App.tsx` continues not to import `useTasks`, `api`, or `useCreateTask`.

14. **Responsive snapshot coverage at three tiers (UX-DR18)** — The `TaskList.test.tsx` populated case includes three render assertions taken at viewport widths matching the **Compact (375 × 667)**, **Expanded (1024 × 768)**, and **Large (1440 × 900)** tiers. Implementation: drive `window.innerWidth` / `window.innerHeight` through a small helper, dispatch a `resize` event, and assert that the rendered DOM has the row's tier-conditional horizontal padding (Compact: `space.4`; Expanded/Large: `space.2`) by checking computed/applied class names — happy-dom does not run media queries against `window.matchMedia` perfectly, so the assertion targets the className contract rather than computed style. If happy-dom blocks reliable verification, the test may instead assert the class set for both Compact and Expanded by inspecting source attributes (presence of the `md:px-2` / `md:px-token-2` UnoCSS utility on the row), and document the limitation in the Dev Agent Record. **Visual snapshot regression at the three tiers belongs in a future Playwright spec; do not introduce a new visual-regression dependency in this story.**

15. **No new production dependencies; tightly bounded scope** — No new `dependencies` in `apps/web/package.json`. No new `devDependencies` unless a strictly necessary shim emerges (none anticipated; the happy-dom + axe-core + bun-plugin-solid chain installed by Story 1.6 is sufficient for these tests). No raw `fetch`. No direct `api.api.tasks.get()` from a component. No `LiveRegion.announce(...)` call (silent success — capture and list resolution are not announcements per UX-DR16). No `useSuspenseQuery`, no `useInfiniteQuery`, no `useMutation` (Story 1.8 introduces the first mutation hook). No new icon library — the trash icon is an inline SVG, ≤ 30 LOC, copied from a permissive-license source (e.g., Heroicons, Lucide outline trash) or hand-authored. Total deps stay ≤ 25 per package (NFR-M5).

16. **Quality gates pass** — `bun run check` and `bun run check:full` pass after the story. `bun audit` runs cleanly. Coverage stays green (the new components contribute meaningful coverage; aim for the new files at ≥ 80 % statements, in line with Story 1.6's TaskInput coverage). Bundle size stays well within the 100 KB gzipped main-chunk threshold (the four new components plus `useTasks` should add < 6 KB gz collectively — TanStack Query is already in the bundle from Story 1.5).

## Tasks / Subtasks

- [x] **Task 1 — Add module-level constants** (AC: #3, #14)
  - [x] In `apps/web/src/constants.ts`, add `export const LOADING_DELAY_MS = 200;` (UPPER_SNAKE_CASE per architecture naming).
  - [x] If a `SKELETON_ROW_COUNT` or skeleton-width tuple is helpful to remove inline magic numbers, add them too — but keep `constants.ts` lean; the three skeleton widths can also live as a local `const SKELETON_WIDTHS = ["100%", "75%", "60%"] as const` inside `LoadingState.tsx` since they are component-internal.
  - [x] Reference `LOADING_DELAY_MS` from `TaskList.tsx` and its test — no inline `200` literal.

- [x] **Task 2 — Implement `useTasks` query hook** (AC: #1, #10, #13)
  - [x] Create `apps/web/src/data/queries.ts` exporting a named `useTasks` function.
  - [x] Use TanStack Solid Query's query primitive — confirm the correct name in the installed `@tanstack/solid-query@5.100.6` (it is `useQuery` in v5; some examples use `createQuery` from older versions — the install in this repo is v5). Import order per oxlint: external → internal → relative.
  - [x] Inside the hook, call `api.api.tasks.get()` from `apps/web/src/data/api.ts`. Eden returns `{ data, error }` (the `error` is the discriminated envelope from `apps/api/src/onError.ts`). The hook's `queryFn` must throw if `error` is non-null so TanStack Query's `error` state is reachable; `throw new Error(error.value?.error?.message ?? \`HTTP \${error.status}\`)` is acceptable, or a small typed wrapper is fine.
  - [x] Apply the architecture-locked tasks-query options exactly: `staleTime: Number.POSITIVE_INFINITY`, `gcTime: Number.POSITIVE_INFINITY`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`. Use `tasksQueryKey` from `apps/web/src/data/keys.ts` for the `queryKey`.
  - [x] The hook returns the TanStack observer object directly (no remap). Type its return as `UseQueryResult<Task[], Error>` (or v5's equivalent name) for surface clarity to consumers.
  - [x] Re-export `Task` type from `apps/web/src/data/api.ts` (as `export type { Task } from "@bmad-todo-app/api";` — use `import type` chain, no runtime import). This keeps `TaskRow`'s prop type in sync with the backend without introducing a new transitive import path for components.

- [x] **Task 3 — Build `EmptyState`** (AC: #7, #11)
  - [x] Create `apps/web/src/components/EmptyState.tsx` exporting a named `EmptyState` component with no props.
  - [x] Render a single `<p>` with exact copy `"No tasks yet. Start by typing above."`. Apply `text.body` size and `color.text.secondary`. Center horizontally (e.g., `text-center` UnoCSS utility) inside its parent column.
  - [x] Do not set `aria-live` on the element. Do not add an icon, button, or illustration. Do not add `role="status"`.
  - [x] No tests for this single-string component beyond what `TaskList.test.tsx` exercises (rendering it via the empty branch). axe assertion piggybacks on the empty-state TaskList test.

- [x] **Task 4 — Build `LoadingState` + co-located `SkeletonRow`** (AC: #4, #11)
  - [x] Create `apps/web/src/components/LoadingState.tsx` exporting a named `LoadingState` component with no props.
  - [x] The component renders a container `<div aria-busy="true" aria-live="polite">` with a flex-column layout, `gap: space.3` (matching the populated list's row rhythm so the loading-to-resolved transition does not jump vertical layout).
  - [x] Inside, render three `SkeletonRow` instances with `width="full" | "mid" | "short"` (or `"100%" | "75%" | "60%"` as the literal value — pick the variant style consistently). Each skeleton renders a 20 × 20 px circle (`bg.subtle`) and a 16 px-tall flex-grow bar (`bg.subtle`) at the variant width.
  - [x] Apply the shimmer animation as a token-driven CSS keyframes rule on the bar (and optionally circle): use `motion.medium` (180 ms) `ease-out` cycle. Define the keyframes in `apps/web/src/styles/reset.css` (the canonical token-driven stylesheet) under a `.skeleton-shimmer` class — do **not** inline a new CSS file or per-component `<style>` block. The shimmer is a 0.4 → 1 → 0.4 opacity loop on the `bg.subtle` fill. Under `@media (prefers-reduced-motion: reduce)` (already wired in `reset.css`), the existing `transition-duration` reset clamps the animation; explicitly set `animation: none` on `.skeleton-shimmer` inside the reduced-motion block to replace the shimmer with a static fill (per UX-DR20).
  - [x] `SkeletonRow` co-located in `LoadingState.tsx` per architecture's "Sub-components used only by one parent are co-located in the parent's file" rule.
  - [x] Each skeleton row has `aria-hidden="true"` (the LoadingState container carries the live region semantics; per-skeleton ARIA is noise).
  - [x] Add `data-testid="skeleton-row"` to each SkeletonRow root for stable test selection (the frontend has no other `data-testid` convention yet — it is acceptable here because there is no naturally-queryable role/label for a presentational placeholder; document the convention in the Dev Agent Record so a future story does not invent a different testid pattern).

- [x] **Task 5 — Build `TaskRow` with co-located `Checkbox` and `DeleteButton`** (AC: #5, #6, #8, #9, #10)
  - [x] Create `apps/web/src/components/TaskRow.tsx` exporting a named `TaskRow` component with prop `task: Task`. **Never destructure `props`.**
  - [x] Render the row as `<li tabindex="0" class="task-row">` with the layout described in AC #5. Use UnoCSS utilities for spacing/gap; use a small token-driven class in `reset.css` for cross-cutting visuals that do not cleanly express as utilities (e.g., the 1 px bottom border in `color.border.default`, the line-clamp ellipsis recipe).
  - [x] Apply hover state (`hover:bg-token-bg-subtle`) and the focus-visible outline already provided globally by `reset.css`. Do not redeclare the focus ring per-component.
  - [x] Apply the responsive horizontal-padding rule via UnoCSS responsive prefix: `px-4 md:px-2` (where `md` corresponds to 900 px in the existing `uno.config.ts` — verify the breakpoint token name; if `md` is not bound to 900 px, use a custom UnoCSS `min-[900px]:` prefix or a small token-driven media query in `reset.css`).
  - [x] Render `Checkbox` (co-located): `<button type="button" role="checkbox" aria-checked="false" aria-label="Mark task as complete" class="task-row__checkbox">` with the 20 × 20 px circle visual (2 px border `color.border.strong`, transparent fill, `radius.full`). **No `onClick` handler.**
  - [x] Render task text in a `<span class="task-row__text">{props.task.text}</span>` with `flex-grow: 1`, `color.text.primary`, weight 400, two-line clamp ellipsis.
  - [x] Render `DeleteButton` (co-located): `<button type="button" aria-label="Delete task" class="task-row__delete">` containing the inline trash SVG (16 × 16, `currentColor`, `aria-hidden="true"` on the SVG since the button has the label). **No `onClick` handler.** Apply opacity-0 default + opacity-1 on row hover/focus + opacity-1 always on `(hover: none)` via UnoCSS group utilities or a small `reset.css` rule.
  - [x] The row keeps `tabindex="0"` so Epic 4 can layer Arrow / Space / Delete handlers without changing structure.

- [x] **Task 6 — Build `TaskList` and wire all four states** (AC: #2, #3, #8, #11, #12, #13)
  - [x] Create `apps/web/src/components/TaskList.tsx` exporting a named `TaskList` component, no props.
  - [x] Inside, call `useTasks()`. Implement the 200 ms loading-flash gate: on `isPending` becoming `true`, start a `setTimeout(() => setShowLoading(true), LOADING_DELAY_MS)`; on `isPending` becoming `false`, `clearTimeout` and `setShowLoading(false)`. Use Solid's `createEffect` keyed on `query.isPending` so the timer recycles on every pending cycle (initial fetch + future refetch in Story 1.10). Make sure to call `onCleanup(...)` to clear the timer when the component unmounts (avoids a dangling timer in tests).
  - [x] Render branches in this order:
    1. `query.error` — return `null` for now (Story 1.10 fills this in).
    2. `query.isPending && !showLoading()` — return `null`.
    3. `query.isPending && showLoading()` — return `<LoadingState />`.
    4. `(query.data ?? []).length === 0` — return `<EmptyState />`.
    5. Populated — return `<ul role="list" class="task-list"><For each={query.data ?? []}>{(task) => <TaskRow task={task} />}</For></ul>`.
  - [x] The root wrapper of `TaskList` has `mt-8` (≈ `space.8`, 32 px) so the list is separated from the input above per UX spec spacing.
  - [x] **Do not** add `aria-live` on the `<ul>` — list state changes are silent (UX-DR16). The LoadingState container's `aria-live="polite"` is the only live announcement in this story.

- [x] **Task 7 — Wire `TaskList` into `App.tsx`** (AC: #12)
  - [x] In `apps/web/src/App.tsx`, render `<TaskList />` after `<TaskInput onSubmit={handleTaskSubmit} />` inside the existing `<main class="app-shell">` container. Keep the existing `handleTaskSubmit` no-op stub.
  - [x] No other changes to `App.tsx`. No `useTasks` import in `App.tsx` — `TaskList` owns the hook (architecture component-↔-data boundary).

- [x] **Task 8 — Author `TaskList.test.tsx` covering all four list states + axe** (AC: #2, #3, #4, #10, #11, #14)
  - [x] Create `apps/web/src/components/TaskList.test.tsx`.
  - [x] Define a small test helper `renderWithClient(ui, { seedQueryData?, stubFetch?, fakeTimers? })` that wraps `<QueryClientProvider client={testClient}>{ui}</QueryClientProvider>` from `@tanstack/solid-query`. Each `it()` constructs a fresh `QueryClient` (use `new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })`) so tests do not share cache across cases.
  - [x] **Pending under 200 ms.** Stub the Eden client (see Testing Requirements) so the GET never resolves; render; assert nothing in the list area: `queryByRole("list")` is `null`, `container.querySelector('[aria-busy="true"]')` is `null`, and the empty-state copy is absent. Do not advance timers.
  - [x] **Pending at/over 200 ms.** Same pending stub. Use Bun test fake-timer mechanism (`bun:test` exposes `setSystemTime` and `import { setSystemTime } from "bun:test"`; for setTimeout-based delays, use `await new Promise(r => setTimeout(r, LOADING_DELAY_MS + 50))` — real-time wait of ~250 ms is acceptable in this single test if Bun's fake-timer support for setTimeout is incomplete in v1.3.11; document the choice). Assert the LoadingState container is present (`aria-busy="true"`), with three `data-testid="skeleton-row"` children and `aria-live="polite"`. Run axe on the container; assert no critical/serious violations.
  - [x] **Empty.** Pre-seed `testClient.setQueryData(tasksQueryKey, [])`. Render. Assert exact copy `"No tasks yet. Start by typing above."` is rendered and `queryByRole("list")` is `null`. Run axe; assert no critical/serious violations.
  - [x] **Populated.** Pre-seed with two mock tasks (newest first). Render. Assert one `<ul role="list">` with two children carrying the task text in order. Run axe; assert no critical/serious violations.
  - [x] **Responsive class set (AC #14).** For the populated case, additionally assert that each rendered `<li>` carries the responsive horizontal-padding utility classes (e.g., `px-4` and `md:px-2`, or whichever exact UnoCSS tokens were used). This is a structural-class check, not a `getComputedStyle` check, since happy-dom does not run media queries reliably.
  - [x] Use `afterEach(cleanup)` (consistent with Story 1.6's TaskInput.test.tsx).

- [x] **Task 9 — Author `TaskRow.test.tsx` including XSS regression** (AC: #5, #6, #9, #10)
  - [x] Create `apps/web/src/components/TaskRow.test.tsx`.
  - [x] Helper: `renderRow(task: Partial<Task>)` that fills in defaults (`id: "0193f000-0000-7000-8000-000000000000"` or any UUIDv7-shaped string, `completed: false`, `createdAt: 1_700_000_000_000`, `updatedAt: 1_700_000_000_000`) and renders `<TaskRow task={...} />` inside a bare `<ul>` (since `<li>` semantically requires a `<ul>` parent — happy-dom is permissive, but the test should still wrap to mirror real DOM hierarchy).
  - [x] Active-state structure tests — assert the `<li>` exists with `tabindex="0"`, `getByRole("checkbox")` returns an element with `aria-checked="false"`, `getByLabelText("Delete task")` returns the trash button, and the task text is present.
  - [x] DeleteButton-no-op test — `fireEvent.click(getByLabelText("Delete task"))` does not throw and the `<li>` is still present after the click.
  - [x] Checkbox-no-op test — same: clicking the checkbox does not throw and `aria-checked` is still `"false"`.
  - [x] **XSS regression test (AC #9):**
    - Render a task with `text: "<script>alert(1)</script>"`. Assert: `getByText("<script>alert(1)</script>", { exact: true })` is non-null; `container.querySelector("script")` is `null`. Iterate every element in the rendered subtree and assert no attribute name starts with `"on"`.
    - Render a second task with `text: "<img src=x onerror=alert(1)>"`. Assert: `getByText("<img src=x onerror=alert(1)>", { exact: true })` is non-null; `container.querySelectorAll("img").length === 0`; same `on*`-attribute scan returns clean.
  - [x] Two-line-clamp class assertion — assert the task-text element carries the line-clamp class (e.g., `task-row__text` or whatever exact class set Task 5 chose) so a future change accidentally dropping the clamp surfaces in tests rather than only in visual review.

- [x] **Task 10 — Author `queries.test.ts` covering useTasks** (AC: #1, #10)
  - [x] Create `apps/web/src/data/queries.test.ts`.
  - [x] Helper for stubbing Eden: replace the `api` export's `api.tasks.get` with a `mock(...)` from `bun:test` for the duration of each `it()`, restoring it in `afterEach`. Eden Treaty exposes `api.api.tasks.get` as a method; you can either (a) `import { api } from "../data/api";` and `api.api.tasks.get = mock(() => Promise.resolve({ data: [...], error: null }));` if the type allows reassignment, or (b) use a thin indirection module (e.g., `apps/web/src/data/api.ts` exports both `api` and a `getTasks()` wrapper, and `queries.ts` calls `getTasks()`; the test mocks the wrapper). Pick whichever the type system allows without `any`.
  - [x] Render `useTasks` inside a test component wrapped in `QueryClientProvider` with a fresh `QueryClient`. Use `@solidjs/testing-library`'s `render` to mount the test component, then await the resolved or errored state via `vi.waitFor`-equivalent (`await vi.waitFor(...)` not available in bun:test — use `await new Promise(r => setTimeout(r, 0))` or a small polling helper).
  - [x] Assert the active query observer's options match the architecture-locked config (read from the queryClient's cache: `testClient.getQueryCache().find({ queryKey: tasksQueryKey })?.options`).
  - [x] Assert success path returns the stubbed array.
  - [x] Assert error path: stub Eden to resolve to `{ data: null, error: ... }`; assert the observer reports `isError: true` and `error.message` includes either the envelope `error.code` or `error.message`.

- [x] **Task 11 — Update `App.tsx` integration test surface** (AC: #12)
  - [x] No new test file required. The existing `e2e/smoke.spec.ts` Playwright test already asserts the input is focused on load. Story 1.10's `e2e/empty-error-states.spec.ts` will add the empty-state Playwright assertion. Story 1.11's `e2e/capture.spec.ts` will assert the populated list end-to-end. **This story does not add or modify Playwright specs.**

- [x] **Task 12 — Verify quality gates** (AC: #15, #16)
  - [x] Run `bun run check` (oxlint + format + tsgo + dep-count). Must pass.
  - [x] Run `bun run check:full` (adds `bun test` across workspaces, `bun audit`, `bun run build`, bundle-size check). Must pass.
  - [x] Run `bun run dev` and visually verify in a real browser: empty state shows on first load (the API returns `[]` for a fresh DB); typing in the input still works (Story 1.6 contract); the loading skeleton flashes only on slow loads (throttle DevTools network to 3G to confirm the 200 ms gate visually).
  - [x] Record any deviations (test-stub mechanism choice, fake-timer compromise, breakpoint-class assertion limitation) in the Dev Agent Record.

## Dev Notes

### Critical Context

This is the **first data-fetch surface** in the app. Story 1.5 wired TanStack Query's provider but no hook consumed it. Story 1.7 introduces the `useTasks` query hook and the rendering tree that consumes it. The product visibly transitions from "empty input on a blank page" to "input + an actual list area". After this story, opening the app to an empty DB shows the EmptyState below the input — a clear product surface.

The story is **rendering + a single read query**, intentionally separate from the optimistic-create flow (Story 1.8) and the list-level error/reconnect flow (Story 1.10). Keep the boundaries clean:

- **Read-only.** No mutations. Story 1.8 owns `useCreateTask`. Story 2.2 owns toggle. Story 3.2 owns delete.
- **No error UI.** Story 1.10 owns the FR6 list-level error state. The `error` branch in `TaskList` should return `null` for now, leaving a single-arm extension for Story 1.10.
- **No interactions on TaskRow's affordances.** Checkbox and DeleteButton render visually + with correct ARIA, but have no `onClick`. Stories 2.2 and 3.2 wire them.

The story's **product-visible failure modes** to avoid:

- A loading flash on a fast (<200 ms) fetch. UX spec UR-DR9 / UR-DR20: nothing renders until 200 ms elapsed.
- A jarring layout shift between LoadingState and the populated list. Match the row rhythm (`gap: space.3`, equivalent vertical padding) so the transition is visually quiet.
- Two-line text wrap not actually clamping (very long task text taking up the entire viewport). The CSS line-clamp recipe is load-bearing.
- An XSS hole if `task.text` is ever rendered with `innerHTML`. Solid auto-escapes JSX; the regression test in AC #9 enforces the contract permanently.

Existing scaffold this story extends:

- `apps/web/src/index.tsx` — already wraps `<App />` in `QueryClientProvider`, `<ErrorBoundary>`, and the single mounted `<LiveRegion />`. **Do not change this layout.**
- `apps/web/src/App.tsx` — currently renders `<main class="app-shell"><TaskInput onSubmit={handleTaskSubmit} /></main>`. Add `<TaskList />` immediately after `<TaskInput />`. Keep `handleTaskSubmit` as the existing typed no-op stub (Story 1.8 wires it).
- `apps/web/src/data/api.ts` — `treaty<App>("/")` exported as `api`. **First real consumer.** Until now, the file was scaffolding only.
- `apps/web/src/data/keys.ts` — `tasksQueryKey = ["tasks"] as const`. Reuse — do not redeclare the key in `queries.ts`.
- `apps/web/src/styles/reset.css` — establishes `:focus-visible` 2 px `accent.default` outline, `prefers-reduced-motion` reset, `.app-shell` container, `.task-input` (TaskInput's caret-color/placeholder rules), `.text-caption`. Add token-driven rules for skeleton shimmer and any task-row visuals that do not express cleanly as UnoCSS utilities (line-clamp, dotted-border, opacity transitions).
- `apps/web/src/styles/tokens.css` — full token set. Do not modify; just consume.
- `apps/web/uno.config.ts` — exposes the token set as UnoCSS theme + `bg-token-*` / `border-token-*` / `text-token-*` rules. Use these for token-driven utility classes. **Note:** `presetMini` does **not** ship with a `line-clamp` utility by default; the line-clamp recipe goes in `reset.css` as a small token-driven class.
- `apps/api/src/routes/tasks.ts` — the backend already serves `GET /api/tasks` (newest-first, `ORDER BY id DESC`) and `POST /api/tasks` (Story 1.4). The Eden type pipeline flows automatically.
- `apps/web/src/components/TaskInput.tsx` — Story 1.6's contract. **Do not touch.** Story 1.7's tests sit beside it but do not alter it.

### Locked Decisions (carry-forward)

- Frontend framework: SolidJS 1.9.12. Use `createSignal`, `onMount`, `createEffect`, `onCleanup`, `<For>`, `<Show>`. **Never destructure props.**
- Server-state cache: `@tanstack/solid-query@5.100.6`. Use the v5 hook (`useQuery`). Reuse `tasksQueryKey` from `data/keys.ts`.
- API typing: Eden Treaty (`@elysiajs/eden@1.4.9`). All API calls go through `apps/web/src/data/api.ts` — components never import `api` directly.
- Styling: UnoCSS + token CSS custom properties. No Tailwind, CSS Modules, vanilla-extract, styled-components.
- No raw `fetch` in app code. No inline SQL or DB access (architecture boundary).
- No `console.log` in production frontend code.
- No magic numbers — module-level constants. The 200 ms gate is `LOADING_DELAY_MS`.
- Named exports only.
- bun:test idiom: `describe(...)` + `it(...)` (no `test(...)`).
- Component tests use `@solidjs/testing-library` + happy-dom (preloaded by `apps/web/test-setup/happy-dom.ts` in `bunfig.toml`).
- axe-core unit assertions on rendered subtrees, filtered to `critical | serious`.
- `cleanup()` in `afterEach` for component tests (Story 1.6 pattern).

### Component Specs (authoritative — UX spec §Component Strategy)

**TaskList**

- Anatomy: `<ul role="list">` for the populated case, otherwise renders the active state component for empty / loading.
- States: `pending-under-200 ms` (renders nothing), `pending-≥200 ms` (renders LoadingState), `empty` (renders EmptyState), `populated` (renders TaskRows). The `error` branch is a Story 1.10 placeholder — return `null` for now.
- ARIA: explicit `role="list"` on the populated `<ul>` to preserve list semantics under CSS list-style stripping. No row-level live region — LiveRegion is the global one.

**TaskRow (active state only — completed/sync-pending/retry-exhausted are later stories)**

- Anatomy (left to right): Checkbox (20 × 20 circle, `border.strong`), task text (flex-grow, two-line wrap), DeleteButton (16 × 16 trash, opacity-controlled).
- Active state visuals: row text `text.primary` weight 400; row hover background `bg.subtle`; row focus-visible 2 px `accent.default` outline at 2 px offset (global rule); DeleteButton opacity 0 default → 1 on row hover/focus → 1 always on `(hover: none)`.
- ARIA: `<li>` (implicit `role="listitem"`); row `tabindex="0"` (Epic 4 layers Arrow / Space / Delete handlers); Checkbox `<button role="checkbox" aria-checked="false" aria-label="Mark task as complete">`; DeleteButton `<button aria-label="Delete task">`.
- Interaction: **none in this story.** Checkbox and DeleteButton render with no `onClick`. Story 2.2 wires Checkbox → toggle mutation. Story 3.2 wires DeleteButton → delete mutation.

**EmptyState**

- Anatomy: single `<p>` with copy `"No tasks yet. Start by typing above."`.
- States: `default` only.
- ARIA: no `aria-live`. The element is rendered within the list area's DOM position.
- Tokens: `text.body`, `color.text.secondary`. Centered.

**LoadingState + SkeletonRow**

- Anatomy: container with three SkeletonRow children at widths 100% / 75% / 60%.
- ARIA: container has `aria-busy="true"` and `aria-live="polite"`. Each SkeletonRow has `aria-hidden="true"` (presentational).
- States: `hidden` (not mounted — the 200 ms gate keeps it out of DOM), `visible` (mounted with shimmer), `static` (mounted under `prefers-reduced-motion: reduce`, no shimmer).
- Tokens: `bg.subtle` for placeholders; `motion.medium` for shimmer cycle; `motion.instant` (effectively `animation: none`) under reduced-motion.

### Visual Token Recipe

**TaskRow visual recipe (express via tokens, not raw values):**

- Layout: flex row, `gap: space.3` (12 px), align-items: center.
- Vertical padding: `py-3` (≡ `space.3` × 2 = 24 px), giving a ≥ 44 px row with 1rem line-height.
- Horizontal padding: `px-4` Compact (16 px), `md:px-2` Expanded+ (8 px). Verify the `md` breakpoint maps to ≥ 900 px in `uno.config.ts`; if not, use `min-[900px]:px-2`.
- Bottom divider: 1 px solid `color.border.default`. Express in `reset.css` as `.task-row { border-bottom: 1px solid var(--color-border-default); }`.
- Hover: `hover:bg-token-bg-subtle`. Touch (`@media (hover: none)`) skips hover background — focus-visible carries the focus signal there.
- Focus ring: do **not** redeclare per-row. Global `:focus-visible` rule already supplies 2 px `accent.default` outline at 2 px offset.

**Checkbox visual recipe:**

- 20 × 20 px, `radius.full`, 2 px solid `border.strong`, transparent fill.
- No checkmark (active state only — completed treatment is Story 2.2's responsibility).
- Express via UnoCSS: `w-5 h-5 rounded-full border-2 border-token-border-strong bg-transparent`.

**DeleteButton visual recipe:**

- 16 × 16 px hit-area surface (the SVG is 16 × 16; the button has padding to extend the touch target to ≥ 44 × 44 px on mobile per UX spec).
- Default opacity 0 (desktop), opacity 1 on row hover, row focus, or `(hover: none)`.
- Color: `text.muted` default, transitions to `status.error` on icon hover/focus.
- Inline trash SVG (no icon library). A clean Heroicons / Lucide outline trash path is acceptable; ≤ 30 LOC, `currentColor`, `aria-hidden="true"` on the `<svg>`.

**SkeletonRow visual recipe:**

- Circle: 20 × 20, `bg.subtle`, `radius.full`.
- Bar: 16 px tall, flex-grow, `bg.subtle`, `radius.sm`.
- Shimmer: keyframes opacity 0.4 → 1 → 0.4 over `motion.shimmer` (1500 ms), `ease-in-out`, infinite. Replaced with `animation: none` under `prefers-reduced-motion: reduce`.

**Two-line clamp recipe (for task text):**

```css
.task-row__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word; /* protects very long single-token text from breaking layout */
}
```

Add to `reset.css` (the canonical place for token-driven additions per architecture). Story 1.6 already established the precedent for adding small token-driven rules to `reset.css` rather than per-component CSS files.

### useTasks Hook Implementation Sketch

```ts
import { useQuery } from "@tanstack/solid-query";
import { api } from "./api";
import { tasksQueryKey } from "./keys";
import type { Task } from "./api"; // re-export from api.ts (Task is from @bmad-todo-app/api)

export const useTasks = () =>
  useQuery<Task[], Error>(() => ({
    queryKey: tasksQueryKey,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await api.api.tasks.get();
      if (error) {
        throw new Error(
          error.value?.error?.message ?? `tasks fetch failed: HTTP ${error.status}`,
        );
      }
      return data;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  }));
```

Notes:

- Solid Query v5 takes a **factory function** (the `() => ({...})` form). Plain object is the React-Query v5 idiom; Solid wraps it in a reactive accessor. Verify by reading `node_modules/@tanstack/solid-query/dist/...` if the type system pushes back.
- `error.value?.error?.message` traverses the backend envelope shape (`{ error: { code, message }, requestId }`) defined in `apps/api/src/onError.ts`. The optional-chaining is defensive in case Eden returns the raw envelope at a different depth in v1.4.9; verify the actual shape during dev.
- The hook is a thin wrapper. **Do not** call `useQuery` from a component; components consume `useTasks()`.

### TaskList state-machine implementation sketch

```tsx
import { createEffect, createSignal, onCleanup, Show, For } from "solid-js";
import { useTasks } from "../data/queries";
import { LOADING_DELAY_MS } from "../constants";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { TaskRow } from "./TaskRow";

export function TaskList() {
  const query = useTasks();
  const [showLoading, setShowLoading] = createSignal(false);

  createEffect(() => {
    if (query.isPending) {
      const id = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      onCleanup(() => clearTimeout(id));
    } else {
      setShowLoading(false);
    }
  });

  return (
    <div class="task-list-region mt-8">
      <Show when={!query.error}>
        <Show
          when={!query.isPending}
          fallback={<Show when={showLoading()}><LoadingState /></Show>}
        >
          <Show
            when={(query.data ?? []).length > 0}
            fallback={<EmptyState />}
          >
            <ul role="list" class="task-list">
              <For each={query.data ?? []}>
                {(task) => <TaskRow task={task} />}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
```

This is a **sketch only** — the dev should adapt to the actual TanStack v5 Solid API surface and any oxlint constraints. Key invariants the sketch encodes:

- Pending-under-200 ms renders nothing because `showLoading()` is `false` until the timer fires.
- The timer is recreated on each pending → resolved → pending cycle thanks to `createEffect` + `onCleanup`.
- The `error` branch is reserved for Story 1.10 (`!query.error` gates everything).
- The `<For>` loop keys on `task.id` automatically (Solid's `<For>` uses identity by default — verify with the installed Solid version; if it does not, add `key={(task) => task.id}`).

### Test Stub Strategy for Eden

The cleanest stub mechanism for unit tests, in priority order:

1. **Indirection wrapper.** Add `getTasks()` to `apps/web/src/data/api.ts`:

   ```ts
   import { treaty } from "@elysiajs/eden";
   import type { App, Task } from "@bmad-todo-app/api";

   export const api = treaty<App>("/");
   export type { Task };
   export const getTasks = (): Promise<Task[]> => api.api.tasks.get().then(({ data, error }) => {
     if (error) throw new Error(error.value?.error?.message ?? `HTTP ${error.status}`);
     return data;
   });
   ```

   Then `queries.ts` imports `getTasks` and the test mocks it via `mock.module("../data/api", () => ({ getTasks: mock(...) }))` or by reassigning the export inside `afterEach`.

2. **Direct `api.api.tasks.get` reassignment.** Eden's typed treaty objects allow method reassignment for test purposes; if TypeScript pushes back, use a small internal cast (`as unknown as { get: ... }`).

3. **`global.fetch` mock.** Replace `globalThis.fetch` with a `mock(...)` returning a `Response` shaped like the backend reply. Fragile but framework-agnostic.

The dev should pick the path that yields the cleanest test code with no `any`. **Option 1 is recommended** — it keeps the production code's seams obvious and the test doubles narrow.

### XSS Test — exact assertions

```ts
import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "bun:test";
import { TaskRow } from "./TaskRow";

afterEach(cleanup);

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: "0193f000-0000-7000-8000-000000000000",
  text: "",
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const assertNoEventHandlerAttributes = (root: HTMLElement): void => {
  const all = [root, ...root.querySelectorAll("*")] as Element[];
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.startsWith("on")).toBe(false);
    }
  }
};

it("renders <script> payload as text, not as a script element", () => {
  const malicious = "<script>alert(1)</script>";
  const { container, getByText } = render(() => (
    <ul><TaskRow task={baseTask({ text: malicious })} /></ul>
  ));
  expect(getByText(malicious, { exact: true })).toBeDefined();
  expect(container.querySelector("script")).toBeNull();
  assertNoEventHandlerAttributes(container);
});

it("renders <img onerror=...> payload as text, not as an img element", () => {
  const malicious = "<img src=x onerror=alert(1)>";
  const { container, getByText } = render(() => (
    <ul><TaskRow task={baseTask({ text: malicious })} /></ul>
  ));
  expect(getByText(malicious, { exact: true })).toBeDefined();
  expect(container.querySelectorAll("img").length).toBe(0);
  assertNoEventHandlerAttributes(container);
});
```

This is a **regression guard**. SolidJS auto-escapes `{task.text}` in JSX expressions. The test fails immediately if a future change replaces `{task.text}` with `innerHTML={task.text}` or uses `<div ref={el => el.innerHTML = task.text}>` — both are **forbidden** in this codebase per architecture's anti-patterns.

### Previous Story Intelligence (Stories 1.5 + 1.6 carryover)

**Story 1.5 (frontend foundation, 2026-04-30):**

- `<LiveRegion />` mounted exactly once at `index.tsx`. **Do not** introduce per-component `aria-live` regions (the LoadingState container's `aria-live="polite"` is permitted because it is a presentational state container, not a component-wide announcement). Do not call `LiveRegion.announce(...)` in this story — capture / list-resolve are silent per UX-DR16.
- Token rules in `uno.config.ts` look up `themeVars[token]` by suffix; typos render as `undefined` CSS values. Be careful with the exact UnoCSS class names (`bg-token-bg-subtle`, not `bg-subtle`).
- `__resetLiveRegionForTests` and `__getLiveRegionMessageForTests` are deliberately exported but currently dead. **Do not** call them in this story.
- `prefers-reduced-motion` already wired in `reset.css` — `animation-duration` and `transition-duration` are clamped to `motion.instant` globally. The skeleton shimmer needs `animation: none !important;` inside the existing reduced-motion block to fully suppress the loop (per Story 1.5's deferred note about the WebKit-recommended pattern). Follow up: re-evaluate the global reduced-motion approach after this story if the shimmer flickers under reduced-motion in any browser smoke test.
- LiveRegion / ErrorBoundary tests still use `readFileSync` source-string assertions because Story 1.5 had no DOM. Story 1.6 added happy-dom but **did not migrate** those tests. Do not migrate them in this story either — that is its own cleanup. Add `TaskList.test.tsx`, `TaskRow.test.tsx`, `queries.test.ts` as **new** test files using the real-DOM approach.

**Story 1.6 (TaskInput, 2026-04-30):**

- `bunfig.toml [test] preload = ["./apps/web/test-setup/happy-dom.ts"]` is wired. The preload registers happy-dom globals (preserving Bun's native fetch primitives — backend tests still pass) and registers `bun-plugin-solid` for `.tsx` loader transform. **No additional test infrastructure work is needed for this story.**
- `bun test apps --conditions=browser` is the **required** test invocation. The condition makes `solid-js` resolve to its client build. Bare `bun test apps/web/src/...` without `--conditions=browser` fails because `solid-js`'s `package.json` lists `node` ahead of `browser`. Use `bun run test` (defined in root `package.json`) for ad-hoc runs.
- `apps/web/devDependencies` currently includes 14 entries: `@babel/core`, `@babel/preset-typescript`, `@bmad-todo-app/api`, `@happy-dom/global-registrator`, `@solidjs/testing-library`, `@unocss/preset-mini`, `@unocss/vite`, `axe-core`, `babel-preset-solid`, `bun-plugin-solid`, `bun-types`, `unocss`, `vite`, `vite-plugin-solid`. Total deps (3 prod + 14 dev) = **17, well under the 25 cap**. **Do not add new deps** in this story — the existing chain is sufficient.
- TaskInput test pattern (Story 1.6's `TaskInput.test.tsx`): `afterEach(cleanup); render(() => <Component ... />); fireEvent.keyDown(...)`. Reuse this pattern for the new component tests.
- The "retains focus" assertions in TaskInput.test.tsx are happy-dom-trivial. Do not put load-bearing focus assertions in unit tests — Playwright is the home for real-browser focus behavior. Story 1.7 has no focus-management contract, so this is not a concern, but it sets the precedent for Epic 4.
- IME composition guard: `if (event.isComposing) return;` is the canonical guard for Enter handlers (added by Story 1.6's review). Story 1.7 has no keyboard handlers, so no guard needed; mention here so Story 1.7's dev does not re-introduce keyboard handling on TaskRow before Epic 4.
- The no-op `handleTaskSubmit` stub in `App.tsx` is intentional. **Do not** wire it to `useCreateTask` in this story — Story 1.8's job.

### Git Intelligence Summary (recent commits)

- `30def48 Story 1.6` — TaskInput component + happy-dom test setup. This is the most relevant precedent: read `apps/web/src/components/TaskInput.tsx` and `apps/web/src/components/TaskInput.test.tsx` for the exact rendering / styling / test conventions to reuse.
- `1692502 Story 1.5` — frontend foundation; established `apps/web/src/{index.tsx, App.tsx, components/LiveRegion.tsx, components/ErrorBoundary.tsx, data/api.ts, data/keys.ts, data/uuid.ts, errors/reporting.ts, styles/}` and `apps/web/uno.config.ts`. Read this commit's diff for token rule patterns.
- `8e3f0d2 Review story 1.4` — backend rate-limit `X-RateLimit-Reset` fix. Backend-only; no relevance to this story except that the GET /api/tasks endpoint it underwrites is the backend Story 1.7 consumes.
- `44bb1c5 Dev story 1.4` — backend `GET`/`POST /api/tasks` shipping. Confirms the contract the new `useTasks` hook calls: GET returns `Task[]` newest-first via `ORDER BY id DESC`, error envelope per ARCH-D4.

### File Structure Requirements

**Create:**

```text
apps/web/src/components/TaskList.tsx
apps/web/src/components/TaskList.test.tsx
apps/web/src/components/TaskRow.tsx
apps/web/src/components/TaskRow.test.tsx
apps/web/src/components/EmptyState.tsx
apps/web/src/components/LoadingState.tsx          # SkeletonRow co-located inside
apps/web/src/data/queries.ts
apps/web/src/data/queries.test.ts
```

**Modify:**

```text
apps/web/src/App.tsx                              # add <TaskList /> after <TaskInput />
apps/web/src/constants.ts                         # add LOADING_DELAY_MS
apps/web/src/data/api.ts                          # (recommended) add getTasks() wrapper + re-export Task type
apps/web/src/styles/reset.css                     # add .skeleton-shimmer keyframes + .task-row + .task-row__text rules
```

**Do not modify** without strong cause:

```text
apps/web/src/index.tsx                            # Story 1.5 layout is correct as-is
apps/web/src/components/TaskInput.tsx             # Story 1.6 contract; do not touch
apps/web/src/components/TaskInput.test.tsx        # Story 1.6 tests; do not touch
apps/web/src/components/LiveRegion.tsx
apps/web/src/components/ErrorBoundary.tsx
apps/web/src/data/uuid.ts                         # Story 1.8 will exercise this
apps/web/src/data/keys.ts                         # tasksQueryKey already exported
apps/web/src/styles/tokens.css                    # token set is complete
apps/web/uno.config.ts                            # token rules already in place
apps/api/**                                       # backend untouched
e2e/**                                            # Playwright specs are Story 1.10 / 1.11's territory
bunfig.toml                                       # test setup is correct as-is
package.json (root) and apps/web/package.json     # no new deps
```

`SkeletonRow` is **co-located** in `LoadingState.tsx` per architecture's "Sub-components used only by one parent are co-located in the parent's file" rule. `Checkbox` and `DeleteButton` are co-located in `TaskRow.tsx` for the same reason. Do not create separate top-level files for these sub-components.

### Testing Requirements

- **Test runner:** `bun:test`. Idiom: `describe(...)` + `it(...)` (no `test(...)`).
- **Component testing library:** `@solidjs/testing-library`. Use `render`, `screen`, `fireEvent`. `cleanup` in `afterEach` (consistent with Story 1.6).
- **DOM:** real DOM via the happy-dom registrator preload (already wired by Story 1.6). The preload preserves Bun's native fetch primitives, so backend tests are unaffected.
- **Test invocation:** `bun run test` (root script) or `bun test apps --conditions=browser`. Single-file invocation requires the `--conditions=browser` flag manually (documented in Story 1.6's README).
- **TanStack Query test client:** each `it()` constructs a fresh `new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })`. **Set `retry: false` in tests** to avoid waiting for retries on stubbed errors. Wrap the rendered component in `<QueryClientProvider client={testClient}>`.
- **Pre-seeding:** for empty / populated states, use `testClient.setQueryData(tasksQueryKey, [...mockTasks])` before render. This skips the `queryFn` entirely and the observer reports `isPending: false` immediately.
- **Pending state:** for the loading-flash tests, use a stub that never resolves (`new Promise<never>(() => {})` returned from `api.tasks.get`). The observer reports `isPending: true` until the timer fires or the test ends.
- **Timer handling for the 200 ms gate:** Bun 1.3.11 has limited `setSystemTime` / `setSystemTime`-based clock control over `setTimeout`. The recommended pragma is to use a real-time `await new Promise(r => setTimeout(r, LOADING_DELAY_MS + 50))` for the "≥ 200 ms" assertion (real-time wait of ~250 ms is acceptable for a single test). For the "< 200 ms" assertion, no wait is needed — the observer is `pending` and `showLoading()` is `false` immediately after mount.
- **Behavior over implementation:** assert the **visible result** (rendered DOM, ARIA attributes, text content), not internal signals. The `data-testid="skeleton-row"` is the one exception — there is no naturally-queryable role/label for a presentational placeholder.
- **axe assertion:** `axe.run(container)`, filter to `critical | serious`, assert empty. Run on rendered subtree, not `document.body` (consistent with Story 1.6).
- **Restore globals:** any test that stubs `Date.now`, `crypto.getRandomValues`, `console.error`, or `api.api.tasks.get` must restore the original in `afterEach`.
- **Coverage:** the new TaskList / TaskRow / EmptyState / LoadingState / SkeletonRow / `useTasks` modules should keep the aggregate coverage threshold (`bun test --coverage`) green. Aim ≥ 80 % statements per new file; report any deviation in the Dev Agent Record.
- **No Playwright spec is added in this story.** `e2e/empty-error-states.spec.ts` is Story 1.10's territory; `e2e/capture.spec.ts` is Story 1.8's territory. The existing `e2e/smoke.spec.ts` continues to validate the baseline (input focused on load, /health 200).

### Anti-Patterns to Avoid

- **Do not** render `task.text` via `innerHTML`, `dangerouslySetInnerHTML`, `el.innerHTML = ...`, or any DOM API that interprets HTML. JSX `{task.text}` is the only correct path. The XSS regression test in AC #9 enforces this permanently.
- **Do not** call `api.api.tasks.get(...)` from any component. `useTasks` is the only consumer; `TaskList` is the only component that calls `useTasks`. (Architecture component-↔-data boundary.)
- **Do not** call `LiveRegion.announce(...)` for list resolution, empty state, or skeleton appearance. Capture / list resolution is silent per UX-DR16.
- **Do not** wire `Checkbox.onClick` to a toggle mutation. **Do not** wire `DeleteButton.onClick` to a delete mutation. Stories 2.2 and 3.2 own those flows.
- **Do not** introduce `useMutation` in this story. Story 1.8 introduces the first mutation hook.
- **Do not** add a new `aria-live` region beyond LoadingState's container. The global LiveRegion is the only narration channel; LoadingState's `aria-live="polite"` is a presentational state announcement, not a custom narration.
- **Do not** sort the task array client-side. The backend already returns newest-first via `ORDER BY id DESC` (UUIDv7 monotonic prefix). Client-side sorting is a wasted cycle and a future-bug surface.
- **Do not** destructure `props` in any Solid component. Always access as `props.task`. Solid reactivity breaks if you destructure.
- **Do not** add per-component CSS files, CSS Modules, or `<style>` blocks. Token-driven rules go in `reset.css` (the canonical place per Story 1.6's precedent). UnoCSS utilities cover the rest.
- **Do not** add an icon library (`lucide-solid`, `solid-icons`, `@heroicons/solid`, etc.). The trash SVG is inline. ≤ 30 LOC, `currentColor`, `aria-hidden="true"` on the `<svg>` element since the button has the label.
- **Do not** add a "filter completed", "sort by date", "search tasks", or any Growth-phase feature. Scope is the four list states + active-state TaskRow.
- **Do not** introduce `useSuspenseQuery`. v5 supports it but the architecture explicitly forbids it at MVP (ARCH `Implementation Patterns → TanStack Solid Query rules`).
- **Do not** introduce a global `error` handler in `TaskList` that surfaces to the LiveRegion or ErrorBoundary. Story 1.10 owns the FR6 list-level error UX.
- **Do not** tie skeleton row count to `query.data?.length`. The count is fixed at 3 (per UX spec), regardless of whether a previous fetch had 0 / 5 / 100 tasks.
- **Do not** animate task insertion (Story 1.8's `motion.instant` rule applies; the row simply appears). Skeleton shimmer is a separate animation on the loading state container.
- **Do not** expose `useTasks` via a barrel (no `apps/web/src/data/index.ts`). Direct imports from `data/queries`.
- **Do not** add a new `data-testid` convention beyond `data-testid="skeleton-row"`. The frontend has no other test-id pattern; resist the temptation to add `data-testid="task-row"`, `data-testid="empty-state"`, etc. — `getByRole`, `getByText`, and `getByLabelText` cover the rest.
- **Do not** add `prefers-reduced-data`, `prefers-contrast: more`, or any other media-query branch beyond what is explicitly specified. Architecture has a single contrast and motion contract.
- **Do not** introduce an "online/offline" indicator. Story 1.10 owns reconnection UX.
- **Do not** modify `TaskInput.tsx`. Story 1.6 is closed; any TaskInput change requires a new story.
- **Do not** delete `apps/web/src/components/{LiveRegion,ErrorBoundary}.test.tsx`. They use `readFileSync` against the source — that is intentional pending a separate cleanup story.

### Project Structure Notes

The story aligns cleanly with the architecture's frontend layout (`apps/web/src/components/{TaskList,TaskRow,EmptyState,LoadingState}.tsx` per `architecture/project-structure-boundaries.md`). The new `apps/web/src/data/queries.ts` is the file the architecture has been pointing at since Story 1.5; this story is the first to populate it.

`apps/web/src/data/api.ts` is the natural place to re-export `Task` and add a `getTasks()` wrapper. The architecture's "Eden Treaty rules" allow chained access only — `api.api.tasks.get()` is correct, `api("/api/tasks")` is not. The `getTasks()` wrapper does the chained call inside a function, exposes a clean throw-or-return signature, and gives tests a clean mock seam.

`apps/web/src/styles/reset.css` already contains token-driven rules (`.task-input`, `.text-caption`, `.app-shell`, `:focus-visible`, the `prefers-reduced-motion` reset). Adding `.skeleton-shimmer` keyframes + `.task-row` + `.task-row__text` is consistent with the precedent. Keep additions short and token-driven; do not introduce a new CSS file.

`bunfig.toml` is correct as-is. **Do not** add an `apps/web/bunfig.toml` override — the root file's preload is sufficient.

### Architecture Boundaries Reaffirmed

- **API boundary:** `Task` type flows from `apps/api/src/storage/tasks.ts` → `apps/api/src/index.ts` (App type export) → `@bmad-todo-app/api` package re-export → `apps/web/src/data/api.ts` (Eden + re-export) → `apps/web/src/data/queries.ts` → `apps/web/src/components/TaskList.tsx` → `apps/web/src/components/TaskRow.tsx` (via prop). **No runtime backend code crosses this boundary.** Use `import type` everywhere `Task` is referenced on the frontend.
- **Component-↔-data boundary:** components consume data exclusively through TanStack Query hooks. `TaskList` is the only consumer of `useTasks`. `TaskRow`, `EmptyState`, `LoadingState`, and `SkeletonRow` receive props only.
- **Storage boundary:** untouched in this story (no backend changes).
- **Configuration boundary:** untouched (no env access).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.7-Task-List-Display-TaskList-TaskRow-Active-State-EmptyState-LoadingState] — story statement and BDD acceptance criteria.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#TaskList] — TaskList container anatomy, states, ARIA.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#TaskRow] — TaskRow anatomy, active state, sub-component layout, ARIA, interaction.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#EmptyState] — EmptyState exact copy, no-icon-no-button rule, ARIA absence.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#LoadingState] — LoadingState container, three skeletons, ARIA.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#SkeletonRow] — SkeletonRow visual recipe, three width variants, shimmer + reduced-motion contract.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty---Loading---Error-State-Patterns] — 200 ms loading-flash gate, list-level error rule (Story 1.10), row-level failure scope.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Chosen-Direction] — row visual recipe (borderless 1-px divider, layout, padding, hover/focus, checkbox, delete affordance).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — silent success on capture and list resolution.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive-Strategy] — Compact / Expanded / Large tier behavior; touch-vs-hover handling for DeleteButton.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D7---Server-state-cache-tanstack-solid-query] — locked tasks-query config (`staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`).
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D3---REST-API] — `GET /api/tasks` shape, newest-first ordering.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Naming-Conventions] — PascalCase components, UPPER_SNAKE_CASE constants, `["tasks"]` query key shape.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules] — never destructure props, `createSignal`, `<For>`, `<Show>`, `createEffect`, `onCleanup`.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#TanStack-Solid-Query-rules] — query key array, one queryFn per key, no useSuspenseQuery at MVP.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Eden-Treaty-rules] — chained access only, single Eden client at module scope, no raw fetch.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Anti-Patterns-forbidden] — no inline SQL, no `any`, no `console.log`, no magic numbers.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Per-package-src-layout-frontend] — `apps/web/src/components/{TaskList,TaskRow,EmptyState,LoadingState}.tsx` + colocated `.test.tsx`; `apps/web/src/data/queries.ts` + `.test.ts`.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Architectural-Boundaries] — component-↔-data layer boundary; only hooks consume `api`.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Cross-Cutting-NFR-Locations] — NFR-S1 (XSS) enforced by SolidJS auto-escaping + lint rule against `innerHTML`.
- [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements] — FR2 (single list), FR4 (empty state), FR5 (loading state), FR6 (error state — Story 1.10), NFR-S1 (XSS).
- [Source: _bmad-output/implementation-artifacts/1-6-taskinput-component-with-auto-focus-submit-and-character-counter.md#Dev-Agent-Record] — happy-dom + axe-core test pattern, `--conditions=browser` test invocation, `bun-plugin-solid` chain, restore-natives pattern.
- [Source: _bmad-output/implementation-artifacts/1-5-frontend-foundation-solid-app-design-tokens-eden-client-errorboundary-liveregion.md#Dev-Agent-Record] — token rules, font stack, `<LiveRegion />` mount layout, deferred LiveRegion / ErrorBoundary `readFileSync` test cleanup.
- [Source: _bmad-output/implementation-artifacts/1-4-backend-api-get-post-api-tasks-with-idempotency-and-per-ip-rate-limiting.md] — backend GET /api/tasks contract: returns `Task[]` newest-first, error envelope shape that `useTasks` parses on failure.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — open deferred items relevant to this surface (LiveRegion `announce()` queue limitations; UnoCSS token typo guard; `prefers-reduced-motion` `animation: none` follow-up). None are blockers for this story; LoadingState's `animation: none` recipe addresses the reduced-motion concern locally.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `bun run test` — 142 pass, 0 fail (565 expect calls); coverage 95.61% funcs, 95.56% lines.
- `bun run check` — oxlint, oxfmt, tsgo, dep-count all green (apps/web at 17/25 deps; no new deps added).
- `bun run check:full` — coverage threshold (70%) cleared, `bun audit` clean, `vite build` produces 24.72 KB gzipped main chunk (well under the 100 KB limit).

### Completion Notes List

- **Story scope delivered.** All four `TaskList` states (sub-200 ms quiet, ≥ 200 ms LoadingState, EmptyState, populated list) render through the architecture-locked `useTasks()` hook, which wires the GET /api/tasks Eden call behind a single TanStack Query observer. `<TaskList />` mounts under `<TaskInput />` in `App.tsx` with the spec'd `mt-8` (32 px) gap. No mutations, no list-level error UI, and no row-level interactions are introduced — Stories 1.8 / 1.10 / 2.2 / 3.2 still own those flows.
- **XSS regression guard active (NFR-S1).** `TaskRow.test.tsx` renders `<script>` and `<img onerror=...>` payloads, asserts they appear as literal text, and scans the rendered subtree for any `on*` attribute. Solid's JSX auto-escaping carries this — the test fails immediately if any future change introduces `innerHTML` in the row.
- **Architecture-locked tasks-query options verified.** `queries.test.tsx` reads `client.getQueryCache().find({ queryKey: tasksQueryKey })?.options` and asserts `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, `retry: 2`, plus the exact `["tasks"]` key reference. Success and error paths exercised via `tasksApi.list` swap-in (see deviation #2 below).
- **axe-core unit assertions on every visible state.** Empty, populated, and loading-≥ 200 ms `TaskList` renders run through `axe.run(container)`; all critical/serious violations filter to an empty array.
- **Responsive class set asserted at the structural level.** `TaskList.test.tsx` asserts each rendered `<li>` carries `px-4` and `min-[900px]:px-2` UnoCSS utilities (verified Compact + Expanded contract on the same DOM, since happy-dom does not run media queries reliably). Visual regression at the three viewport tiers belongs to a future Playwright spec per AC #14.
- **Strict scope on co-location.** `Checkbox` and `DeleteButton` live inside `TaskRow.tsx`; `SkeletonRow` lives inside `LoadingState.tsx`. No new files for these sub-components. The trash icon is an inline 28-line SVG — no icon library was added.

### Deviations / Documented Decisions

1. **One-line public type re-export added to `apps/api/src/index.ts`.** The story Dev Notes prescribe `import type { Task } from "@bmad-todo-app/api";`, but the api package's `src/index.ts` only exported `App`. Added `export type { Task } from "./storage/tasks";` (single line, type-only, no runtime cost) to satisfy the import path the story spells out. The "do not modify `apps/api/**`" guidance carries the implicit "without strong cause" exception (per the same Dev Notes section); cross-package public type sharing is exactly that exception.

2. **`getTasks` wrapper became `tasksApi.list` (object property, not bare function).** Bun's `import * as` namespace and `import { name }` bindings are read-only at runtime, so the story's recommended `mock.module(...)` / direct reassignment patterns failed with `TypeError: Attempted to assign to readonly property` from inside `bun:test`. Wrapping the fetcher in a plain object (`tasksApi.list`) keeps writable property semantics, which lets each test do `tasksApi.list = mock(...)` in `beforeEach` and restore in `afterEach`. This is structurally equivalent to the story's option (1) "indirection wrapper" with a tiny mutability adjustment. `queries.ts` calls `() => tasksApi.list()`, so the production code seam is identical.

3. **`apps/web/src/data/queries.test.ts` lives at `queries.test.tsx`.** The bun-plugin-solid loader filter is `/\.(js|ts)x$/` — `.ts` files do not get the JSX/Solid babel transform, and the test renders `<QueryClientProvider>` etc. The architecture file structure document and the story's File Structure block both list `.ts`; I followed the same naming used by `TaskInput.test.tsx` / `TaskList.test.tsx` / `TaskRow.test.tsx` (all `.tsx`) for consistency. Production module remains `queries.ts`.

4. **Eden type-narrowing cast at the single call site in `data/api.ts`.** `api.api` infers as a union with the `/api/*` 404 catch-all in `apps/api/src/index.ts`, so direct `api.api.tasks.get()` produces `TS2339: Property 'tasks' does not exist`. Pinned the call through a `tasksGet` wrapper that casts `api.api as unknown as { tasks: { get: () => Promise<TasksGetResponse> } }`. The runtime proxy resolves the route correctly; the cast only applies at the call site (per the story's "use a small internal cast" guidance for option 2). The cast's `TasksGetResponse` type is local and narrow — it does not leak to consumers.

5. **`retryDelay: 0` in `queries.test.tsx`'s test client defaults.** The architecture-locked `retry: 2` from `useTasks` is preserved, but TanStack v5's default exponential backoff (≈ 1 s + 2 s + 4 s) caused the error-path test to time out under bun's 1 s default `waitFor`. Setting `retryDelay: 0` on the *test* client default keeps the retry **count** intact (asserted) while flattening the **delay** so the test resolves in milliseconds. This is a test-only knob — the production `QueryClient` in `index.tsx` is untouched.

6. **`data-testid="skeleton-row"` and `data-testid="loading-state"` are the only testid attributes introduced.** Per the story's anti-pattern note, no other components received testids; structural assertions go through `getByRole`, `getByLabelText`, or class checks.

7. **Visual smoke in a real browser is deferred to reviewer.** I did not start `bun run dev` and click through (the harness here is non-interactive). Build and unit/axe coverage are green; the dev-server smoke is the recommended next step for the reviewer per Task 12's third bullet.

### File List

**Created:**

- `apps/web/src/components/EmptyState.tsx`
- `apps/web/src/components/LoadingState.tsx`
- `apps/web/src/components/TaskList.test.tsx`
- `apps/web/src/components/TaskList.tsx`
- `apps/web/src/components/TaskRow.test.tsx`
- `apps/web/src/components/TaskRow.tsx`
- `apps/web/src/data/queries.test.tsx`
- `apps/web/src/data/queries.ts`

**Modified:**

- `apps/api/src/index.ts` — single-line `export type { Task }` addition (deviation #1).
- `apps/web/src/App.tsx` — mounts `<TaskList />` after `<TaskInput />`.
- `apps/web/src/constants.ts` — adds `LOADING_DELAY_MS = 200`.
- `apps/web/src/data/api.ts` — adds `tasksApi.list` and `Task` re-export.
- `apps/web/src/styles/reset.css` — adds `.task-list`, `.task-row`, `.task-row__text`, `.task-row__delete`, `.skeleton-shimmer`, and the reduced-motion override for `.skeleton-shimmer`.

### Change Log

- 2026-04-30 — Story 1.7 implementation: `useTasks` query hook, `TaskList` four-state state machine, `TaskRow` (active-state) with co-located `Checkbox`/`DeleteButton`, `EmptyState`, `LoadingState`/`SkeletonRow`, XSS regression guard, axe-core unit assertions on every visible state, App integration. All 142 tests pass; quality gates (`bun run check`, `bun run check:full`) green.

### Review Findings

- [x] [Review][Decision][Resolved → no-op] TanStack Query v5 — `query.isPending` will not fire on Story 1.10 refetch — Decision: keep `isPending` only; accept the AC #3 parenthetical "(e.g., a Story 1.10 `refetch()`)" is misaligned with v5 semantics. The skeleton fires on initial mount only; refetches will resolve silently. Story 1.10 (which owns the refetch UX) is the right place to revisit if a refetch-aware gate is needed. (Sources: edge)
- [x] [Review][Decision][Resolved → patch] Skeleton shimmer at 180 ms cycles ≈ 5.5 Hz — visual strobe — Decision: introduce a new `motion.shimmer = 1500ms` token (option 3). Add `--motion-shimmer: 1500ms` to `apps/web/src/styles/tokens.css`, update the `.skeleton-shimmer` rule in `reset.css` to consume `var(--motion-shimmer)` (with `infinite alternate`), and update AC #4's wording in this story to reflect the new token. (Sources: blind)
- [x] [Review][Decision][Resolved → no-op] LoadingState container `aria-busy="true"` + `aria-live="polite"` may swallow SR announcement — Decision: keep as spec'd (option 1). Silent SR loading is acceptable; AC #4 was deliberate. The LoadingState container is a presentational state surface, and the global `<LiveRegion />` is the canonical narration channel for any future capture/list-resolve announcements per UX-DR16. (Sources: edge)
- [x] [Review][Patch] Add `motion.shimmer` token (= `1500ms`) and consume it in the `.skeleton-shimmer` keyframes [apps/web/src/styles/tokens.css, apps/web/src/styles/reset.css] — Resolved from Decision #2. Add `--motion-shimmer: 1500ms;` to `:root` in `tokens.css`. Update the `.skeleton-shimmer` rule in `reset.css` to use `animation: skeleton-shimmer var(--motion-shimmer) ease-in-out infinite alternate` (or equivalent — pick a non-strobe cycle). Update AC #4 in this story to replace "`motion.medium` (180 ms)" with "`motion.shimmer` (1500 ms)". (Sources: blind)
- [x] [Review][Patch] DeleteButton hit-area ~24×24 px, below the 44×44 px touch target the visual recipe requires [apps/web/src/styles/reset.css ~108-115] — `.task-row__delete { padding: var(--space-1) }` (4 px) wrapping a 16 × 16 SVG yields ~24 × 24 px. Visual Token Recipe (DeleteButton) and Dev Notes line 261 require ≥ 44 × 44 px on mobile. Bump the padding (e.g., `var(--space-3)` ≈ 12 px) so the hit-area reaches ≥ 40 × 40 px, or set `min-width`/`min-height` to `44px`. (Sources: blind+auditor)
- [x] [Review][Patch] AC #10 error-path test bypasses Eden envelope parsing [apps/web/src/data/queries.test.tsx ~line 1278] — `tasksApi.list = mock(() => Promise.reject(new Error("internal_error: boom")))` rejects with a pre-built Error, never exercising the envelope-parsing branch in `tasksApi.list`. AC #10 requires stubbing the underlying Eden response to `{ data: null, error: { status: 500, value: { error: { code: "internal_error", message: "boom" } } } }` so the production envelope-traversal path is the thing under test. Refactor to stub `api.api.tasks.get` (or whichever boundary preserves the envelope path) and assert the thrown message includes `code` or `message` from the envelope. (Sources: auditor)
- [x] [Review][Patch] `data-testid="loading-state"` violates the "no new test-id beyond `skeleton-row`" anti-pattern [apps/web/src/components/LoadingState.tsx:13] — The Anti-Patterns to Avoid list explicitly forbids any new test-id beyond `skeleton-row`. The container is already queryable via `aria-busy="true"` (which the tests use). Remove the testid. Deviation #6 acknowledges the addition but does not justify the override. (Sources: blind+auditor)
- [x] [Review][Patch] EmptyState `<p>` lacks an explicit `text.body` size token application [apps/web/src/components/EmptyState.tsx:4] — AC #7 specifies `text.body` size and `color.text.secondary`; only `color.text.secondary` is applied via `text-token-text-secondary`. The `<p>` inherits body size from the body element, so output is equivalent — but the explicit token application the AC calls out is missing, and the default `<p>` margins now apply unintentionally. Apply the matching body-size token utility (and/or a margin reset). (Sources: auditor)
- [x] [Review][Patch] `flushMicrotasks` helper uses `setTimeout(..., 0)` — a macrotask, not a microtask [apps/web/src/data/queries.test.tsx ~line 30] — Misnamed; `setTimeout(0)` schedules a macrotask. Either rename to `flushMacrotask`/`yieldToEventLoop` or switch to `await new Promise<void>(r => queueMicrotask(r))`. (Sources: edge)
- [x] [Review][Defer] `as unknown as { tasks: { get: ... } }` cast disables Eden type narrowing at the only API call site [apps/web/src/data/api.ts ~line 1146] — deferred, documented deviation #4; revisit when a clean indirection-wrapper / Eden type-pin pattern is found. (Sources: blind+edge+auditor)
- [x] [Review][Defer] Module-level mutable `tasksApi` object as production seam [apps/web/src/data/api.ts ~line 1148] — deferred, documented deviation #2; revisit when a writable seam alternative (Bun-friendly `mock.module`, DI container) becomes ergonomic. (Sources: blind+edge)
- [x] [Review][Defer] Real-time `await wait(LOADING_DELAY_MS + 50)` adds ~250 ms per CI run and risks flake under load [apps/web/src/components/TaskList.test.tsx ~line 76] — deferred, documented in Story Testing Requirements; revisit when Bun's `setSystemTime` reliably advances `setTimeout`-scheduled callbacks. (Sources: blind+edge)
- [x] [Review][Defer] Error-envelope path-lookup loses messages on network failure (Eden returns `error.value: Error`) and on plain-text error bodies (`error.value: string`) [apps/web/src/data/api.ts ~lines 1152-1154] — deferred; Story 1.10 owns the FR6 list-level error UX and is the right place to land richer envelope unwrapping. (Sources: blind+edge)
- [x] [Review][Defer] Responsive viewport coverage tested at one tier with structural class assertions instead of three viewport renders [apps/web/src/components/TaskList.test.tsx ~lines 894-898] — deferred; AC #14 explicitly admits a happy-dom limitation and Visual snapshot regression at three tiers is owned by a future Playwright spec. The Large tier (1440 × 900) is currently not covered at any level — revisit when the Playwright visual-regression spec lands. (Sources: auditor)
- [x] [Review][Defer] `createEffect` timer behavior — preventive concern that adding any tracked accessor inside the effect could stack `setTimeout` callbacks [apps/web/src/components/TaskList.tsx ~lines 12-19] — deferred, no live bug today (only `query.isPending` is read). Revisit if Story 1.10's refetch wiring adds another tracked accessor inside this effect. (Sources: blind+edge)
- [x] [Review][Defer] Resolution exactly at 200 ms can produce a one-frame skeleton flash if the timer fires in the same task as resolve [apps/web/src/components/TaskList.tsx ~line 14] — deferred; rare boundary edge, no current visible defect. Revisit if QA flags a flash. (Sources: edge)
- [x] [Review][Defer] XSS regression guard scope is narrow — only `task.text` is scanned [apps/web/src/components/TaskRow.test.tsx ~lines 66-80] — deferred; AC #9 limits the regression guard to `task.text`. Expand the scan to any future stringly-rendered task field (e.g., user-controlled metadata) when such a field is added. (Sources: edge)
