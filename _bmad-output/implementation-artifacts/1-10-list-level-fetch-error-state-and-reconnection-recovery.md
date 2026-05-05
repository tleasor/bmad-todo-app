# Story 1.10: List-Level Fetch Error State and Reconnection Recovery

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a clear, actionable in-list message if the task list fails to load — and the app to recover automatically when my connection returns,
so that I'm never left with a blank screen or a hidden failure.

## Acceptance Criteria

1. **`useTasks` retry policy is the architecture-locked baseline (FR6, ARCH-AR11)** — `apps/web/src/data/queries.ts`'s `useTasks` continues to use `retry: 2`, `refetchOnReconnect: true`, `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false` (already locked since Story 1.7). **Do not change** these values or replace `retry: 2` with the function-form retry from `useCreateTask` — the GET path uses TanStack's default retry-decision (any failed query retries, with all 4xx considered transient). The exhaustion contract is "after 2 retries the query enters `isError`" — this is what the FR6 list-level error UI is gated on. The 200 ms loading gate (`LOADING_DELAY_MS = 200`) and 4-state TaskList rendering (loading / empty / populated / error) from Story 1.7 are preserved.

2. **`TaskList` renders an inline list-level fetch-error state when `query.isError` is true (FR6, UX-DR17)** — Replace the existing `<Show when={!query.error}>` outer guard in `apps/web/src/components/TaskList.tsx` with a four-arm conditional. The fourth arm — `query.isError === true` — renders a new `ListFetchError` sub-component (co-located inside `TaskList.tsx`, sibling to the `<For>` block — TaskList does not yet have an external sub-component pattern; co-locate per the project's "sub-components used by one parent" rule). `ListFetchError` is rendered **inline within the `task-list-region` container** — not as a modal, not as a toast, not as a top-level banner. Visual structure: a single `<p>` of copy followed by a `<button type="button">Retry</button>`, both inside a flex column with `gap-3` and `items-center` alignment, vertically centered in the list area (matches the `EmptyState`'s centered layout per UX consistency).

3. **Error copy is neutral, names the failed operation, and uses the architecture's typography tokens (FR6, UX-DR17, UX-DR22)** — The error copy is the constant `LIST_FETCH_ERROR_COPY = "Couldn't load tasks — check connection."` exported from `apps/web/src/data/announcements.ts` (single source of truth, mirrors `LIVE_REGION_RETRY_EXHAUSTED` placement). The copy uses **em-dash `—` U+2014** (not hyphen-minus), sentence case, no exclamation, no apology, and names "load" as the failed operation + "check connection" as the next action — same voice contract as the row-level retry-exhausted copy. The `<p>` element renders with classes `text-body text-center text-token-text-secondary` (re-using the EmptyState typography pattern: `--text-body-size` / `--text-body-line-height` / `--color-text-secondary`). **Do not** apply `--color-status-error`, **do not** add a red banner, **do not** change the page background — UX-DR17 forbids the failure UI from looking like a system-level alarm. The `<p>` does **not** have `role="alert"`; `aria-live="polite"` lives on the global `<LiveRegion />` (UX-DR10) and is not used here because the error state has a visible landing point (the rendered `<p>`).

4. **`Retry` button is keyboard-reachable, calls `query.refetch()`, and triggers another full retry pass (FR6, FR19)** — The Retry button is a native `<button type="button">Retry</button>` with sentence-case text content, classes `text-body-strong text-token-accent-default cursor-pointer bg-transparent border-0 px-3 py-1 rounded-sm` (re-using the design tokens — `--text-body-strong-*`, `--color-accent-default`, `--radius-sm` — and matching the visual weight of an interactive element while keeping the "calm in failure" voice). Focus styling: `focus-visible:outline-2 focus-visible:outline-token-accent-default focus-visible:outline-offset-2` (matches the project's universal focus-ring contract from UX-DR7). On click *or* on Enter/Space (native button semantics), the handler calls `query.refetch()` — this re-runs the underlying `queryFn` and the architecture-locked `retry: 2` policy applies again. If the refetch succeeds, `query.isError` flips to `false` and the populated/empty arms take over (existing `Show` chain). If the refetch fails after retries, `query.isError` stays `true` and the `ListFetchError` UI re-renders (idempotent — the copy and button are still present, ready for another click). The Retry button is naturally tab-stop-able by default browser semantics; **no `tabindex` override**.

5. **Reconnection auto-refetches via TanStack Query's `online` listener (FR6, ARCH-AR11)** — Because `useTasks` is configured with `refetchOnReconnect: true` (Story 1.7 locked this), TanStack Query's `onlineManager` automatically listens for the browser's `window` `online` event and triggers a refetch of every active query whose option is `true` — including queries currently in the `error` state. **No additional event listener** is added in this story; the existing config is the wire. When the browser fires `online`, the `["tasks"]` query refetches, the `retry: 2` policy applies, and (assuming the network is genuinely back) `query.isError` flips to `false` and the populated/empty arm renders. The list-level error state clears as a natural consequence of the `<Show when={!query.isError}>` chain re-evaluating. **Do not** add a manual `window.addEventListener("online", ...)` — TanStack Query already owns this; doubling the wire would double-refetch.

6. **`useTasks` accessor exposes `refetch` for the Retry button (FR6)** — `useTasks` already returns the full `UseQueryResult<Task[], Error>` from TanStack Query, which includes `refetch`. **No change to `useTasks`**. In `TaskList.tsx`, replace `const query = useTasks();` with the same call — the consumer simply reads `query.refetch` alongside `query.isPending` / `query.error` / `query.data`. The existing component-↔-data boundary (components consume hooks only — no Eden client, no `tasksApi.*`) is preserved.

7. **Error state and Retry button share the `ListFetchError` shape across light + dark mode (NFR-A1, UX-DR17)** — All token references go through the existing CSS custom properties: `--text-body-size`, `--text-body-line-height`, `--color-text-secondary`, `--text-body-strong-*`, `--color-accent-default`, `--radius-sm`, `--space-3`. The dark-mode branch of `apps/web/src/styles/tokens.css` already defines all of these (`--color-text-secondary: #a1a1aa`, `--color-accent-default: #60a5fa`). Contrast verification: `--color-text-secondary` on `--color-bg-canvas` is `#52525b` on `#fafafa` ≥ 7.4:1 (AAA) light; `#a1a1aa` on `#09090b` ≥ 7.7:1 (AAA) dark. `--color-accent-default` on `--color-bg-canvas` is `#2563eb` on `#fafafa` ≥ 5.7:1 (AA) light; `#60a5fa` on `#09090b` ≥ 7.4:1 (AAA) dark. **No new tokens introduced.**

8. **`prefers-reduced-motion: reduce` is honored automatically — no new motion is introduced (UX-DR20)** — `ListFetchError` uses no transitions, no animations, no entrance effects. The error state appears instantly when `query.isError` flips. The reduced-motion CSS reset from Story 1.5 still applies globally; no per-component override is needed. No fade-in, no slide-in, no shimmer.

9. **`TaskList` four-state rendering matrix is exhaustive and non-overlapping (FR4, FR5, FR6)** — After this story, `TaskList` renders exactly one of: (a) **loading** (`query.isPending && showLoading()`), (b) **populated** (`!query.isPending && !query.isError && query.data?.length > 0`), (c) **empty** (`!query.isPending && !query.isError && query.data?.length === 0`), (d) **error** (`query.isError` after 2 retries). The state machine excludes ambiguity: when `query.isError === true`, the loading/populated/empty arms do not render. When `query.isPending === true`, the error arm does not render (a query that has failed once is not pending; TanStack moves it from `pending` → `error` after retries exhaust). Document this in the Project Structure Notes for future story authors. Pre-existing 200 ms gate behavior (`showLoading()` signal driven by `LOADING_DELAY_MS`) is preserved verbatim.

10. **`TaskList.test.tsx` extends with three new tests for the error state (FR6, NFR-A1)** — Add `describe("TaskList fetch error state")` with these cases:
    - **Renders the `ListFetchError` copy and Retry button when `useTasks` resolves to `isError`.** Stub `tasksApi.list = mock(() => Promise.reject(new TasksApiError({ status: 500, message: "boom" })))`. Set the test client's mutations/queries `retry: false` so the failure surfaces immediately (the architecture-locked `retry: 2` is what production ships; tests over-ride for speed via the test-client default). Render `<TaskList />`. `await waitFor(() => query state has error)` (or simply assert via the test client's cache state). Assert `getByText("Couldn't load tasks — check connection.")` and `getByRole("button", { name: "Retry" })` are both present.
    - **Retry button click triggers another `tasksApi.list` call.** Stub `tasksApi.list = mock(() => Promise.reject(new TasksApiError({ status: 500, message: "boom" })))`. Render. Wait for error state. `fireEvent.click(getByRole("button", { name: "Retry" }))`. Assert `tasksApi.list` was called at least twice (initial + retry). Mock-call-count assertion is acceptable; alternatively assert via cache `state.fetchStatus === "fetching"` after click.
    - **Error state has zero critical/serious axe-core violations (NFR-A1).** Reach the error state via the same stub. `await assertNoBlockingAxeViolations(container)` — re-use the existing helper from `TaskList.test.tsx`.
    - **Retry success transitions error → populated.** Stub `tasksApi.list` to reject on the first call and resolve on the second (`mock(() => callCount++ === 0 ? Promise.reject(new TasksApiError({...})) : Promise.resolve([mockTask({ text: "recovered" })]))`). Render. Wait for error UI. Click Retry. Wait for `getByText("recovered")` to appear. Assert the error copy and Retry button are no longer in the DOM (`queryByText("Couldn't load tasks — check connection.")` returns `null`).
    - **No regression on existing 4 TaskList tests** (loading-under-200, loading-after-200, empty, populated). All continue to pass unmodified.

11. **`useTasks` reconnect-recovery is unit-tested via `onlineManager` (FR6, ARCH-AR11)** — Add a new `it("...")` inside the existing `describe("useTasks")` block in `apps/web/src/data/queries.test.tsx`:
    - **Stub `tasksApi.fetch` to fail on the first call (with `TasksApiError({ status: 500 })`) and succeed on subsequent calls.** Use a fresh `makeMutationClient()` (zero-retry config so the failure surfaces immediately for the test). Render the `Probe` component that calls `useTasks()`. Wait for `snapshot.isError === true`. Then call `onlineManager.setOnline(true)` (or simulate via `window.dispatchEvent(new Event("online"))` if the `onlineManager` import path is awkward — the architecture's `@tanstack/solid-query` re-exports `onlineManager`; prefer it). Wait for `snapshot.data` to populate with the success payload. Assert `snapshot.isError === false` and `snapshot.data.length > 0`. **This test is the load-bearing reconnect verification.** Do **not** rely on the e2e Playwright spec alone — unit-level coverage of the reconnect path catches regressions in the TanStack config.

12. **`e2e/empty-error-states.spec.ts` covers the FR4 / FR5 / FR6 surface (NFR-M2, FR4, FR5, FR6, NFR-A1)** — Create the fourth Playwright spec file at `e2e/empty-error-states.spec.ts` (per architecture's `project-structure-boundaries.md` enumerated five-spec list). The spec covers the inline error and recovery flow:
    - **Inline list-level error renders when GET fails repeatedly.** Use `await page.route("**/api/tasks", async (route) => { if (route.request().method() === "GET") { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "service_unavailable", message: "test-induced" }, requestId: "test" }) }); return; } await route.continue(); });`. Goto `/`. Assert the page does **not** white-screen: `await expect(page.getByLabel("New task")).toBeVisible()` (TaskInput is mounted independently of the list). Within ~5 s (allowing the 2 retries to play out at the architecture-locked exponential delays — the test's tolerance must accommodate the retry window; if test runtime becomes too long, override `retry` via a Playwright fixture or a window-level test hook), assert `await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({ timeout: 5000 })` and `await expect(page.getByRole("button", { name: "Retry" })).toBeVisible()`.
    - **Retry button click re-attempts the GET.** From the above state, `await page.unroute("**/api/tasks")` then `await page.route("**/api/tasks", route => route.continue())` to release the interception. Click `getByRole("button", { name: "Retry" })`. Assert the error copy unmounts and either `EmptyState` or a populated list renders (`await expect(page.getByText("Couldn't load tasks — check connection.")).toHaveCount(0, { timeout: 3000 })`).
    - **EmptyState renders when GET succeeds with `[]`.** Fresh test. Stub `await page.route("**/api/tasks", async (route) => { if (route.request().method() === "GET") { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); return; } await route.continue(); });`. Goto. Assert `await expect(page.getByText("No tasks yet. Start by typing above.")).toBeVisible()`. (Covers FR4.)
    - **LoadingState renders 200+ ms slow GET via skeleton rows.** Fresh test. Stub `await page.route("**/api/tasks", async (route) => { if (route.request().method() === "GET") { await new Promise(r => setTimeout(r, 600)); await route.continue(); return; } await route.continue(); });`. Goto. Assert `await expect(page.locator('[data-testid="skeleton-row"]')).toHaveCount(3, { timeout: 1000 })`. After resolution, assert the skeletons unmount (`await expect(page.locator('[data-testid="skeleton-row"]')).toHaveCount(0, { timeout: 5000 })`). (Covers FR5.)
    - **axe-core has zero critical/serious violations on the error state (NFR-A1, NFR-A2).** From the error state setup, `await new AxeBuilder({ page }).analyze()`. Filter to `impact === "critical" || impact === "serious"`. Assert empty.
    - **Reconnect recovery — `online` event clears the error.** Set up the failing route, goto, wait for error. `await page.context().setOffline(false)` (Playwright's network-state API; if not directly available, use `await page.evaluate(() => window.dispatchEvent(new Event("online")))` as a soft fallback). Then `await page.unroute("**/api/tasks")`. Either approach should flip the query state. Assert the error copy unmounts within ~3 s and the populated/empty arm renders. (Note: this test exercises the production wire; under the dev-server `bun run dev` the backend is real, so once unrouted, the GET hits the real API — which returns the dev SQLite contents.)
    - **Use unique per-test stamps** (`Date.now()`-based texts and route stubs scoped to the test) so cross-run dev DB state does not collide; mirror the Story 1.8 / 1.9 deviation pattern.
    - **Do not** modify `e2e/smoke.spec.ts`, `e2e/capture.spec.ts`, or `e2e/error-recovery.spec.ts`.

13. **No new dependencies; no backend changes; backend untouched (NFR-M5, AC-21 from prior stories)** — `bun run check` passes (oxlint, oxfmt, tsgo `-b --noEmit`, dep-count). `bun run check:full` passes (above + `bun test` + `bun audit` + `bun run build` + bundle-size). `bun playwright test e2e/empty-error-states.spec.ts --project=chromium` (and full triple if local time allows) passes. **Do not** add new entries to `apps/web/package.json` `dependencies` or `devDependencies`. The web package stays at 17/25 (NFR-M5). The new code lives in: `apps/web/src/components/TaskList.tsx` (extended), `apps/web/src/components/TaskList.test.tsx` (extended), `apps/web/src/data/announcements.ts` (extended with `LIST_FETCH_ERROR_COPY`), `apps/web/src/data/queries.test.tsx` (extended with reconnect test), `e2e/empty-error-states.spec.ts` (new). **Do not** modify `apps/api/**`.

14. **Bundle-size budget stays well under 100 KB gz (NFR-P1)** — Story 1.9 left the main chunk at 26.69 KB gz. This story adds: ~30 lines in `TaskList.tsx` (inline `ListFetchError` sub-component + new conditional arm), ~3 lines in `announcements.ts` (one new constant), ~80 lines of test code, ~120 lines of e2e spec. Estimated total addition to the main chunk: < 1 KB gz. Final main chunk should remain under 28 KB gz, comfortably under the 100 KB ceiling. `bash scripts/check-bundle-size.sh` continues to pass.

15. **Coverage stays green (NFR-M3)** — `bun scripts/check-coverage.ts` (the `check:full` coverage gate) stays ≥ 70 %. Aim for ≥ 90 % statements on `components/TaskList.tsx` (the four-state matrix is now fully exercised). The 4 new TaskList component tests + 1 new useTasks reconnect test + 6 new e2e tests collectively cover the surface.

16. **No regression on Stories 1.5–1.9 surfaces (FR1, FR2, FR4, FR5, FR18, FR23, FR25, FR26, FR27)** — All 186 existing unit tests continue to pass. The `e2e/capture.spec.ts` (4 tests) and `e2e/error-recovery.spec.ts` (4+ tests) and `e2e/smoke.spec.ts` (1 test) continue to pass. The Playwright timing-window contract from Story 1.8 (row paints within 100 ms even with 800 ms artificial delay) is unaffected. Per-row sync state (Story 1.9's SyncIndicator + RetryAction + ErrorMessage) and the LiveRegion queue remain untouched.

17. **Tightly bounded scope** — Out of scope (forbidden in this story): toggle mutation (`useToggleTask` — Story 2.2), delete mutation (`useDeleteTask` — Story 3.2), undo flow (Story 3.4), per-row keyboard navigation (Story 4.x), Tab order through the list-level Retry button (Story 4.2 — the spec there asserts the Tab order works *with* this story's `<button>` in place; this story only ensures the button is `<button>` and tab-stop-able by default), single-service container deployment (Story 1.11), backend changes of any kind, new design tokens, modal / banner / toast UIs, manual `window.addEventListener("online", ...)`, replacing the `retry: 2` config with the function-form retry, replacing `refetchOnReconnect: true` with `refetchOnReconnect: "always"`, adding `role="alert"` / `aria-live` to the inline error (the global LiveRegion + the visible UI is the channel), adding a "dismiss" button to the error state. No `Bun.env` / `import.meta.env`. No raw `fetch`. No `console.log`. No `any`. No magic numbers (the copy is a named constant). Named exports only. Never destructure component props.

18. **Documentation hygiene** — The Dev Agent Record notes: any deviations from the AC-prescribed file structure (e.g., constant placement choice — `announcements.ts` vs. a new `errorMessages.ts`); the error-state markup choice (single `<p>` vs. wrapper `<div>` with `role="region"` — the AC-locked choice is plain `<p>` for screen-reader simplicity, but document any deviation); the e2e timing-window calibration (the 5 s tolerance for the 2-retry exhaustion window). Any deferred follow-ups go into `_bmad-output/implementation-artifacts/deferred-work.md` under a new "Deferred from: code review of 1-10-..." section.

## Tasks / Subtasks

- [x] **Task 1 — Add `LIST_FETCH_ERROR_COPY` to `announcements.ts`** (AC: #3)
  - [x] In `apps/web/src/data/announcements.ts`, add `export const LIST_FETCH_ERROR_COPY = "Couldn't load tasks — check connection.";` with a glyph-reminder comment matching the existing block (em-dash U+2014, ellipsis is not used here).
  - [x] Verify the existing constants (`LIVE_REGION_SAVING`, `LIVE_REGION_SAVED`, `LIVE_REGION_RETRY_EXHAUSTED`) are unchanged.

- [x] **Task 2 — Extend `TaskList.tsx` with the inline list-level error state** (AC: #2, #3, #4, #5, #6, #7, #8, #9)
  - [x] In `apps/web/src/components/TaskList.tsx`, import `LIST_FETCH_ERROR_COPY` from `../data/announcements`.
  - [x] Replace the existing outer `<Show when={!query.error}>` guard with a chained-fallback structure that has four arms:
    ```tsx
    <Show
      when={!query.isError}
      fallback={<ListFetchError onRetry={() => query.refetch()} />}
    >
      <Show
        when={!query.isPending}
        fallback={<Show when={showLoading()}><LoadingState /></Show>}
      >
        <Show when={(query.data ?? []).length > 0} fallback={<EmptyState />}>
          <ul role="list" class="task-list">
            <For each={query.data ?? []}>{(task) => <TaskRow task={task} />}</For>
          </ul>
        </Show>
      </Show>
    </Show>
    ```
  - [x] Build `ListFetchError(props: { onRetry: () => void })` as a co-located function in `TaskList.tsx`, **below** `TaskList`. Markup:
    ```tsx
    function ListFetchError(props: { onRetry: () => void }): JSX.Element {
      return (
        <div class="flex flex-col items-center gap-3 py-8">
          <p class="text-body text-center text-token-text-secondary">
            {LIST_FETCH_ERROR_COPY}
          </p>
          <button
            type="button"
            onClick={() => props.onRetry()}
            class="text-body-strong text-token-accent-default cursor-pointer bg-transparent border-0 px-3 py-1 rounded-sm focus-visible:outline-2 focus-visible:outline-token-accent-default focus-visible:outline-offset-2"
          >
            Retry
          </button>
        </div>
      );
    }
    ```
  - [x] **Do not destructure `props`** — Solid prop-reactivity rule. Always `props.onRetry()`.
  - [x] Verify the existing 200 ms `showLoading()` signal and `createEffect` logic are unchanged.
  - [x] Verify no inline magic numbers; `gap-3`, `py-8`, `px-3`, `py-1` are UnoCSS utilities (token-backed via `space-3`, `space-8`, etc. — confirm by reading `apps/web/uno.config.ts`).
  - [x] Confirm the `text-body-strong`, `text-token-accent-default`, `bg-transparent`, `border-0`, `rounded-sm`, `focus-visible:outline-*` classes are recognized by UnoCSS — if any class is unrecognized (e.g., a typo or missing rule), either add to `uno.config.ts` or fall back to inline CSS in `TaskList.css` colocated with the component (mirror the `TaskRow.css` pattern from Story 1.9). Document the choice in deviations.

- [x] **Task 3 — Extend `TaskList.test.tsx` with four new error-state tests** (AC: #10, #16)
  - [x] In `apps/web/src/components/TaskList.test.tsx`, import `TasksApiError` from `../data/api` and `fireEvent` from `@solidjs/testing-library`. Existing imports (`mock`, `tasksApi`, `mockTask`, etc.) are sufficient for the new cases.
  - [x] Add `describe("TaskList fetch error state")` after the existing `describe("TaskList")` block. Use the same `makeClient` helper but **set `defaultOptions.queries.retry: false`** (already the default in the existing `makeClient`) to ensure the rejection surfaces immediately rather than waiting for the production retry policy.
  - [x] **Test 1 — renders error copy and Retry button.** Stub `tasksApi.list = mock(() => Promise.reject(new TasksApiError({ status: 500, message: "boom" })))`. Render. Use `waitFor(() => container.textContent?.includes("Couldn't load tasks"))` from a small inline helper (or use the existing `wait()` helper combined with `findByText`). Assert `getByText("Couldn't load tasks — check connection.")` and `getByRole("button", { name: "Retry" })` both resolve.
  - [x] **Test 2 — Retry click re-invokes `tasksApi.list`.** Same stub. After the error state mounts, `fireEvent.click(getByRole("button", { name: "Retry" }))`. Assert `(tasksApi.list as ReturnType<typeof mock>).mock.calls.length` is `>= 2`.
  - [x] **Test 3 — error state has zero critical/serious axe violations.** Same stub. Wait for error. `await assertNoBlockingAxeViolations(container)`.
  - [x] **Test 4 — Retry success transitions error → populated.** Use a counter:
    ```ts
    let calls = 0;
    tasksApi.list = mock(() =>
      calls++ === 0
        ? Promise.reject(new TasksApiError({ status: 500, message: "boom" }))
        : Promise.resolve([mockTask({ id: "...", text: "recovered" })])
    );
    ```
    Render. Wait for error UI. `fireEvent.click(getByRole("button", { name: "Retry" }))`. Wait for `getByText("recovered")`. Assert `queryByText("Couldn't load tasks — check connection.")` is `null`.
  - [x] Restore `tasksApi.list = originalList` in the existing `afterEach` (already wired — just confirm).

- [x] **Task 4 — Add `useTasks` reconnect-recovery unit test** (AC: #11)
  - [x] In `apps/web/src/data/queries.test.tsx`, inside the existing `describe("useTasks")` block, add:
    ```ts
    it("auto-refetches and clears the error state when the browser fires `online` (refetchOnReconnect contract)", async () => {
      let calls = 0;
      tasksApi.fetch = mock(() => {
        calls++;
        if (calls === 1) {
          return Promise.reject(new TasksApiError({ status: 500, message: "boom" }));
        }
        return Promise.resolve({ data: [mockTask({ text: "recovered" })], error: null });
      });
      const client = makeMutationClient(); // queries.retry: 0 fast-fails the first call
      let snapshot = { isError: false, data: undefined as Task[] | undefined };
      const Probe = (): JSX.Element => {
        const query = useTasks();
        createEffect(() => {
          snapshot = { isError: query.isError, data: query.data };
        });
        return <div data-testid="probe" />;
      };
      renderWithClient(client, () => <Probe />);
      await waitFor(() => (snapshot.isError ? true : undefined));
      expect(snapshot.isError).toBe(true);

      // Simulate the browser firing `online`. TanStack Query's onlineManager
      // listens to window's `online` event AND exposes setOnline programmatically.
      window.dispatchEvent(new Event("online"));

      await waitFor(() => (snapshot.data && snapshot.data.length > 0 ? snapshot.data : undefined));
      expect(snapshot.data?.[0]?.text).toBe("recovered");
    });
    ```
  - [x] **Important:** the test client uses `makeMutationClient` (which sets `queries.retry: 0` via `mutations.retry: false` — confirm by reading the helper; if the queries default is not zero, override explicitly via `defaultOptions.queries.retry: false`). The architecture-locked production retry of 2 is verified by the existing "registers the architecture-locked tasks-query options" test; this new test is about reconnect behavior, not retry count.
  - [x] If `window.dispatchEvent` does not trigger TanStack's onlineManager under happy-dom (it should, but happy-dom's event-listener fidelity is not 100%), use the explicit programmatic API: `import { onlineManager } from "@tanstack/solid-query"; onlineManager.setOnline(true)` after first setting `onlineManager.setOnline(false)` in `beforeEach`. Document the choice as a deviation if the dispatch path doesn't work.

- [x] **Task 5 — Author `e2e/empty-error-states.spec.ts`** (AC: #12, #16)
  - [x] Create `e2e/empty-error-states.spec.ts`. Mirror the structure of `e2e/error-recovery.spec.ts`: `import AxeBuilder from "@axe-core/playwright"; import { expect, test, type Page } from "@playwright/test";`.
  - [x] Add a `waitForInitialTasksLoad(page)` helper or inline equivalent for tests that need to capture pre-counts after the initial load settles (mirror the helper from `error-recovery.spec.ts`).
  - [x] Tests in this order (AC #12):
    1. Inline list-level error renders when GET fails (assert TaskInput visible — no white-screen — and the error copy + Retry button visible).
    2. Retry click re-attempts the GET and the error UI clears.
    3. EmptyState renders on `[]` payload.
    4. LoadingState renders on 600 ms-delayed GET and unmounts on resolution.
    5. axe-clean on the error state.
    6. Reconnect recovery via `online` event (or Playwright's network-state API).
  - [x] **Per-test scoped routes:** wrap each test in `await page.route(...)` followed by `await page.unroute(...)` (or use `test.beforeEach` / `test.afterEach`) so the route stub does not leak across tests.
  - [x] **Timing window for the error state:** the production retry config is `retry: 2` with `retryDelay` defaulting to TanStack v5's exponential backoff (`Math.min(1000 * 2 ** attempt, 30_000)` for the GET path — *not* the function-form mutation retryDelay). Two retries with exponential backoff sleep ~1 s + ~2 s ≈ 3 s before the query enters `isError`. The Playwright timeout for "error UI visible" should be `{ timeout: 5000 }` to allow margin.
  - [x] **Production timing override (if test-local override is preferred):** the architecture-locked `retry: 2` config is what production ships; e2e tests override this only if the timing exceeds Playwright's per-test budget. Today's 5 s tolerance is comfortable; **do not** modify `useTasks` to read a test-time retry override. If the test runtime becomes problematic in CI, a follow-up could expose a `__queryRetry` window-level test hook, but that is out of scope here.
  - [x] Use unique `Date.now()`-stamped texts where needed. The dev SQLite DB persists across runs; the GET stub returns synthetic data (the test does not actually hit the real backend during the failing-GET tests).
  - [x] **Do not** modify `e2e/smoke.spec.ts`, `e2e/capture.spec.ts`, or `e2e/error-recovery.spec.ts`. Re-run all four specs as part of `bun playwright test` to verify no regression.

- [x] **Task 6 — Verify quality gates** (AC: #13, #14, #15, #16)
  - [x] Run `bun run check`. Must pass: oxlint, oxfmt, tsgo `-b --noEmit`, dep-count.
  - [x] Run `bun run check:full`. Must pass: above + `bun test` (186 existing + 4–5 new) + `bun audit` + `bun run build` (Vite) + bundle-size.
  - [x] Run `bun playwright test e2e/empty-error-states.spec.ts --project=chromium` (or full triple). Must pass.
  - [x] Run `bun playwright test e2e/capture.spec.ts --project=chromium`. Must pass (no Story 1.8 regression).
  - [x] Run `bun playwright test e2e/error-recovery.spec.ts --project=chromium`. Must pass (no Story 1.9 regression).
  - [x] Run `bun run dev` and visually verify in a browser:
    - Open `/`. Tasks load (or empty state if DB is empty).
    - DevTools → Network → "Offline" → reload page → after the 2 retries (~3 s), the inline error renders within the list area. The page does not white-screen — TaskInput is still focused and usable. The error copy is `"Couldn't load tasks — check connection."` in `text-body` `text-token-text-secondary`. The Retry button is below it, in `text-body-strong` `text-token-accent-default`.
    - Tab to the Retry button — the focus ring matches the project's universal focus contract.
    - Click Retry while still offline → another 2-retry attempt fires → error re-renders.
    - Re-enable network → click Retry → list populates (or EmptyState renders if DB is empty).
    - Re-enable network → trigger a fresh failing scenario (offline → wait for error → re-enable network without clicking Retry) → assert the list auto-recovers via the `online` event (this verifies AC #5's `refetchOnReconnect` wire).
    - Toggle dark mode (system setting) → all colors adapt; contrast is preserved.
    - Toggle `prefers-reduced-motion: reduce` (system setting) → no animation regression (no new motion was added).
    - **(If manual testing is impractical, substitute via Playwright per Story 1.8 deviation #4 — the e2e spec covers all six scenarios cross-browser.)**
  - [x] Record any deviations (CSS file location, constant placement, e2e timing window, `onlineManager` vs. `dispatchEvent` choice) in the Dev Agent Record.

## Dev Notes

### Critical Context

This story closes **FR6** ("the product displays an explicit error state when task retrieval fails, and the message communicates what the user can do") and the list-level half of **Journey 4** (error recovery). Story 1.9 closed the per-row sync-failure half (SyncIndicator + RetryAction + ErrorMessage on TaskRow). Story 1.10 closes the load-failure half: the list itself fails to come up, and the user sees an honest, actionable message inside the list area instead of a blank screen or a hidden failure.

After this story, Epic 1 is one story away from done (Story 1.11 — single-service container deployment is the last piece). The four-state TaskList rendering matrix (loading / empty / populated / error) is finally exhaustive. The `useTasks` configuration locked in Story 1.7 (`retry: 2`, `refetchOnReconnect: true`) finally has a user-visible consequence: 2 retries → error UI → user can click Retry or wait for `online`.

The story is **the list-level fetch-error UX layer only**. Out-of-scope and forbidden:

- **Per-row sync UX.** Story 1.9 owns SyncIndicator / RetryAction / ErrorMessage on TaskRow. Do not modify `TaskRow.tsx`, `captureSyncStore.ts`, or the per-row CSS.
- **Toggle / delete mutations.** Stories 2.2 and 3.2 own those.
- **Undo flow.** Story 3.4 owns the UndoSnackbar.
- **Backend changes.** None. The story is purely frontend.
- **New design tokens.** All required tokens (`text.body`, `text.body.strong`, `color.text.secondary`, `color.accent.default`, `radius.sm`, `space.3`, `space.8`) are already defined in `apps/web/src/styles/tokens.css` for both light and dark modes.

### Locked Decisions (carry-forward from Stories 1.5–1.9)

- **Frontend framework:** SolidJS 1.9.12. `<Show>`, `<For>`, `createSignal`, `createEffect`, `onCleanup`. **Never destructure component props.**
- **Server-state cache:** `@tanstack/solid-query@5.100.6`. `useQuery` v5 takes a factory-function-shape (`() => ({...})`). The hook returns `UseQueryResult<Data, Error>` which exposes `data`, `error`, `isError`, `isPending`, `refetch`, `status`, `fetchStatus`, etc.
- **`useTasks` config (Story 1.7 / D7):** `retry: 2`, `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`. **Do not change.**
- **API typing:** Eden Treaty (`@elysiajs/eden@1.4.9`). All API calls go through `apps/web/src/data/api.ts`. `tasksApi.list` throws `TasksApiError` on non-null Eden error envelope (Story 1.9). `useTasks` consumes the thrown error via TanStack's `error` field.
- **Architecture component-↔-data boundary:** Components consume data exclusively through TanStack Query hooks (`useTasks`, indirect `useCreateTask`) *or* the `captureSyncStore`'s read accessor. Components never import `tasksApi` or the Eden client directly.
- **Styling:** UnoCSS + token CSS custom properties. The `text-body`, `text-body-strong`, `text-center`, `text-token-text-secondary`, `text-token-accent-default`, `bg-transparent`, `border-0`, `rounded-sm`, `cursor-pointer`, `flex`, `flex-col`, `items-center`, `gap-3`, `py-8`, `px-3`, `py-1`, `focus-visible:outline-*` utilities are token-backed via `apps/web/uno.config.ts`. **No new tokens introduced.**
- **No raw `fetch`.** No inline SQL. No `console.log`. No magic numbers (the copy is a named constant). No `any`. Named exports only.
- **bun:test idiom:** `describe(...)` + `it(...)`.
- **Component tests** use `@solidjs/testing-library` + happy-dom (preloaded by `apps/web/test-setup/happy-dom.ts` in `bunfig.toml`). The `--conditions=browser` flag is required (`bun run test` already wires it).
- **Story 1.7 / 1.8 / 1.9 stub mechanism:** swap `tasksApi.list` (or `tasksApi.fetch` for envelope-level tests) directly in `beforeEach`/`afterEach`; mock `client.cancelQueries` / `invalidateQueries` if needed. Same pattern extends here.
- **Story 1.9 contract preserved:** the `LiveRegion` queue, `captureSyncStore`, per-row sync state, and the announce-once-per-transition rule are untouched. **Do not** announce a list-level fetch-error via `LiveRegion.announce(...)` — the visible UI is the channel; the global LiveRegion is for state changes that lack a visible landing point. The Story 1.7 / 1.8 / 1.9 acceptance criteria for what announces and what does not is binding.

### `TaskList.tsx` Implementation Sketch (extension of Story 1.7's component)

```tsx
// apps/web/src/components/TaskList.tsx
import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { LOADING_DELAY_MS } from "../constants";
import { LIST_FETCH_ERROR_COPY } from "../data/announcements";
import { useTasks } from "../data/queries";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { TaskRow } from "./TaskRow";

export function TaskList(): JSX.Element {
  const query = useTasks();
  const [showLoading, setShowLoading] = createSignal(false);

  createEffect(() => {
    if (query.isPending) {
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    } else {
      setShowLoading(false);
    }
  });

  return (
    <div class="task-list-region mt-8">
      <Show
        when={!query.isError}
        fallback={<ListFetchError onRetry={() => query.refetch()} />}
      >
        <Show
          when={!query.isPending}
          fallback={
            <Show when={showLoading()}>
              <LoadingState />
            </Show>
          }
        >
          <Show when={(query.data ?? []).length > 0} fallback={<EmptyState />}>
            <ul role="list" class="task-list">
              <For each={query.data ?? []}>{(task) => <TaskRow task={task} />}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function ListFetchError(props: { onRetry: () => void }): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-3 py-8">
      <p class="text-body text-center text-token-text-secondary">
        {LIST_FETCH_ERROR_COPY}
      </p>
      <button
        type="button"
        onClick={() => props.onRetry()}
        class="text-body-strong text-token-accent-default cursor-pointer bg-transparent border-0 px-3 py-1 rounded-sm focus-visible:outline-2 focus-visible:outline-token-accent-default focus-visible:outline-offset-2"
      >
        Retry
      </button>
    </div>
  );
}
```

Notes:

- `query.isError` is the TanStack v5 boolean flag; equivalent to checking `query.status === "error"`. Prefer the boolean.
- `query.refetch()` returns a `Promise<UseQueryResult<...>>`. The button's `onClick` does not need to await it — TanStack updates the cache + observers asynchronously, and the component re-renders when `query.isError` flips.
- **Do not destructure `props`** in `ListFetchError`. Solid prop-reactivity requires `props.onRetry()` access.
- The `ListFetchError` is **not** an `<ErrorBoundary>` fallback — `<ErrorBoundary>` (Story 1.5) catches *render* errors thrown from JSX. The fetch error is a *data* error caught by TanStack Query's observer; the render path is happy.

### `announcements.ts` Extension Sketch

```ts
// apps/web/src/data/announcements.ts
// Single source of truth for LiveRegion announcement copy and list-level
// surface copy. Hook lifecycle callbacks announce LIVE_REGION_* strings;
// component tests assert against the constant rather than a literal so a
// copy tweak only changes one place.
//
// Glyph reminders (UX-DR22):
//   - "Saving…" uses ellipsis U+2026 (one character), not three dots.
//   - "Couldn't save — check connection." uses em-dash U+2014, not hyphen-minus.
//   - "Couldn't load tasks — check connection." likewise uses em-dash U+2014.
export const LIVE_REGION_SAVING = "Saving…";
export const LIVE_REGION_SAVED = "Saved";
export const LIVE_REGION_RETRY_EXHAUSTED = "Couldn't save — check connection.";
export const LIST_FETCH_ERROR_COPY = "Couldn't load tasks — check connection.";
```

Notes:

- The constant lives in `announcements.ts` even though `LIST_FETCH_ERROR_COPY` is **not** announced via `LiveRegion.announce(...)`. Reason: a single file owns all user-facing copy strings under FR-related state changes; a future extraction of "i18n string table" would target this file. Document this choice in the Dev Agent Record's deviations if a separate `errorMessages.ts` is preferred.

### `TaskList.test.tsx` Extension Sketch

```tsx
// apps/web/src/components/TaskList.test.tsx (new describe block)
import { fireEvent } from "@solidjs/testing-library";
import { TasksApiError } from "../data/api";

describe("TaskList fetch error state", () => {
  let originalList: typeof tasksApi.list;

  beforeEach(() => {
    originalList = tasksApi.list;
  });

  afterEach(() => {
    tasksApi.list = originalList;
  });

  it("renders the inline error copy and Retry button when the GET fails", async () => {
    tasksApi.list = mock(() =>
      Promise.reject(new TasksApiError({ status: 500, message: "boom" })),
    );
    const client = makeClient();
    const { container, getByRole, getByText } = renderWithClient(client, () => <TaskList />);

    await wait(50); // let the rejection propagate through TanStack
    expect(getByText("Couldn't load tasks — check connection.")).toBeDefined();
    expect(getByRole("button", { name: "Retry" })).toBeDefined();
    await assertNoBlockingAxeViolations(container);
  });

  it("Retry click re-invokes tasksApi.list", async () => {
    tasksApi.list = mock(() =>
      Promise.reject(new TasksApiError({ status: 500, message: "boom" })),
    );
    const client = makeClient();
    const { getByRole } = renderWithClient(client, () => <TaskList />);

    await wait(50);
    fireEvent.click(getByRole("button", { name: "Retry" }));
    await wait(50);
    const calls = (tasksApi.list as ReturnType<typeof mock>).mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("Retry success transitions error → populated", async () => {
    let calls = 0;
    tasksApi.list = mock(() => {
      if (calls++ === 0) {
        return Promise.reject(new TasksApiError({ status: 500, message: "boom" }));
      }
      return Promise.resolve([
        mockTask({ id: "0193f000-0000-7000-8000-000000000099", text: "recovered" }),
      ]);
    });
    const client = makeClient();
    const { getByRole, getByText, queryByText } = renderWithClient(client, () => <TaskList />);

    await wait(50);
    expect(getByText("Couldn't load tasks — check connection.")).toBeDefined();
    fireEvent.click(getByRole("button", { name: "Retry" }));
    await wait(100);
    expect(getByText("recovered")).toBeDefined();
    expect(queryByText("Couldn't load tasks — check connection.")).toBeNull();
  });
});
```

Notes:

- `wait(50)` is sufficient for the rejection to flush through TanStack's microtasks under happy-dom (`makeClient` already sets `queries.retry: false`). If flake appears, bump to `wait(100)` or replace with `waitFor(() => container.textContent?.includes("Couldn't"))`.
- `mock.calls.length >= 2` is preferred over `=== 2` because TanStack's internal observer invalidation may add a third call under heavy reactivity.
- The "Retry success" test's `mockTask` import — already present at the top of the file.
- The existing `assertNoBlockingAxeViolations(container)` helper (defined at the top of `TaskList.test.tsx`) is reused.

### `queries.test.tsx` Reconnect Test Sketch

```tsx
// apps/web/src/data/queries.test.tsx (inside describe("useTasks") block)
it("auto-refetches when the browser fires `online` (refetchOnReconnect contract)", async () => {
  let calls = 0;
  tasksApi.fetch = mock(() => {
    calls++;
    if (calls === 1) {
      return Promise.reject(new TasksApiError({ status: 500, message: "boom" }));
    }
    return Promise.resolve({
      data: [mockTask({ id: "0193f000-0000-7000-8000-0000000000aa", text: "recovered" })],
      error: null,
    });
  });
  const client = makeMutationClient(); // queries default retry stays at 0 via the helper
  let snapshot: { isError: boolean; data: Task[] | undefined } = {
    isError: false,
    data: undefined,
  };
  const Probe = (): JSX.Element => {
    const query = useTasks();
    createEffect(() => {
      snapshot = { isError: query.isError, data: query.data };
    });
    return <div data-testid="probe" />;
  };
  renderWithClient(client, () => <Probe />);

  await waitFor(() => (snapshot.isError ? true : undefined));
  expect(snapshot.isError).toBe(true);

  // The browser dispatches `online` when the network returns; TanStack's
  // onlineManager listens to this event and refetches every active query
  // configured with `refetchOnReconnect: true`.
  window.dispatchEvent(new Event("online"));

  await waitFor(() =>
    snapshot.data && snapshot.data.length > 0 && snapshot.data[0]?.text === "recovered"
      ? true
      : undefined,
  );
  expect(snapshot.isError).toBe(false);
});
```

Notes:

- `makeMutationClient` already configures `queries: { retryDelay: 0 }` and `mutations: { retry: false }`. Verify the queries `retry` is also `0` by reading `queries.test.tsx`'s helper; if not, override with `defaultOptions.queries.retry: 0`.
- If `window.dispatchEvent(new Event("online"))` does not trigger TanStack's onlineManager under happy-dom, fall back to:
  ```ts
  import { onlineManager } from "@tanstack/solid-query";
  onlineManager.setOnline(false);
  // ... wait for isError ...
  onlineManager.setOnline(true);
  ```
  The architecture's chosen approach is the dispatch-on-window route because it mirrors the production wire. Document the choice as a deviation if the dispatch path doesn't work.

### `e2e/empty-error-states.spec.ts` Sketch

```ts
// e2e/empty-error-states.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ERROR_UI_TIMEOUT_MS = 5_000;
const SLOW_GET_DELAY_MS = 600;

const failingGetRoute = async (
  page: Page,
  status: number = 503,
  code: string = "service_unavailable",
): Promise<void> => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code, message: "test-induced" },
          requestId: "test",
        }),
      });
      return;
    }
    await route.continue();
  });
};

test("inline list-level error renders when the GET fails repeatedly", async ({ page }) => {
  await failingGetRoute(page);
  await page.goto("/");

  // No white-screen — TaskInput is mounted independently of the list.
  await expect(page.getByLabel("New task")).toBeVisible();

  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("Retry click re-attempts the GET and clears the error UI on success", async ({ page }) => {
  await failingGetRoute(page);
  await page.goto("/");
  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });

  // Release the route and let Retry hit the real backend.
  await page.unroute("**/api/tasks");
  await page.route("**/api/tasks", (route) => route.continue());

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Couldn't load tasks — check connection.")).toHaveCount(0, {
    timeout: 5_000,
  });
});

test("EmptyState renders when GET resolves with [] (FR4)", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("No tasks yet. Start by typing above.")).toBeVisible();
});

test("LoadingState renders skeleton rows during a slow GET (FR5)", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") {
      await new Promise((resolve) => setTimeout(resolve, SLOW_GET_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator('[data-testid="skeleton-row"]')).toHaveCount(3, { timeout: 1_000 });
  await expect(page.locator('[data-testid="skeleton-row"]')).toHaveCount(0, { timeout: 5_000 });
});

test("error state has zero critical/serious axe-core violations (NFR-A1)", async ({ page }) => {
  await failingGetRoute(page);
  await page.goto("/");
  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
});

test("reconnect recovery — `online` event clears the error and populates the list", async ({
  page,
}) => {
  await failingGetRoute(page);
  await page.goto("/");
  await expect(page.getByText("Couldn't load tasks — check connection.")).toBeVisible({
    timeout: ERROR_UI_TIMEOUT_MS,
  });

  await page.unroute("**/api/tasks");
  await page.route("**/api/tasks", (route) => route.continue());
  // Dispatch `online` to fire TanStack's reconnect refetch (refetchOnReconnect: true).
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page.getByText("Couldn't load tasks — check connection.")).toHaveCount(0, {
    timeout: 5_000,
  });
});
```

Notes:

- The `failingGetRoute` helper centralizes the route-stub pattern. Each test starts with a clean route map; the helper only stubs GET and continues all other methods.
- The 5 s timeout for "error UI visible" accommodates the production retry config (2 retries with exponential backoff ≈ 1 + 2 = 3 s before isError).
- The reconnect test uses `page.evaluate(() => window.dispatchEvent(...))` rather than Playwright's `page.context().setOffline(...)` because the latter requires Playwright 1.50+ network-state APIs and may not fire `online` reliably under all browsers; the dispatch path is mirror-true to the production wire.
- The `LoadingState` test's `data-testid="skeleton-row"` selector is the existing `LoadingState.tsx` data-testid (Story 1.7 wired this).

### Previous Story Intelligence (Stories 1.5 + 1.6 + 1.7 + 1.8 + 1.9 carryover)

**Story 1.5 (frontend foundation):**
- `<QueryClientProvider client={queryClient}>` wraps `<App />` in `index.tsx`. `useQueryClient()` accesses the same singleton.
- `<LiveRegion />` mounted exactly once at `index.tsx`. **Untouched in this story.**
- `<ErrorBoundary>` catches render errors only — not query/mutation errors. Story 1.10's fetch error is a *data* error, not a render error; ErrorBoundary does not catch it.
- Reduced-motion CSS reset (Story 1.5 deferred-work item; addressed in Story 1.9 as `animation: none`) applies globally; this story introduces no new motion.

**Story 1.6 (TaskInput):**
- `apps/web/src/components/TaskInput.tsx` is mounted at the top of `<App />` (sibling to `<TaskList />`). **Independent of `TaskList` — when `TaskList` shows the fetch-error UI, `TaskInput` is still mounted and focused.** The page does not white-screen even under fetch failure. **Do not modify** `TaskInput.tsx`.

**Story 1.7 (TaskList):**
- `apps/web/src/components/TaskList.tsx` consumes `useTasks` and renders the four list states. **This story extends the `<Show>` chain with the `query.isError` arm.** The 200 ms `LOADING_DELAY_MS` gate, `showLoading()` signal, `createEffect` + `onCleanup` are all preserved verbatim.
- The existing `<Show when={!query.error}>` guard is *replaced* by the new chained-fallback structure. The previous behavior under error was "render nothing" (the fallback was empty); the new behavior is "render `ListFetchError`". This is the FR6 feature gap the story closes.
- `EmptyState` and `LoadingState` are untouched. The `LoadingState`'s `data-testid="skeleton-row"` is consumed by Playwright tests; preserved here.
- The Story 1.7 deferred-work item ("FR6 list-level error UX is the right place for richer envelope unwrapping") is addressed by AC #2 + AC #3 — the error UI consumes the typed `TasksApiError` thrown by `tasksApi.list` (Story 1.9 made this typed).

**Story 1.8 (optimistic capture):**
- `useCreateTask` posts to `/api/tasks`; failures surface as **per-row** sync state (Story 1.9), not list-level. **The list-level error UI does not interact with the per-row sync state.** A list-level fetch error means the GET failed; per-row sync state attaches to optimistic rows. Both can be present simultaneously (the user typed a task, the optimistic row is in the cache, the cache is in error state from a stale GET) — the `query.data` will be the optimistic-prepended array. The `query.isError` arm of TaskList renders the inline error *without* the optimistic row when the cache state is `error` and `data` is `undefined`. If the user retries successfully, the populated arm renders and the optimistic row is reconciled.
- **Edge case:** if the optimistic row is in the cache *and* the GET subsequently errors, TanStack v5 retains the prior `data` while `isError` is `true` (status: "error", data: prior). This story renders the error UI in that case — which would visually drop the optimistic row from the user's view. **Acceptable trade-off:** a fetch error means the user's view of the world is unreliable; honoring the error state takes precedence over preserving the optimistic UI. The optimistic row is still in the cache and re-appears when Retry succeeds. Document this in the Dev Agent Record.

**Story 1.9 (sync-pending + retry-exhausted):**
- `LiveRegion` queue + `mounted` sentinel + `__getLiveRegionHistoryForTests` rewrite is in place. **Untouched in this story.** Do not call `LiveRegion.announce(LIST_FETCH_ERROR_COPY)` — the visible UI is the channel; the global LiveRegion is reserved for state changes that lack a visible landing point.
- `captureSyncStore` and `useCreateTask` are untouched.
- The Story 1.9 deferred-work item "300 ms pending timer fires during exponential-backoff sleep" is **out of scope** for this story (it's a per-row-sync concern, not a list-level concern).
- `TasksApiError` is the typed thrown error from `tasksApi.list`; this story consumes it (the test uses `new TasksApiError({ status: 500, message: "boom" })`).

### Git Intelligence Summary (recent commits)

- `f91fb15 Story 1.9` — sync-pending indicator + retry-exhausted state + LiveRegion queue + retry policy. **Most relevant precedent.** This story extends the surface 1.9 introduced (TaskList's four-state matrix gets its fourth arm; `announcements.ts` gets a fourth constant; the test patterns from 1.9's queries.test.tsx and TaskRow.test.tsx are templates for this story's TaskList.test.tsx and queries.test.tsx additions).
- `9223923 Story 1.8` — `useCreateTask` mutation hook, `tasksApi.create` envelope. The optimistic-row + cache-state interaction is documented in the Story 1.8 hand-off (see "Story 1.8 (optimistic capture)" section above).
- `7e7e00e Story 1.7` — `useTasks` query hook, four-state TaskList, TaskRow active-state rendering, XSS regression. The TaskList three-state Show chain is the foundation this story extends.
- `30def48 Story 1.6` — TaskInput component + happy-dom test setup. The happy-dom infrastructure is the foundation for the new TaskList tests.
- `1692502 Story 1.5` — frontend foundation. `<QueryClientProvider>` + `<LiveRegion />` + `<ErrorBoundary>` mount layout. UUIDv7 generator. The `refetchOnReconnect: true` config first appeared in `useTasks` here (carried through to Story 1.7's full config).

### File Structure Requirements

**Create:**

```text
e2e/empty-error-states.spec.ts                        # AC #12
```

**Modify:**

```text
apps/web/src/data/announcements.ts                    # add LIST_FETCH_ERROR_COPY
apps/web/src/components/TaskList.tsx                  # add ListFetchError sub-component + isError arm
apps/web/src/components/TaskList.test.tsx             # add describe("TaskList fetch error state") with 4 tests
apps/web/src/data/queries.test.tsx                    # add reconnect-recovery test inside describe("useTasks")
```

**Do not modify** without strong cause:

```text
apps/web/src/index.tsx                                # QueryClient + LiveRegion mount is correct
apps/web/src/App.tsx                                  # composition is correct (TaskInput + TaskList)
apps/web/src/data/queries.ts                          # useTasks config is architecture-locked
apps/web/src/data/api.ts                              # TasksApiError class is correct as-is
apps/web/src/components/TaskInput.tsx                 # Story 1.6 contract; do not touch
apps/web/src/components/TaskInput.test.tsx            # Story 1.6 tests
apps/web/src/components/TaskRow.tsx                   # Story 1.7 / 1.9 contract; do not touch
apps/web/src/components/TaskRow.test.tsx              # Story 1.7 / 1.9 tests
apps/web/src/components/TaskRow.css                   # Story 1.9 contract
apps/web/src/components/EmptyState.tsx                # no change
apps/web/src/components/LoadingState.tsx              # no change
apps/web/src/components/LiveRegion.tsx                # Story 1.9 queue contract; do not touch
apps/web/src/components/LiveRegion.test.tsx           # Story 1.9 tests
apps/web/src/components/ErrorBoundary.tsx             # render errors only — fetch errors are a different surface
apps/web/src/data/captureSyncStore.ts                 # Story 1.9 contract
apps/web/src/data/captureSyncStore.test.ts            # Story 1.9 tests
apps/web/src/data/retryAfter.ts                       # Story 1.9 contract
apps/web/src/data/retryAfter.test.ts                  # Story 1.9 tests
apps/web/src/data/uuid.ts                             # Story 1.5 contract
apps/web/src/data/keys.ts                             # tasksQueryKey is correct
apps/web/src/styles/tokens.css                        # token set is complete
apps/web/src/styles/reset.css                         # reduced-motion reset is correct
apps/web/uno.config.ts                                # token rules are correct
apps/api/**                                           # backend untouched
e2e/smoke.spec.ts                                     # baseline boot-and-focus
e2e/capture.spec.ts                                   # Story 1.8's spec — must continue to pass
e2e/error-recovery.spec.ts                            # Story 1.9's spec — must continue to pass
playwright.config.ts                                  # config is correct
bunfig.toml                                           # test preload is correct
package.json (root) and apps/web/package.json         # no new deps
```

### Architecture Boundaries Reaffirmed

- **API boundary:** `Task` and the GET response shape flow from `apps/api/src/routes/tasks.ts` → `@bmad-todo-app/api` → `apps/web/src/data/api.ts` (Eden + `TasksApiError`) → `apps/web/src/data/queries.ts` (`useTasks`) → `TaskList.tsx`. **No runtime backend code crosses this boundary.** `import type` for `Task`.
- **Component-↔-data boundary:** `TaskList` consumes `useTasks` only; never `tasksApi.*` directly. `ListFetchError` consumes the `onRetry` callback only — it does not access `query.refetch` directly. The button's onClick handler in `ListFetchError` is opaque to the data layer.
- **Storage boundary:** untouched — backend is unchanged.
- **Configuration boundary:** untouched — no env access added.

### Anti-Patterns to Avoid

- **Do not** add a top-level banner, modal, toast, or page-background change for the fetch-error state. UX-DR17 forbids these. The error UI is **inline within the list area**, exactly where the data was supposed to render. Failure is spatially co-located with where the user expected the data.
- **Do not** apply `--color-status-error` (red) to the fetch-error copy. The architecture's voice rule is "be honest, be quiet" — red is reserved for the row-level retry-exhausted state where the user's typed input is at risk. A list-level fetch error is "still trying, here's what to do," not "data is at risk." Use `--color-text-secondary` (neutral grey).
- **Do not** add `role="alert"` or `aria-live` to the inline error `<p>`. The error UI has a **visible landing point** (the rendered text); ARIA-live is reserved for state changes that lack a visible landing point. Adding `role="alert"` would cause SR users to be interrupted on every render.
- **Do not** call `LiveRegion.announce(LIST_FETCH_ERROR_COPY)`. The visible UI is the announcement channel for state changes with a visual landing. Per-row retry-exhausted (Story 1.9) does announce because it transitions from a silent fast-path; the list-level fetch error renders directly into the existing list area, no transition.
- **Do not** add a manual `window.addEventListener("online", () => query.refetch())`. TanStack Query's `onlineManager` already does this via `refetchOnReconnect: true` (Story 1.7 locked the config). Doubling the wire produces two refetches per `online` event.
- **Do not** override `useTasks`'s `retry: 2` config to a function-form retry. The architecture's locked default for queries is a numeric retry; the function form is reserved for mutations (Story 1.9 introduced it for `useCreateTask`). Mixing the two complicates the config and produces inconsistent retry behavior across query and mutation paths.
- **Do not** wire `ListFetchError` to call `query.refetch()` directly via the imported `useTasks` accessor. The `onRetry` callback indirection preserves the component-↔-data boundary (`ListFetchError` is a presentational component; `TaskList` is the data-aware container).
- **Do not** memoize the `ListFetchError` body with `createMemo` — it has no expensive computation; the conditional render is cheap.
- **Do not** add an entrance animation, fade-in, or transition to `ListFetchError`. UX-DR16's `motion.instant` extends to error UI; the state shift is instantaneous.
- **Do not** add a "Dismiss" or "Cancel" affordance to the error state. The user's only options are: click Retry, type a new task into TaskInput (which is still focused — Story 1.6 contract — and works regardless of GET state, since POST is independent of GET), or close the tab. Adding a Dismiss button would require deciding what state to render after dismiss (empty? optimistic-only? old cached data?) — all bad UX. The retry/wait-for-online wire is the only recovery path.
- **Do not** add a "loading" indicator inside the `ListFetchError` while `query.isFetching === true` (i.e., during a Retry-triggered refetch). The state shift is fast enough that the user does not need a transient indicator; the error UI staying in place during the in-flight retry is acceptable, and once the retry settles the populated/empty arm renders. (If a future product spec adds a "Retrying…" indicator, that's a separate story.)
- **Do not** generate a new request-id, override headers, or add backend-specific request shaping in the Retry click handler. The `query.refetch()` call uses the same `queryFn` (`tasksApi.list`) with the same Eden-driven request shape; the server sees a fresh GET indistinguishable from the original.
- **Do not** add `data-testid="..."` to `ListFetchError`'s `<p>` or `<button>`. The project's anti-pattern from Story 1.7 holds; `getByText` and `getByRole` cover the assertions.
- **Do not** use a hyphen-minus `-` in `"Couldn't load tasks — check connection."`. Em-dash `—` (U+2014) is the spec, per UX-DR22 and consistent with the row-level `LIVE_REGION_RETRY_EXHAUSTED` constant.
- **Do not** localize, translate, or pluralize the copy. The project ships English-only at MVP; i18n is a Vision-phase concern.
- **Do not** modify `e2e/smoke.spec.ts`, `e2e/capture.spec.ts`, or `e2e/error-recovery.spec.ts`. They are baseline / Story 1.8 / Story 1.9 specs.
- **Do not** modify `apps/api/**`. Backend is fully untouched.

### Project Structure Notes

The story aligns with the architecture's frontend layout (`apps/web/src/components/TaskList.tsx`, `apps/web/src/data/announcements.ts`, `apps/web/src/data/queries.ts`, `e2e/empty-error-states.spec.ts`).

**Constant placement decision** — `LIST_FETCH_ERROR_COPY` lives in `announcements.ts` even though it is **not** announced via `LiveRegion`. Rationale: a single file owns all user-facing copy strings under FR-related state changes; a future i18n string-table extraction targets this file. Alternative: a new `apps/web/src/data/errorMessages.ts` for non-announced error copy. **Prefer `announcements.ts`** for now to keep the surface area small; document if you choose differently.

**Sub-component placement decision** — `ListFetchError` is co-located inside `TaskList.tsx` (function declaration below the `TaskList` export). Rationale: it is used by exactly one parent (TaskList); the project's "sub-components used by one parent are co-located" rule from `apps/web/src/components/TaskRow.tsx` applies. **Prefer co-location**; do not extract to a sibling `ListFetchError.tsx` file unless it grows beyond ~30 lines or gains independent tests.

**CSS placement decision** — All styling for `ListFetchError` is via UnoCSS utility classes (token-backed). **No new CSS file is needed.** If UnoCSS does not recognize one of the classes (`text-body-strong`, `text-token-accent-default`, etc.), either add the rule to `apps/web/uno.config.ts` (preferred — the rule generalizes) or fall back to a colocated `TaskList.css` (mirror Story 1.9's `TaskRow.css` pattern). Document the choice as a deviation if a CSS file is added.

`e2e/empty-error-states.spec.ts` is the fourth of the five Playwright specs the architecture's `project-structure-boundaries.md` lists (`capture.spec.ts | manage.spec.ts | keyboard.spec.ts | error-recovery.spec.ts | empty-error-states.spec.ts`). Story 1.10 brings the count from three to four; Stories 2.x / 3.x / 4.x will fill out `manage.spec.ts` and `keyboard.spec.ts`.

The four-state TaskList rendering matrix is now exhaustive: loading / empty / populated / error. Future work that adds a fifth state (e.g., a "stale data" warning, a "syncing" overlay) must extend the `<Show>` chain explicitly and document the precedence — the current chain has the *error* arm as the outer guard so error supersedes loading / populated / empty. Document this rule for future story authors in the Dev Agent Record.

### Testing Requirements

- **Unit test runner:** `bun:test`. Idiom: `describe(...)` + `it(...)`.
- **Component testing library:** `@solidjs/testing-library`. `render`, `cleanup`, `fireEvent`. `cleanup()` in `afterEach` (already wired).
- **DOM:** real DOM via the happy-dom registrator preload (Story 1.6 wired).
- **Test invocation:** `bun run test` (root script — `bun test apps --conditions=browser`).
- **TanStack Query test client:** each `it()` constructs a fresh `QueryClient` via `makeClient()` (zero-retry queries) or `makeMutationClient()` (zero-retry mutations + zero retryDelay queries). Both helpers already exist.
- **Stub seams:**
  - `tasksApi.list = mock(...)` (and restore in `afterEach` — already wired in `TaskList.test.tsx` and `queries.test.tsx`'s `useTasks` block).
  - `tasksApi.fetch = mock(...)` for tests that need to drive specific HTTP statuses through the envelope-parsing path (already wired in the `useTasks` describe block).
  - `client.cancelQueries = mock(...)` and `client.invalidateQueries = mock(...)` per-test — not needed for this story's tests, but the seam is there if a future test needs it.
- **Probe component pattern:** mirror Story 1.7 / 1.8 / 1.9's `Probe`; capture the query state via `createEffect(() => snapshot = { ... })` inside the component.
- **Real timers, not fake timers:** Bun's test runner does not ship fake timers preconfigured. Use real `setTimeout`-based `await new Promise(r => setTimeout(r, ms))` for time-based assertions. The `wait(ms)` helper in `TaskList.test.tsx` already does this.
- **Coverage target:** ≥ 90 % statements on `components/TaskList.tsx` (the new fourth arm closes the matrix). 4 new TaskList component tests + 1 new useTasks reconnect test cover the surface.
- **Playwright:** chromium / firefox / webkit projects (already configured). `webServer` runs `bun run dev` automatically. `AxeBuilder` from `@axe-core/playwright` (already a root devDep). Use `page.getByText("Couldn't load tasks — check connection.")`, `page.getByRole("button", { name: "Retry" })`, `page.getByLabel("New task")` — never CSS selectors when an accessibility query works (consistent with Story 1.5's accessibility-first posture, except for the existing `[data-testid="skeleton-row"]` selector for `LoadingState`).
- **Network stubbing in Playwright:** `await page.route("**/api/tasks", async (route) => { ... })`. Stub before `page.goto`. Use `page.unroute(...)` to clear the interception mid-test for the retry-recovery scenario.
- **Cross-browser timing-window margin:** the 5 s timeout for "error UI visible" accommodates TanStack v5's exponential backoff (≈ 1 + 2 = 3 s for 2 retries). webkit may exhibit additional jitter; if flaky, bump to 7 s.
- **No regression on Stories 1.5–1.9 tests:** all 186 existing tests must continue to pass. The new tests are additive.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.10-List-Level-Fetch-Error-State-and-Reconnection-Recovery] — story statement and BDD acceptance criteria.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty-Loading-Error-State-Patterns] — list-level fetch error UX-DR17: inline within the list area, one neutral line of copy, a Retry affordance, never a modal, never a red page background.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component-strategy-TaskList] — TaskList "error (fetch failed)" state: inline list-level error per FR6, message within the list area, not a modal, with a retry affordance.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Content-and-voice-rules] — em-dash, sentence case, no marketing copy, no apology, error copy names the failed operation and suggests a next action.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — silent success; row-local failure; LiveRegion announces transitions, once. The list-level fetch error has a visible landing point and is therefore *not* announced via LiveRegion.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-4-Error-recovery] — fetch failure recovery flow; user clicks Retry; reconnection auto-recovers.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D7---Server-state-cache-tanstack-solid-query] — `useTasks` config: `retry: 2`, `refetchOnReconnect: true`, `staleTime: Infinity`, `gcTime: Infinity` (ARCH-AR11).
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#TanStack-Solid-Query-rules] — query keys are hierarchical arrays; one queryFn per query key; no useSuspenseQuery at MVP.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules] — never destructure component props; primitive signals as destructured tuple; effects only when reactive computation is needed.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Anti-Patterns-forbidden] — no inline SQL, no `any`, no `console.log`, no magic numbers, no default exports.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Cross-Cutting-NFR-Locations] — NFR-M2 five Playwright specs; this story adds `e2e/empty-error-states.spec.ts`.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Requirements-to-Structure-Mapping] — FR4–FR6 location map: TaskList for list-level error.
- [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements] — FR4 (empty state), FR5 (loading state), FR6 (list-level fetch error with retry), FR19 (visible focus on every focusable element).
- [Source: _bmad-output/implementation-artifacts/1-9-sync-pending-indicator-and-retry-exhausted-state-for-capture.md#Dev-Agent-Record] — `LiveRegion` queue + history + mounted sentinel; `__captureSyncStorePeek` non-reactive read; `TasksApiError` constructor pattern; `announcements.ts` constant placement; `data-testid` minimization rule.
- [Source: _bmad-output/implementation-artifacts/1-7-task-list-display-tasklist-taskrow-active-state-emptystate-loadingstate.md#Dev-Agent-Record] — TaskList three-state Show chain (this story extends to four); 200 ms `LOADING_DELAY_MS` gate; `LoadingState` `data-testid="skeleton-row"`; `EmptyState` typography pattern.
- [Source: _bmad-output/implementation-artifacts/1-8-optimistic-task-creation-happy-path.md#Dev-Agent-Record] — `tasksApi.fetch` / `tasksApi.list` mutable seam (deviation #2 carryover); `mockTask` helper; `Date.now()`-stamped E2E texts (deviation #5 carryover).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred-from-1-7-...] — Story 1.7 deferred-work item: "FR6 list-level error UX is the right place for richer envelope unwrapping" — addressed by this story's consumption of typed `TasksApiError`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Opus 4.7, 1M context)

### Debug Log References

- Initial unit-test run timed out on the new `TaskList fetch error state` describe block — `useTasks` locks `retry: 2` per-query, so the existing `makeClient` (with only `retry: false` in defaultOptions) couldn't override it. The 3 calls fired with default exponential backoff (~3 s) exceeding the 1 s waitFor. Fixed by adding `retryDelay: 0` to `makeClient`'s defaultOptions; per-query `retry: 2` still applies but the sleeps collapse to 0.
- Reconnect unit test initially used `window.dispatchEvent(new Event("online"))` per the AC sketch. Failed under happy-dom because TanStack's `onlineManager` only refetches on a true offline → online transition; dispatching `online` while already online is a no-op. Switched to the AC's documented fallback: `onlineManager.setOnline(false)` → `onlineManager.setOnline(true)` cycle. The first `setOnline(true)` after the offline prime ensures the initial fetch fires; the second offline → online cycle exercises the reconnect refetch wire.
- Reconnect e2e test exhibited the same no-transition behavior under Chromium with `window.dispatchEvent`. Switched to `context.setOffline(true)` then `context.setOffline(false)`, which Playwright fires as native browser online/offline events — onlineManager picks up the transition correctly across chromium/firefox/webkit.

### Completion Notes List

- **FR6 closed.** TaskList renders an inline `ListFetchError` (single `<p>` of copy + native `<button type="button">Retry</button>`) inside `task-list-region` whenever `query.isError === true`. Error state appears only after `useTasks`'s locked `retry: 2` exhausts; the existing 200 ms loading gate, EmptyState, and populated arms are preserved verbatim.
- **Four-state matrix is now exhaustive and non-overlapping.** Outer `<Show when={!query.isError}>` is the precedence guard; loading / populated / empty arms only render when `!isError`. Future story authors must extend this chain explicitly if introducing a fifth state.
- **Reconnect recovery is wire-only.** No new event listeners. TanStack Query's `onlineManager` (already wired by `refetchOnReconnect: true` in `useTasks` since Story 1.7) handles the browser `online` event and refetches the failed query. Verified by the new unit test (`onlineManager.setOnline()` cycle) and the new e2e test (`context.setOffline()` cycle).
- **Copy is the constant `LIST_FETCH_ERROR_COPY`** in `announcements.ts` — single source of truth for FR-state copy. Em-dash U+2014, sentence case, no apology, names "load" + "check connection" — same voice contract as the Story 1.9 row-level retry-exhausted copy. Not announced via `LiveRegion` (visible landing point owns the channel).
- **190 unit tests pass** (was 186; +3 TaskList component tests + 1 useTasks reconnect test). Coverage 97.81 % funcs, 96.81 % lines (TaskList.tsx now at 100 % / 100 %).
- **18 Playwright tests pass cross-browser** (chromium / firefox / webkit) on the new `e2e/empty-error-states.spec.ts`. Existing 30 tests on smoke/capture/error-recovery continue to pass cross-browser. One transient failure observed during a parallel-worker run of the full suite was the pre-existing `error-recovery.spec.ts:72` listitem-count race against the shared dev DB (Story 1.9 deviation #5 territory) — not introduced by this story; reproduces as 0/4 fail when the spec is run in isolation.
- **Bundle size unchanged at the budget level.** Main chunk: 26.69 KB gz (Story 1.9 baseline) → 26.85 KB gz (this story). Δ ≈ 0.16 KB gz, well under the 1 KB estimate and the 100 KB NFR-P1 ceiling.
- **No new dependencies, no backend changes, no new tokens.** All token references resolve through existing `--text-body-*`, `--text-body-strong-*`, `--color-text-secondary`, `--color-accent-default`, `--radius-sm`, `--space-*` custom properties (light + dark mode parity already wired by Story 1.5).

#### Deviations from the AC sketch

1. **`text-body-strong` utility class added to `apps/web/src/styles/reset.css`.** The token CSS custom properties (`--text-body-strong-size/weight/line-height`) already existed (Story 1.5), but no class consumed them. Added a single rule paralleling `.text-body` in the same file. Alternative considered: a colocated `TaskList.css` mirroring `TaskRow.css`. Chose reset.css because it kept the typography utilities centralized and matches where the existing `.text-body` lives. AC #2 explicitly permitted either path.
2. **`outline-token-*` UnoCSS rule added to `apps/web/uno.config.ts`.** Mirrors the existing `text-token-*`, `bg-token-*`, `border-token-*` patterns. Required for `focus-visible:outline-token-accent-default` to resolve. The pattern generalizes — any future component needing token-driven outline colors gets it for free.
3. **Reconnect unit test uses `onlineManager.setOnline()` instead of `window.dispatchEvent("online")`.** AC-documented fallback (story §Task 4). The dispatch path is a no-op when onlineManager's internal state is already online; an offline → online transition is required to fire listeners. The production wire is still exercised because the same listener path on onlineManager is invoked.
4. **Reconnect e2e test uses `context.setOffline(true) / setOffline(false)` cycle instead of `page.evaluate(() => window.dispatchEvent("online"))`.** Same root cause as deviation 3, observed in real Chromium too. Playwright's `setOffline` fires native browser `online`/`offline` events via CDP, which is what onlineManager listens to. Cross-browser verified (chromium / firefox / webkit).
5. **`makeClient` in `TaskList.test.tsx` now sets `retryDelay: 0`** alongside `retry: false`. `useTasks`'s per-query `retry: 2` overrides the default `retry: false`, so the test client must collapse the unavoidable 3 calls' backoff to 0 ms. No existing test was affected.
6. **Error-state test count: 3 component tests, not 4.** The AC enumerated four cases (renders, retry click, axe-clean, retry success). The first test (`renders the inline error copy and Retry button`) folds in the axe-clean assertion via the existing `assertNoBlockingAxeViolations(container)` helper — the error UI is fully mounted at that point and a separate test would exercise the same surface. Coverage on the error arm is 100 %.

### File List

Modified:

- `apps/web/src/data/announcements.ts` — added `LIST_FETCH_ERROR_COPY` constant + glyph-reminder note.
- `apps/web/src/components/TaskList.tsx` — added `query.isError`-first outer `<Show>` arm; co-located `ListFetchError(props: { onRetry: () => void })` sub-component below `TaskList`.
- `apps/web/src/components/TaskList.test.tsx` — added `describe("TaskList fetch error state")` with 3 cases (renders + axe; Retry re-invokes; Retry success); added `retryDelay: 0` to `makeClient` defaults; imported `fireEvent` and `TasksApiError`.
- `apps/web/src/data/queries.test.tsx` — added `it("auto-refetches and clears the error state when the network transitions back to online ...")` inside `describe("useTasks")`; imported `onlineManager` from `@tanstack/solid-query`.
- `apps/web/src/styles/reset.css` — added `.text-body-strong` rule paralleling `.text-body`.
- `apps/web/uno.config.ts` — added `outline-token-*` regex rule paralleling `text-token-*` / `bg-token-*` / `border-token-*`.

Created:

- `e2e/empty-error-states.spec.ts` — 6 Playwright tests: inline error renders, Retry click clears error, EmptyState on `[]`, LoadingState skeletons on slow GET, axe-clean, reconnect via `context.setOffline()` cycle.

### Review Findings

Code review run on 2026-05-01 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Auditor verdicts: 16/18 ACs ✅ honored, 1 ⚠️ partial (AC #10 — 3 tests instead of 4, axe folded into renders test, accepted per Dev Agent Record deviation #6), 3 ❓ external-tool gates (#14 bundle, #15 coverage, #16 regression — verified by Dev Agent Record). No anti-pattern violations introduced.

- [x] [Review][Patch] Reset `onlineManager` state in an `afterEach` so an early-failing reconnect test cannot leave the singleton stuck offline for subsequent tests in this file or imported suites [apps/web/src/data/queries.test.tsx:198-224]
- [x] [Review][Patch] Reconnect e2e test only asserts the error copy disappears — add a positive assertion (e.g. `EmptyState` text or a populated row) so a hung GET that never resolves cannot satisfy the test by virtue of `query.isError` flipping to `false` on refetch start [e2e/empty-error-states.spec.ts:96-121]
- [x] [Review][Patch] "Retry click re-attempts the GET" e2e test similarly asserts only that the error copy is gone; add a positive assertion to confirm actual recovery rather than transient state [e2e/empty-error-states.spec.ts:41-55]
- [x] [Review][Defer] No loading affordance during the ~3 s in-flight retry chain after a Retry click; rapid clicks are de-duplicated by TanStack but the user gets no visible feedback [apps/web/src/components/TaskList.tsx:24] — deferred, AC #17 anti-pattern explicitly forbids `isFetching` indicator inside `ListFetchError`; revisit when product asks for a "Retrying…" affordance
- [x] [Review][Defer] When Retry succeeds, the unmounting button drops focus to `<body>` instead of restoring focus to TaskInput; no test covers this transition [apps/web/src/components/TaskList.tsx:48-54] — deferred, focus-restoration not in story scope, candidate for Story 4.x keyboard work
- [x] [Review][Defer] Optimistic rows in cache become invisible while `isError` is true and unrecoverable through the per-row UI (rows are unmounted) [apps/web/src/components/TaskList.tsx:24] — deferred, acknowledged as acceptable trade-off in spec §"Story 1.8 (optimistic capture)" carryover, line ~609
- [x] [Review][Defer] e2e tests run under `fullyParallel: true` against a shared dev DB; the EmptyState assertion can race against rows created by `capture.spec.ts` running in parallel [e2e/empty-error-states.spec.ts] — deferred, pre-existing pattern from Stories 1.8/1.9 (Story 1.9 deviation #5)

Notes (dismissed but worth recording):

- The `outline-token-*` UnoCSS rule sets only `outline-color`; `outline-style` cascades from the global `:focus-visible` shorthand in `reset.css` (lower specificity but unopposed for the style property). Manual + e2e axe verification confirmed the focus ring renders correctly. Fragile-but-working; if a future utility ever sets `outline-style: none`, the focus ring would silently break.
- `tasksApi.list` (TaskList tests) vs `tasksApi.fetch` (queries tests) is the established Story 1.7+ seam pattern — `useTasks` calls `tasksApi.list()` per `apps/web/src/data/queries.ts:65`; envelope-level tests stub `tasksApi.fetch`, post-envelope tests stub `tasksApi.list`. Not a defect.
- `--text-body-strong-*` tokens are pre-existing in `apps/web/src/styles/tokens.css:30-32` (light) and inherited via dark-mode `:root` overrides; the new `.text-body-strong` class is safe.
- `retryDelay: 0` in `TaskList.test.tsx`'s `makeClient` is the load-bearing override for collapsing `useTasks`'s locked `retry: 2` exponential backoff in tests; `retry: false` is effectively a no-op for `useTasks` (per-hook `retry: 2` overrides client default) but applies to other tests' queries. Working as intended.
- The recovery test's mock counter pattern (`if (calls++ < 3)` post-increment vs `if (calls <= 3)` pre-increment) is correct in both files; the differing comments use 0-indexed vs 1-indexed phrasings but the resulting call sequences (3 failures + 1 success) match the production retry chain.

## Change Log

| Date       | Change                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| 2026-05-01 | Story 1.10 context engineered; status `backlog` → `ready-for-dev`. |
| 2026-05-01 | Story 1.10 implemented (TaskList ListFetchError + reconnect recovery + e2e suite); status `ready-for-dev` → `review`. |
| 2026-05-01 | Story 1.10 code review complete (3 patches applied, 4 deferred, ~25 dismissed); status `review` → `done`. |
