# Story 1.9: Sync-Pending Indicator and Retry-Exhausted State for Capture

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my created task to clearly indicate when it hasn't yet synced and to surface a clear, actionable error if retries exhaust,
so that I can trust the app to never silently lose my data.

## Acceptance Criteria

1. **Retry policy on `useCreateTask` follows the architecture-locked schedule (FR24, ARCH-AR11)** — `apps/web/src/data/queries.ts`'s `useCreateTask` is extended with `retry` (function form) and `retryDelay` (function form). The `retry` function returns `true` to keep retrying based on the failed-request HTTP status: `429` → up to **4** attempts (i.e. `failureCount < 4`); `5xx` (500–599) → up to **3** attempts (i.e. `failureCount < 3`); every other 4xx → fail-fast (return `false` on first failure). Network errors with no associated status (e.g. `fetch` rejection, DNS failure, abort) are treated as `5xx` for retry purposes — they retry up to 3 times. The `retryDelay` function returns `Math.min(1000 * 2 ** attempt + jitter, 30_000)` where `attempt` is the zero-indexed retry count and `jitter` is `Math.random() * 1000` (full-jitter, 0–1000 ms). For status `429` only, if the response carried a `Retry-After` header, the delay is `Math.max(retryAfterMs, computedExponentialDelay)` capped at `30_000` — meaning the client honors whichever wait is *longer* (the spec floor or the server's request), never going below the server's instruction. No retries happen on the synchronous validation paths (Eden returns a 4xx envelope synchronously; the `retry` function returns `false`).

2. **`tasksApi.create` throws a typed `TasksApiError` carrying `status` and optional `retryAfterMs` (FR24, FR26, ARCH-AR8, ARCH-AR10)** — `apps/web/src/data/api.ts` adds an exported `TasksApiError extends Error` class with public readonly `status: number` and public readonly `retryAfterMs?: number` fields, plus a `code?: string` field populated from `error.value.error.code` when present (closed `ErrorCode` union per ARCH-AR8). `tasksApi.create` and `tasksApi.list` are both refactored to throw `TasksApiError` instead of bare `Error` on a non-null Eden `error` envelope. The `TasksPostResponse` and `TasksGetResponse` shapes are widened to optionally include `response?: Response` so the wrapper can read `response.headers.get("retry-after")` (Eden Treaty exposes the raw `Response` on each invocation). When `Retry-After` is a digit-string (delta-seconds), it is parsed to milliseconds (`parseInt(value, 10) * 1000`); HTTP-date format is parsed to milliseconds via `Date.parse(value) - Date.now()` and floored at `0`. Non-parseable values yield `retryAfterMs: undefined`. The `null-data` path continues to throw a plain `Error("tasks create returned null data")` (no `status`); the retry policy treats it like a transient 5xx and retries up to 3 times. Existing tests that assert on the message string remain green; the new field-based assertions are additive.

3. **SyncIndicator sub-component on TaskRow renders inline between task text and DeleteButton (FR25, UX-DR7)** — A new `SyncIndicator` sub-component is added inline in `apps/web/src/components/TaskRow.tsx` (sibling to `Checkbox` and `DeleteButton`, same file — the architecture's TaskRow is one component with co-located sub-parts). The indicator is a 14×14 px dashed circle (`border: 2px dashed var(--color-status-pending)`, `border-radius: 9999px`, `width: 14px`, `height: 14px`) with an `aria-label="Saving"` attribute and a `data-testid` of nothing (TaskRow follows the `data-testid` minimization rule from Story 1.7). The indicator rotates on a **1.5 s linear infinite** keyframe animation (`@keyframes task-row__sync-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`) defined in a new `apps/web/src/components/TaskRow.css` (or appended to `apps/web/src/styles/reset.css` — see Project Structure Notes for the chosen location). Under `@media (prefers-reduced-motion: reduce)` the rotation is removed; the static dashed circle remains. Color is the `color.status.pending` token (`var(--color-status-pending)`) — neutral grey, **not** warning amber. Position: between the task text span and the DeleteButton, with a `gap-2` spacer. The indicator only renders when the row's capture sync state is `pending` (see AC #5).

4. **ErrorMessage and RetryAction sub-components render in retry-exhausted state (FR26, UX-DR7, UX-DR22)** — `TaskRow.tsx` gains two more sub-components: `ErrorMessage` and `RetryAction`. **ErrorMessage** is a `<p>` element rendered as a sibling block below the task text row, inside the `<li>`, with copy `"Couldn't save — check connection."` (verbatim — em-dash `—` U+2014, not hyphen-minus, per UX-DR22). Styling: `text.meta` (`font-size: 0.875rem`, `line-height: 1.4`, `font-weight: 400`), color `var(--color-status-error)`. **RetryAction** is a `<button type="button">` rendered right-aligned in the same row as the task text (replacing or sitting alongside the DeleteButton when retry-exhausted; final placement: keep the DeleteButton present, insert RetryAction immediately to its left with a `gap-2` separator), with text content `"Retry"`, styling `text.meta` weight `500`, color `var(--color-accent-default)`, `cursor: pointer`, focus ring matches the Story 1.5 token (`outline: 2px solid var(--color-accent-default); outline-offset: 2px`). Both sub-components only render when the row's sync state is `exhausted`. The row's background becomes `var(--color-status-error-subtle)` (light: `#FEE2E2`, dark: `#450A0A`) via a class toggle on the `<li>`. Task text color stays at `var(--color-text-primary)` — the failure is about saving, not the content (FR26).

5. **Per-row sync state is exposed via a new `captureSyncStore` indexed by task id (FR23, FR25, FR26, FR27)** — A new module `apps/web/src/data/captureSyncStore.ts` exports a Solid `createStore<Record<string, CaptureSyncEntry | undefined>>({})` plus a `useCaptureSyncStatus(taskId: () => string)` accessor returning a reactive function `() => CaptureSyncEntry | undefined`. The entry shape is `type CaptureSyncEntry = { status: "pending" | "exhausted"; retry: () => void }`. Internal mutators `markPending(id, retry)`, `markExhausted(id, retry)`, and `clear(id)` are exported under a `__captureSyncMutators` namespace consumed only by `useCreateTask`. `TaskRow.tsx` imports `useCaptureSyncStatus`, calls it with `() => props.task.id` (Solid memo idiom — the accessor is evaluated reactively on every render of `props.task.id`), and renders the `SyncIndicator`, `ErrorMessage`, `RetryAction` sub-components based on the returned status. The store survives across all mutations in flight; entries are only created/updated/cleared by `useCreateTask`'s lifecycle callbacks.

6. **`useCreateTask` lifecycle drives the per-row store with the 300 ms pending threshold (FR23, FR25, UX-DR16)** — `useCreateTask` adds:
    - `mutationKey: ["tasks", "create"]` (hierarchical, prefix-matchable; not load-bearing for this story but required by `TanStack Solid Query rules` for any optimistic mutation).
    - `onMutate` (existing logic plus): start a `setTimeout(() => __captureSyncMutators.markPending(input.id, retryFor(input)); LiveRegion.announce("Saving…"), SYNC_PENDING_DELAY_MS)` where `SYNC_PENDING_DELAY_MS = 300`. The timer id is stored in a module-scoped `Map<string, ReturnType<typeof setTimeout>>` keyed by `input.id`. The `retryFor(input)` factory returns `() => { mutationObserver.reset(); mutationObserver.mutate(input); }` — see AC #8.
    - `onSuccess`: clear the pending timer for `input.id`. If the row was already `pending` (i.e. the timer fired), call `LiveRegion.announce("Saved")`. Then `__captureSyncMutators.clear(input.id)` so the SyncIndicator unmounts. **Do not** invalidate the tasks query (Story 1.8 contract, ARCH-AR11).
    - `onError`: clear the pending timer for `input.id`. Call `__captureSyncMutators.markExhausted(input.id, retryFor(input))`. Announce `"Couldn't save — check connection."` exactly once. **Do not** roll back the cache via `setQueryData(tasksQueryKey, context.previous)` — the no-rollback contract from Story 1.8 / UX-DR16 is preserved. The optimistic row stays in place.
    - `onSettled`: no-op (timer cleanup happens in `onSuccess` / `onError`; defensive cleanup here is acceptable but not required).
    - The mutation reset / re-fire pattern for RetryAction must use the **same observer instance** (`useCreateTask` is mounted once at `App.tsx`; `mutationObserver.mutate(input)` re-runs the full lifecycle including a fresh `failureCount`).
    - Constants in `apps/web/src/constants.ts`: `SYNC_PENDING_DELAY_MS = 300`, `RETRY_BASE_DELAY_MS = 1_000`, `RETRY_MAX_DELAY_MS = 30_000`, `RETRY_429_MAX_ATTEMPTS = 4`, `RETRY_5XX_MAX_ATTEMPTS = 3`, `RETRY_JITTER_MAX_MS = 1_000`.

7. **LiveRegion announces "Saving…" / "Saved" / "Couldn't save — check connection." with announce-once-per-transition semantics (FR22, UX-DR10)** — Each unique row mutation produces at most: one `"Saving…"` (when the row first crosses the 300 ms pending threshold), one `"Saved"` (when the same row resolves successfully *and* was previously pending), one `"Couldn't save — check connection."` (when retries exhaust). The `"Saved"` announcement is suppressed if the row never became visually pending (i.e. the mutation resolved before 300 ms — the row's state was the silent fast-path of Story 1.8 and announcing "Saved" would contradict UX-DR16's silent-success rule). Multiple concurrent rows pending simultaneously each emit their own `"Saving…"` — no batching, no de-duplication of *different* rows. The architecture's `LiveRegion.announce()` API is the single delivery channel; per-row `aria-live` attributes are forbidden. Announcement strings are exact (no period after `"Saved"`, ellipsis `…` U+2026 in `"Saving…"`, em-dash `—` U+2014 in `"Couldn't save — check connection."`). They are stored as exported constants in `apps/web/src/components/LiveRegion.tsx` (or a sibling `apps/web/src/data/announcements.ts` — see Project Structure Notes) so tests assert against the constant rather than a literal.

8. **RetryAction click / Enter / Space resets the mutation and re-attempts (FR26)** — When the user clicks `RetryAction` (or focuses it and presses Enter or Space — native button semantics), the entry's stored `retry()` callback fires. The callback (a) calls `mutationObserver.reset()` to clear `isError` / `error` from the observer state, then (b) calls `mutationObserver.mutate(input)` with the *same* `{ id, text }` input the original failed mutation used. The fresh mutation re-runs the full lifecycle: `onMutate` re-cancels in-flight queries (no-op — the optimistic row already exists in the cache from the failed mutation; the snapshot is captured again), schedules a fresh 300 ms pending timer, and fires the request. The store entry transitions from `exhausted` → (no entry, briefly) → `pending` (after 300 ms) → either `clear` (success) or `exhausted` again (failure). The optimistic row never disappears; the cache write inside `onMutate` is idempotent (the row's `id` is already at index 0). Server-side, the second POST is idempotent on the same `{ id, text }` body and returns `200` (Story 1.4 contract); `tasksApi.create` returns the same `Task`. **Do not** generate a new UUIDv7 for the retry — that would produce a duplicate row server-side under the same client intent.

9. **Dark mode preserves contrast and meaning across all states (NFR-A1, UX-DR20)** — All new color references use the existing CSS custom-property tokens (`--color-status-pending`, `--color-status-error`, `--color-status-error-subtle`, `--color-text-primary`, `--color-accent-default`). The dark-mode branch of `apps/web/src/styles/tokens.css` already defines these (`#71717A` pending, `#F87171` error, `#450A0A` error-subtle). No new CSS custom properties are introduced. Contrast verification: `--color-status-error` on `--color-status-error-subtle` light = `#B91C1C` on `#FEE2E2` ≥ 7:1 (AAA); dark = `#F87171` on `#450A0A` ≥ 4.6:1 (AA). The 14×14 dashed-circle SyncIndicator on `--color-bg-surface` is a non-color signal (icon shape) supplemented by the LiveRegion announcement (WCAG 1.4.1) — so even users with no color perception still get the state.

10. **`prefers-reduced-motion: reduce` removes the SyncIndicator rotation and the row-error background transition (UX-DR20, NFR-A2)** — The `@keyframes task-row__sync-spin` rule is wrapped in / overridden by `@media (prefers-reduced-motion: reduce) { .task-row__sync-indicator { animation: none; } }`. The static dashed circle remains visible; the LiveRegion announcement is the dynamic signal carrying the semantic. Per Story 1.5 deferred-work item, prefer the WebKit-recommended pattern of explicitly setting `animation: none` (not `animation-duration: 0ms`) so the animation does not fire `animationiteration`/`animationend` events. The retry-exhausted row background change is a state shift, not a transition; it does not need a reduced-motion override. The test in `TaskRow.test.tsx` (or a new `TaskRow.styles.test.ts`) reads the source CSS and asserts the `prefers-reduced-motion` block contains `animation: none` (or equivalent — see Testing Requirements).

11. **The retry policy and the 300 ms threshold are fully unit-tested in isolation (FR24, FR25, FR26, ARCH-AR11)** — Extend `apps/web/src/data/queries.test.tsx` with a new `describe("useCreateTask retry policy")` block that drives `retry` and `retryDelay` via the v5 Solid Query mutation cache. Cases (each with a fresh `QueryClient` and fully-mocked `tasksApi.create`):
    - **`retry` returns `true` for status 429 up to 4 times, then `false`.** Construct a `TasksApiError` with `status: 429`. Call the mutation's `retry` function (read it off the cached mutation observer's options after the first failure) with `failureCount: 0..4` and assert the boolean transitions: `0 → true`, `1 → true`, `2 → true`, `3 → true`, `4 → false`.
    - **`retry` returns `true` for status 500/502/503/504 up to 3 times, then `false`.** Same shape, `failureCount: 0..3` → `true, true, true, false`.
    - **`retry` returns `false` immediately for status 400, 404, 409, 413, 422.** Each ad-hoc `failureCount: 0` → `false`.
    - **`retry` returns `true` up to 3 times for `Error` (no `status` field — synthetic network error).** `failureCount: 0..3` → `true, true, true, false`.
    - **`retryDelay` returns `1000–2000 ms` for `attempt: 0`, `2000–3000 ms` for `attempt: 1`, capped at `30_000 ms` from `attempt: 5` upward.** Assert ranges (the jitter is randomized; assert via `expect(value).toBeGreaterThanOrEqual(min)` and `expect(value).toBeLessThanOrEqual(max)`).
    - **`retryDelay` honors `Retry-After` for status 429 when greater than the exponential floor.** Construct `TasksApiError` with `status: 429, retryAfterMs: 5000`. For `attempt: 0`, assert returned delay ≥ `5000` and ≤ `30_000`. For `attempt: 5` (where exponential cap is `30_000`), assert returned delay = `30_000` (cap wins).
    - **`retryDelay` ignores `Retry-After` for status 5xx (only honored on 429).** Construct `TasksApiError` with `status: 503, retryAfterMs: 5000`. For `attempt: 0`, assert returned delay is in the `1000–2000` range (the spec floor, not the server's request — 5xx Retry-After is informational, not load-bearing).
    - **300 ms threshold — `markPending` is NOT called before 300 ms have elapsed.** Stub `tasksApi.create` with a 100 ms-resolving promise. Trigger the mutation. After 100 ms (use `setTimeout`, not fake timers — Bun's test runner does not ship fake timers preconfigured), assert `__captureSyncMutators.markPending` was *not* called. After resolution, assert it was *never* called (the silent fast-path of Story 1.8 is preserved). Use a `mock(__captureSyncMutators.markPending)` capture in `beforeEach`.
    - **300 ms threshold — `markPending` IS called after 300 ms when the mutation has not resolved.** Stub `tasksApi.create` with a never-resolving promise. Trigger the mutation. After 350 ms (real timeout via `await new Promise(r => setTimeout(r, 350))`), assert the store has `entries[input.id].status === "pending"`.
    - **Success after pending transitions store from pending → cleared and announces "Saved".** Same setup as above; resolve the promise after 350 ms; await `mutation.isSuccess`; assert the store entry is `undefined` and the LiveRegion message contains `"Saved"`.
    - **Success before pending does NOT announce "Saved".** Same setup as the < 300 ms case; assert the LiveRegion message is empty (or whatever the test's pre-state was — the helper `__resetLiveRegionForTests()` exists for this).
    - **Error transitions store to exhausted and announces error.** Stub `tasksApi.create` with `Promise.reject(new TasksApiError({ status: 400, message: "validation_error" }))` and configure a fresh mutation client with `mutations: { retry: false }` (the test overrides the hook's retry config — needed because the test client's default would otherwise eat the failure). Trigger; await `mutation.isError`; assert the store has `status === "exhausted"` and the LiveRegion contains `"Couldn't save — check connection."`.
    - **Retry callback resets and re-fires the mutation.** Stub `tasksApi.create` with a mock that rejects on the first call and resolves on the second. After the first error, read `entries[input.id].retry` from the store and call it. Wait for `mutation.isSuccess`. Assert `tasksApi.create` was called twice with the same input.

12. **Component tests cover SyncIndicator, ErrorMessage, RetryAction in `TaskRow.test.tsx` (FR25, FR26)** — Extend the existing `apps/web/src/components/TaskRow.test.tsx` with new `describe` blocks for the three sub-components. Cases:
    - **TaskRow with no captureSyncStore entry renders no SyncIndicator, no ErrorMessage, no RetryAction.** (Existing default behavior; the new sub-components must not regress the active-state rendering.)
    - **TaskRow with `entries[id] = { status: "pending", retry }` renders the SyncIndicator** with `aria-label="Saving"`, the dashed-circle CSS class, and *no* ErrorMessage / *no* RetryAction.
    - **TaskRow with `entries[id] = { status: "exhausted", retry }` renders the ErrorMessage** with copy `"Couldn't save — check connection."` and *the* RetryAction with text `"Retry"`. The row background class includes the `task-row--retry-exhausted` (or equivalent) state class. No SyncIndicator. The DeleteButton is still present.
    - **RetryAction click invokes the entry's `retry` callback.** Use `mock(...)` for `retry`; click the `<button>`; assert `retry` was called once.
    - **RetryAction is keyboard-reachable.** `await fireEvent.keyDown(retryButton, { key: "Enter" })` and `{ key: " " }` — assert button `click` semantics fire (browser default; happy-dom should honor for `<button type="button">`). If happy-dom does not synthesize the click on Enter/Space the way real browsers do, defer the keyboard-only assertion to the Playwright spec (the spec at AC #14 covers keyboard-reachable assertions across real browsers).
    - **SyncIndicator under reduced-motion preserves the dashed circle but removes the rotation.** Read the source CSS file (the same `readFileSync` pattern as `LiveRegion.test.tsx`) and assert the `prefers-reduced-motion: reduce` rule contains `animation: none` (or `animation-name: none`) for the indicator's class.
    - **TaskRow's existing XSS regression test continues to pass for both pending and exhausted states.** Add a duplicate of the existing `<script>` and `<img onerror>` regression with `entries[id] = { status: "exhausted", ... }` to confirm the malicious text continues to render as literal text in the retry-exhausted state's task-text span.
    - **Reset the captureSyncStore between tests.** Add `afterEach(() => { __captureSyncMutators.clear(...) for all known ids; or expose a __resetCaptureSyncStoreForTests() helper });` — see Test Stub Strategy.

13. **`useCreateTask` lifecycle integration tests cover the 300 ms threshold and announcement transitions in `queries.test.tsx` (FR22, FR25)** — Existing `describe("useCreateTask")` block (5 tests from Story 1.8) is preserved. New `describe("useCreateTask sync state")` block adds:
    - **Resolves before 300 ms — store stays empty, LiveRegion silent.** Stub `tasksApi.create` to resolve in 100 ms. Trigger. Wait for `mutation.isSuccess`. Assert `entries[input.id]` is `undefined` and `__getLiveRegionMessageForTests()` returns `""`.
    - **Resolves after 300 ms — store transitions pending → cleared, "Saving…" then "Saved" announced.** Stub `tasksApi.create` to resolve after 400 ms. Trigger. Wait 350 ms. Assert store has `pending`. Wait for `mutation.isSuccess`. Assert store is empty. Assert LiveRegion message is `"Saved"` (the latest message; "Saving…" was overwritten by `setMessage("")` then `setMessage("Saved")` — see Test Stub Strategy for the announcement-history capture pattern).
    - **Rejects with retry-disabled — store transitions to exhausted, error announced.** Use `makeMutationClient()` (already exported from `queries.test.tsx`) with `mutations: { retry: false }`. Stub `tasksApi.create` to reject with `new TasksApiError({ status: 400, message: "validation_error" })`. Trigger. Wait for `mutation.isError`. Assert `entries[input.id].status === "exhausted"`. Assert LiveRegion was announced `"Couldn't save — check connection."`. Assert the cache still has the optimistic row at index 0 (no rollback — Story 1.8 contract preserved).
    - **Retry callback re-mutates the same input.** Continue from the above test. Read `entries[input.id].retry`. Stub `tasksApi.create = mock(() => Promise.resolve(serverTask))` (replace the rejecting mock with a resolving one). Call `retry()`. Wait for `mutation.isSuccess`. Assert the store entry is `undefined`. Assert `tasksApi.create` was called twice (the original failure + the retry).
    - **Concurrent rows pending simultaneously each emit "Saving…".** Trigger two mutations with different `input.id`s, both stubbed to resolve after 400 ms. Wait 350 ms. Assert store has *two* entries, both `pending`. Use the announcement-history capture (see Test Stub Strategy) to assert two `"Saving…"` announcements were emitted. Resolve both. Assert two `"Saved"` announcements were emitted.

14. **Playwright `e2e/error-recovery.spec.ts` covers the full pending → exhausted → retry → success cycle (NFR-M2, FR23, FR25, FR26, FR27)** — Create `e2e/error-recovery.spec.ts`. Spec uses the same `playwright.config.ts` chromium / firefox / webkit projects and the `webServer` (Vite dev on `:5173`, `bun run dev` proxying `/api/*` to `:3000`). Test cases:
    - **Pending after 300 ms — SyncIndicator appears, "Saving…" announced.** Use `await page.route("**/api/tasks", async (route) => { if (route.request().method() === "POST") { await new Promise(r => setTimeout(r, 800)); await route.continue(); } else { await route.continue(); } });` to delay the POST 800 ms. Goto, type, Enter. Within 350 ms, assert `await expect(page.locator('[aria-label="Saving"]')).toBeVisible()`. After the delayed POST resolves, assert the SyncIndicator has unmounted (`await expect(page.locator('[aria-label="Saving"]')).toHaveCount(0, { timeout: 2000 })`). LiveRegion content is hard to assert directly in Playwright (the visually-hidden `<div>` updates microsecond-fast); a soft assertion via `await expect(page.locator('[aria-live="polite"]').first()).toContainText("Saved")` is acceptable as a timing-window approximation but not strictly load-bearing for the test.
    - **Retry-exhausted state — RetryAction appears, error announced, no rollback.** Use `await page.route("**/api/tasks", async (route) => { if (route.request().method() === "POST") { await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "validation_error", message: "test-induced" }, requestId: "test" }) }); } else { await route.continue(); } });`. Goto, type, Enter. Assert the row appears (`await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible()`). Within ~500 ms, assert `await expect(page.getByRole("button", { name: "Retry" })).toBeVisible()` and `await expect(page.locator(".task-row--retry-exhausted")).toBeVisible()` (or whatever class hook the dev chose — adjust the selector). Assert the row's task text is still visible (`await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible()` — no rollback). Assert `await expect(page.locator('[aria-live="polite"]').first()).toContainText("Couldn't save")` (timing-window soft assertion).
    - **Retry click resets to pending then succeeds.** Continue from the above. Now intercept the next POST with `await page.unroute("**/api/tasks"); await page.route("**/api/tasks", route => route.continue())` to let real backend through. Click `getByRole("button", { name: "Retry" })`. Within ~2 s, assert the RetryAction has unmounted (`await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0)`) and the retry-exhausted row class is gone. The row's text persists.
    - **No-rollback contract under failure (FR27) — the optimistic row stays in the list across the entire failure cycle.** Same setup as the retry-exhausted case. Capture `preCount = await page.getByRole("listitem").count()` before submit. Submit. After the failure surface appears, assert `await page.getByRole("listitem").count() === preCount + 1`. Capture again after retry-then-success, assert still `preCount + 1`.
    - **axe-core on the retry-exhausted state has zero critical/serious violations (NFR-A1, NFR-A2).** Reach the retry-exhausted state via the same fulfill-with-400 trick. Run `await new AxeBuilder({ page }).analyze()`. Filter to `impact === "critical" || impact === "serious"`. Assert empty.
    - **Reduced-motion equivalence — under `await page.emulateMedia({ reducedMotion: "reduce" })`, the SyncIndicator's rotation is suppressed.** Reach the pending state via the 800 ms delay trick. Read the indicator's computed `animationName` (`await page.locator('[aria-label="Saving"]').evaluate(el => getComputedStyle(el).animationName)`). Assert it's `"none"` (or empty).
    - **Use unique per-test `Date.now()`-stamped texts** (mirror Story 1.8 deviation #5) so cross-run dev DB state does not collide. The dev server's reused SQLite file is acceptable; tests assert on text deltas, not absolute counts.

15. **Address Story 1.8 hand-off — LiveRegion `announce()` queue limitations come live (deferred-work from Story 1.5 review)** — Story 1.8 deferred-work hand-off explicitly flagged that this story is the first to actually drive `LiveRegion.announce(...)` calls and would hit three latent issues: (a) two synchronous `announce()` calls collapse to the second message because both microtasks fire `setMessage("")` then the latest message; (b) `announce()` invoked before `<LiveRegion />` mounts is silently lost; (c) SSR / multiple mounts share the signal. Replace `apps/web/src/components/LiveRegion.tsx`'s implementation with a small queue: a module-scoped FIFO `string[]` buffer; `announce()` enqueues and triggers a drain via a microtask if not already draining; the drain pumps messages into the live-region's text content with a small inter-message delay (~120 ms — within `motion.short`) so screen readers register each transition. The drain uses `setMessage("")` then `queueMicrotask(() => setMessage(next))` — same primitive — but serialized through the queue so synchronous calls don't collapse. **Add a mount sentinel** (a module-scoped `mounted` boolean, set in `LiveRegion`'s `onMount` and unset in `onCleanup`); `announce()` calls before mount go into the queue but the drain only starts after `mounted === true`. Update `__getLiveRegionMessageForTests` to return the most-recent drained message (existing behavior); add a new `__getLiveRegionHistoryForTests(): string[]` returning the full drain history for the test in AC #11/13's announcement-history assertions. Update `__resetLiveRegionForTests` to reset the queue + history + mounted state. The `LiveRegion.test.tsx` file (currently a source-substring test per Story 1.5 deferred-work) is upgraded to render `<LiveRegion />` via `@solidjs/testing-library` (happy-dom is now wired) and exercise the queue: two synchronous `announce("a"); announce("b")` calls produce both messages in history, not just the second.

16. **Address Story 1.8 hand-off — `previous` mutation context is taken as a snapshot, not a live cache reference** — Story 1.8 deferred-work hand-off flagged that `getQueryData<Task[]>(...) ?? []` returns the cache's actual array reference, not a snapshot. Story 1.9 does not implement `onError: setQueryData(..., previous)` rollback (the no-rollback contract is preserved), but the *next* mutation hook to land (Story 2.2 toggle, Story 3.2 delete) might. Defensive fix: replace `const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];` with `const previous = [...(queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [])];` — a one-level shallow copy is sufficient because the Task objects themselves are immutable in this codebase (no per-task mutation outside cache replacement). The unit test in AC #11 does not need to assert this directly, but a code comment near the snapshot line should explain the why so a future dev does not "optimize" the spread away.

17. **Quality gates pass with no new dependencies** — `bun run check` passes (oxlint, oxfmt, tsgo, dep-count). `bun run check:full` passes (above + `bun test` + `bun audit` + `bun run build` + bundle-size). `bun playwright test e2e/error-recovery.spec.ts --project=chromium` (or full triple) passes. **Do not** add new entries to `apps/web/package.json` `dependencies` or `devDependencies`. `apps/web/package.json` total stays at 17/25 (NFR-M5). Root total stays at 6/25. The new code lives in: `apps/web/src/data/queries.ts` (extended), `apps/web/src/data/api.ts` (`TasksApiError` class added), `apps/web/src/data/captureSyncStore.ts` (new), `apps/web/src/components/TaskRow.tsx` (extended), `apps/web/src/components/LiveRegion.tsx` (queue rewrite), `apps/web/src/constants.ts` (new constants), `apps/web/src/styles/reset.css` *or* a colocated `apps/web/src/components/TaskRow.css` (new keyframes) — see Project Structure Notes.

18. **Bundle-size budget stays well under 100 KB gz (NFR-P1)** — Story 1.8 left the main chunk at 25.69 KB gz. This story adds: ~50 lines in `queries.ts`, ~30 lines in `api.ts`, ~40 lines in a new `captureSyncStore.ts`, ~80 lines in `TaskRow.tsx`, ~30 lines in `LiveRegion.tsx` queue rewrite, ~50 lines in CSS. Estimated total addition: < 5 KB gz. Final main chunk should remain under 35 KB gz, comfortably under the 100 KB ceiling. `bash scripts/check-bundle-size.sh` continues to pass.

19. **Coverage stays green (NFR-M3)** — `bun scripts/check-coverage.ts` (the `check:full` coverage gate) stays ≥ 70 %. Aim for ≥ 80 % statements on `data/queries.ts`, `data/captureSyncStore.ts`, and `components/TaskRow.tsx`. The 11 retry-policy + 4 sync-state tests (AC #11, #13) plus the 7 TaskRow component tests (AC #12) plus the 7 e2e tests (AC #14) collectively cover the surface.

20. **No regression on Stories 1.5–1.8 surfaces (FR1, FR2, FR4, FR5, FR18, FR23)** — All 147 existing unit tests continue to pass. The four `e2e/capture.spec.ts` tests continue to pass. The Playwright timing-window contract (Story 1.8 AC #11 — the row paints within 100 ms even with an 800 ms artificial delay) is unaffected: the SyncIndicator only appears at 300 ms, not at 100 ms, so the 800 ms-delayed happy-path test from Story 1.8 may now *also* trigger a SyncIndicator visit — but capture.spec.ts asserts the row is visible within 100 ms (not the absence of SyncIndicator after that). Re-verify the Story 1.8 specs locally; any regression is a bug in this story.

21. **Tightly bounded scope** — Out of scope (forbidden in this story): toggle mutation (`useToggleTask` — Story 2.2), delete mutation (`useDeleteTask` — Story 3.2), per-row LiveRegion announcements for toggle / delete (Stories 2.x / 3.x — though those announcements *will* reuse this story's announce-once-per-transition rule), undo flow (Story 3.4), list-level fetch error UI (Story 1.10), keyboard navigation between rows (Story 4.1), Tab order through RetryAction (Story 4.2 — the spec there asserts the Tab order works *with* this story's RetryAction in place; this story only ensures RetryAction is `<button>` and thus tab-stop-able by default), Space-to-toggle on focused row (Story 2.3), `i` shortcut (Story 4.3), typing-anywhere-captures (Story 4.4), focus-ring audit (Story 4.5), single-service container deployment (Story 1.11). Backend stays untouched. No `Bun.env` / `import.meta.env`. No raw `fetch`. No `console.log`. No `any`. No magic numbers. Named exports only. Never destructure component props.

22. **Documentation hygiene** — The Dev Agent Record notes: any deviations from the AC-prescribed file structure (e.g. CSS placement choice, test stub seam choice for `__captureSyncMutators`); the `Retry-After` parsing approach (delta-seconds vs. HTTP-date, Eden's `response` exposure mechanism); the announcement-history capture pattern for `LiveRegion` tests. Any deferred follow-ups go into `_bmad-output/implementation-artifacts/deferred-work.md` under a new "Deferred from: code review of 1-9-..." section.

## Tasks / Subtasks

- [x] **Task 1 — Add new constants and `TasksApiError` class** (AC: #1, #2, #6)
  - [x] In `apps/web/src/constants.ts`, add: `SYNC_PENDING_DELAY_MS = 300`, `RETRY_BASE_DELAY_MS = 1_000`, `RETRY_MAX_DELAY_MS = 30_000`, `RETRY_429_MAX_ATTEMPTS = 4`, `RETRY_5XX_MAX_ATTEMPTS = 3`, `RETRY_JITTER_MAX_MS = 1_000`, `LIVE_REGION_DRAIN_INTERVAL_MS = 120`.
  - [x] In `apps/web/src/data/api.ts`, add `export class TasksApiError extends Error { constructor(public readonly args: { status: number; message: string; code?: string; retryAfterMs?: number; cause?: unknown }) { super(args.message, args.cause !== undefined ? { cause: args.cause } : undefined); this.name = "TasksApiError"; this.status = args.status; this.code = args.code; this.retryAfterMs = args.retryAfterMs; } public readonly status: number; public readonly code?: string; public readonly retryAfterMs?: number; }` (or equivalent — the constructor signature is illustrative; keep the shape and the `name = "TasksApiError"` for `instanceof` + serialized-error debugging).
  - [x] Widen `TasksGetResponse` and `TasksPostResponse` to optionally include `response?: Response`. Eden Treaty exposes the raw `Response` as a field on the result object since 1.4 — the type assertion `as unknown as TasksApiSurface` already returns this (chained-access proxy). Add `response: Response` to the surface type's return shape.
  - [x] Refactor `tasksApi.list` and `tasksApi.create` to throw `TasksApiError` on non-null `error` envelope. Extract `code` from `(error.value as { error?: { code?: string } } | undefined)?.error?.code`. For `tasksApi.create`, if `error.status === 429`, read `response?.headers?.get("retry-after")` and parse via `parseRetryAfter(value: string | null): number | undefined` helper (delta-seconds or HTTP-date). Pass `retryAfterMs` into the `TasksApiError`.
  - [x] Export `parseRetryAfter` for unit testing (or co-locate the parser in a new `apps/web/src/data/retryAfter.ts` if the surface gets too cluttered — exercise judgment).

- [x] **Task 2 — Build `captureSyncStore`** (AC: #5, #6, #8)
  - [x] Create `apps/web/src/data/captureSyncStore.ts`. Export `type CaptureSyncEntry = { status: "pending" | "exhausted"; retry: () => void }`.
  - [x] Use `createStore<Record<string, CaptureSyncEntry | undefined>>({})` from `solid-js/store`. Solid's `createStore` is reactive; reading `store[id]` inside a `createMemo` or component scope tracks reactivity per-key.
  - [x] Export `useCaptureSyncStatus(id: () => string): () => CaptureSyncEntry | undefined`. Implementation: `return () => store[id()];` — Solid tracks `id()` automatically.
  - [x] Export `__captureSyncMutators` namespace with `markPending(id: string, retry: () => void): void`, `markExhausted(id: string, retry: () => void): void`, `clear(id: string): void`. Implementation uses `setStore(id, ...)`. To remove an entry: `setStore(id, undefined)` (Solid handles this; reads return `undefined` reactively).
  - [x] Export `__resetCaptureSyncStoreForTests(): void` that iterates known keys (or replaces the store entirely — use `setStore(reconcile({}, { merge: true }))` if available, otherwise iterate). Test cleanup pattern.
  - [x] Do not consume `__captureSyncMutators` from any component — only from `useCreateTask`. Components consume `useCaptureSyncStatus` (the read-only accessor).

- [x] **Task 3 — Extend `useCreateTask` with retry policy + sync-state lifecycle** (AC: #1, #6, #7, #8, #16)
  - [x] Import the new constants, `TasksApiError`, `__captureSyncMutators`, and `LiveRegion.announce` (and the new announcement-string constants — see Task 6).
  - [x] Add a module-scoped `pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()` to track per-row pending-delay timers. Module scope is correct because the `useCreateTask` hook is mounted exactly once at `App.tsx`; a re-mount would clear the map naturally.
  - [x] In the `useMutation` config, add `mutationKey: ["tasks", "create"]`. Add `retry: (failureCount, error) => boolean` and `retryDelay: (attempt, error) => number` per AC #1. Use `instanceof TasksApiError` to discriminate. For non-`TasksApiError` failures, treat as `5xx` (retry up to 3 times).
  - [x] Modify `onMutate` (existing logic preserved): after `setQueryData(...)`, schedule the pending timer:
    ```ts
    const retry = (): void => {
      mutationObserver.reset();
      mutationObserver.mutate(input);
    };
    const timer = setTimeout(() => {
      __captureSyncMutators.markPending(input.id, retry);
      announce(LIVE_REGION_SAVING);
    }, SYNC_PENDING_DELAY_MS);
    pendingTimers.set(input.id, timer);
    ```
  - [x] Capture `mutationObserver` for the `retry` closure: the `useMutation` hook's return value *is* the observer. Use a `let mutationObserver: ReturnType<typeof useMutation<...>> | undefined` captured in the hook's closure, assigned right before `return mutationObserver`. Solid's hook lifecycle keeps the reference stable across re-renders.
  - [x] Defensive snapshot: replace `const previous = queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [];` with `const previous = [...(queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [])];` (AC #16). Add a one-line comment near it: `// shallow copy: prevent live-reference rollback hazards in future mutation hooks (Stories 2.2 / 3.2)`.
  - [x] Add `onSuccess: (_data, input) => { ... }`. Inside: clear and delete the timer for `input.id`. Read the current store entry (`useCaptureSyncStatus` is for components — inside the hook we read the underlying store directly via a `__captureSyncStore.peek(id)` accessor — add this to `captureSyncStore.ts` as a non-reactive read for hook use). If the entry was `pending`, announce `LIVE_REGION_SAVED`. Then `__captureSyncMutators.clear(input.id)`.
  - [x] Add `onError: (_error, input) => { ... }`. Inside: clear and delete the timer for `input.id`. Build the `retry` closure (same pattern as `onMutate`'s `retry`). `__captureSyncMutators.markExhausted(input.id, retry)`. Announce `LIVE_REGION_RETRY_EXHAUSTED`. **Do not** call `setQueryData(tasksQueryKey, context.previous)`.
  - [x] **Do not** add `onSettled` (timer cleanup happens in `onSuccess`/`onError`; `onSettled` would fire after both and cause a double-clear).

- [x] **Task 4 — Build `SyncIndicator`, `ErrorMessage`, `RetryAction` sub-components in `TaskRow.tsx`** (AC: #3, #4, #9, #10, #12)
  - [x] In `apps/web/src/components/TaskRow.tsx`, import `useCaptureSyncStatus` from `../data/captureSyncStore`.
  - [x] At the top of `TaskRow`, compute `const sync = useCaptureSyncStatus(() => props.task.id);` so `sync()` returns the current entry reactively.
  - [x] Build `SyncIndicator()` sub-component: renders a `<span aria-label="Saving" class="task-row__sync-indicator" />` with the dashed-circle CSS class. The class drives `width: 14px`, `height: 14px`, `border: 2px dashed var(--color-status-pending)`, `border-radius: 9999px`, and the `task-row__sync-spin` 1.5 s linear infinite animation.
  - [x] Build `ErrorMessage()` sub-component: renders a `<p class="task-row__error-message">{LIVE_REGION_RETRY_EXHAUSTED}</p>` (re-use the announcement string constant — single source of truth). `text.meta` weight 400, `color: var(--color-status-error)`. Sits as a **block sibling below the task-text row** within the `<li>` — adjust the `<li>` structure: wrap the existing flex row (Checkbox + text + DeleteButton) in a `<div class="task-row__primary">` and add the `ErrorMessage` as a sibling block below.
  - [x] Build `RetryAction(props: { onRetry: () => void })` sub-component: renders a `<button type="button" class="task-row__retry-action">Retry</button>` with `text.meta` weight 500, `color: var(--color-accent-default)`, focus-ring matching Story 1.5's token. Place it right-aligned in the primary row, immediately to the left of the DeleteButton, when the row is in the retry-exhausted state.
  - [x] Conditional render: in the `<li>`'s primary row, after the task-text `<span>` and before the DeleteButton, insert `<Show when={sync()?.status === "pending"}><SyncIndicator /></Show>`. Insert `<Show when={sync()?.status === "exhausted"}><RetryAction onRetry={sync()!.retry} /></Show>` immediately to the left of the DeleteButton. Insert `<Show when={sync()?.status === "exhausted"}><ErrorMessage /></Show>` as a sibling block below the primary row.
  - [x] Apply the row-error background via class toggle: `class={\`task-row ... \${sync()?.status === "exhausted" ? "task-row--retry-exhausted" : ""}\`}`. The `task-row--retry-exhausted` rule sets `background: var(--color-status-error-subtle);`.
  - [x] Add the new CSS to `apps/web/src/components/TaskRow.css` — a new file imported from `TaskRow.tsx` via `import "./TaskRow.css";`. Vite handles colocated CSS imports. Alternatively, append to `apps/web/src/styles/reset.css` if the project prefers a single-CSS-file layout (the existing `LoadingState`'s `motion.medium` shimmer is in `reset.css`, suggesting the precedent — exercise judgment, document the choice in deviations).
  - [x] Define the `@keyframes task-row__sync-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` and the `.task-row__sync-indicator` rule with the `animation: task-row__sync-spin 1500ms linear infinite;`.
  - [x] Add `@media (prefers-reduced-motion: reduce) { .task-row__sync-indicator { animation: none; } }` per AC #10.
  - [x] Verify `task-row` class hooks in `uno.config.ts` are not collided with — UnoCSS `presetMini` does not match `task-row__sync-indicator` etc. (they have no Tailwind utility shape), so the BEM-style names are safe to use as plain CSS class hooks.

- [x] **Task 5 — Rewrite `LiveRegion` with a queued, mount-aware drain** (AC: #7, #15)
  - [x] In `apps/web/src/components/LiveRegion.tsx`, replace the existing `createSignal`-based implementation with:
    ```ts
    const queue: string[] = [];
    const history: string[] = [];
    let mounted = false;
    let draining = false;
    const [message, setMessage] = createSignal("");

    const drain = (): void => {
      if (draining || !mounted) return;
      const next = queue.shift();
      if (next === undefined) return;
      draining = true;
      setMessage("");
      queueMicrotask(() => {
        setMessage(next);
        history.push(next);
        setTimeout(() => {
          draining = false;
          drain();
        }, LIVE_REGION_DRAIN_INTERVAL_MS);
      });
    };

    export const announce = (next: string): void => {
      queue.push(next);
      drain();
    };
    ```
  - [x] Add `onMount` and `onCleanup` to the `LiveRegion` component to set/unset the `mounted` flag and trigger `drain()` on mount (so pre-mount `announce()` calls are flushed).
  - [x] Update `__resetLiveRegionForTests`: clear `queue`, clear `history`, set `mounted = false`, `draining = false`, `setMessage("")`.
  - [x] Add `export const __getLiveRegionHistoryForTests = (): readonly string[] => history;` for the announcement-history assertions.
  - [x] Export announcement-string constants from a colocated `apps/web/src/data/announcements.ts` (cleaner than re-exporting from `LiveRegion.tsx`):
    ```ts
    export const LIVE_REGION_SAVING = "Saving…";       // U+2026 ellipsis
    export const LIVE_REGION_SAVED = "Saved";
    export const LIVE_REGION_RETRY_EXHAUSTED = "Couldn't save — check connection.";  // U+2014 em-dash
    ```
    Import them from `useCreateTask` and from the new TaskRow `ErrorMessage` sub-component. **Single source of truth — never inline these strings.**
  - [x] Update `LiveRegion.test.tsx`: rewrite from source-substring assertions to actual rendering tests using `@solidjs/testing-library` (happy-dom is now wired). Cover: (a) two synchronous `announce("a"); announce("b")` produce both messages in `__getLiveRegionHistoryForTests()`; (b) `announce()` before `<LiveRegion />` mounts is queued and drained on mount; (c) `__resetLiveRegionForTests()` clears the state; (d) the rendered `<div>` has `aria-live="polite"`, `aria-atomic="true"`, and the `sr-only` class.

- [x] **Task 6 — Author `useCreateTask retry policy` and `useCreateTask sync state` unit tests** (AC: #11, #13)
  - [x] In `apps/web/src/data/queries.test.tsx`, add a new `describe("useCreateTask retry policy")` block after the existing `describe("useCreateTask")`. Each test constructs a fresh `QueryClient` via `makeMutationClient()` and a fresh probe component.
  - [x] To assert `retry` and `retryDelay` directly: read the cached mutation observer's options after triggering a single mutation. Pattern:
    ```ts
    const m = client.getMutationCache().getAll()[0];
    const opts = m.options as { retry?: (failureCount: number, error: unknown) => boolean; retryDelay?: (attempt: number, error: unknown) => number };
    expect(opts.retry?.(0, new TasksApiError({ status: 429, message: "..." }))).toBe(true);
    ```
  - [x] For the 300 ms threshold tests, use a real `setTimeout`-based `await new Promise(r => setTimeout(r, 350))` rather than fake timers. Bun's test runner does not ship fake-timer infrastructure; real timers with bounded waits are the established Story 1.7 pattern.
  - [x] Capture `__captureSyncMutators.markPending` / `markExhausted` / `clear` via `mock(...)` swap-in and restore in `afterEach`. Or use the read-side `__captureSyncStorePeek(id)` to assert state changes. Either is acceptable; the read-side is more robust to internal refactor.
  - [x] Capture announcement history via `__getLiveRegionHistoryForTests()`. Reset between tests with `__resetLiveRegionForTests()` in `beforeEach`.
  - [x] Add a new `describe("useCreateTask sync state")` block with the four scenarios from AC #13.

- [x] **Task 7 — Author `TaskRow` sync-state component tests** (AC: #12)
  - [x] Extend `apps/web/src/components/TaskRow.test.tsx`. Add `describe("TaskRow sync states")`. In `beforeEach`, call `__resetCaptureSyncStoreForTests()` to keep tests isolated.
  - [x] For "pending" state tests, call `__captureSyncMutators.markPending(task.id, mock(() => undefined))` *before* `render(...)`. The reactive store will publish on mount.
  - [x] For "exhausted" state tests, call `__captureSyncMutators.markExhausted(task.id, retryMock)`.
  - [x] Assert via `getByLabelText("Saving")` for the SyncIndicator, `getByText("Couldn't save — check connection.")` for the ErrorMessage, `getByRole("button", { name: "Retry" })` for the RetryAction.
  - [x] Click RetryAction with `fireEvent.click(...)`; assert `retryMock.mock.calls.length === 1`.
  - [x] Reduced-motion CSS assertion: `readFileSync("apps/web/src/components/TaskRow.css")` (or `apps/web/src/styles/reset.css` if the dev chose that location) and assert `prefers-reduced-motion: reduce` block contains `animation: none`.
  - [x] Re-run the existing XSS regression with `__captureSyncMutators.markExhausted(...)` set first; assert the malicious text still renders as literal text. The new sub-components must not introduce a new `innerHTML` or equivalent path.

- [x] **Task 8 — Author `e2e/error-recovery.spec.ts`** (AC: #14)
  - [x] Create `e2e/error-recovery.spec.ts`. Import `test, expect` from `@playwright/test` and `AxeBuilder` from `@axe-core/playwright`. Mirror the structure of `e2e/capture.spec.ts`.
  - [x] Use `Date.now()`-stamped texts per test (Story 1.8 deviation #5) so cross-run dev-DB state does not collide.
  - [x] Tests as enumerated in AC #14 (pending appears, retry-exhausted appears, retry resets to pending then succeeds, no-rollback assertion, axe-core clean, reduced-motion equivalence).
  - [x] For the retry-exhausted flow, use `route.fulfill(...)` to inject a synthetic 400 response (mirrors the architecture's error envelope shape from ARCH-AR8). For the recovery flow, use `page.unroute(...)` to release the interception.
  - [x] **Do not** modify `e2e/smoke.spec.ts` or `e2e/capture.spec.ts`. Re-run them as part of `bun playwright test` to verify no regression.

- [x] **Task 9 — Verify quality gates** (AC: #17, #18, #19, #20)
  - [x] Run `bun run check`. Must pass: oxlint, oxfmt, tsgo `-b --noEmit`, dep-count.
  - [x] Run `bun run check:full`. Must pass: above + `bun test` (147 existing + the new tests) + `bun audit` + `bun run build` (Vite) + bundle-size.
  - [x] Run `bun playwright test e2e/error-recovery.spec.ts --project=chromium` (or full triple). Must pass.
  - [x] Run `bun playwright test e2e/capture.spec.ts --project=chromium`. Must pass (no Story 1.8 regression).
  - [x] Run `bun run dev` and visually verify in a browser:
    - Type a task with the network at normal speed → row appears, no SyncIndicator (silent fast path preserved).
    - DevTools network throttle "Slow 3G" → type a task → after ~300 ms the SyncIndicator appears mid-row → after the network resolves the indicator unmounts. Screen reader (VoiceOver / NVDA) announces "Saving…" then "Saved".
    - DevTools network → "Offline" → type a task → row appears, after 300 ms SyncIndicator appears, after a few retries (with the exponential delays) the row enters retry-exhausted state with "Retry" + "Couldn't save — check connection." Screen reader announces the error. Click Retry while still offline → row reverts to pending → eventually exhausted again. Re-enable network → click Retry → row recovers (SyncIndicator → success → indicator unmounts).
    - **(If manual testing is impractical, substitute via Playwright per Story 1.8 deviation #4 — the e2e spec covers all three scenarios cross-browser.)**
  - [x] Record any deviations (CSS file location, `Retry-After` parsing edge cases, announcement-history capture pattern, `useMutationState` vs. `captureSyncStore` choice rationale) in the Dev Agent Record.

## Dev Notes

### Critical Context

This story is the **load-bearing UX commitment** for FR27 ("the product never silently loses task data due to network or transient backend failures"). Story 1.8 set up the optimistic happy path; Story 1.9 makes it honest under adversarial network conditions. After this story, the user can:

- Type a task and trust it appears instantly (Story 1.8).
- See a non-intrusive "still saving" indicator if the network is slow (Story 1.9 — 300 ms gate).
- See an actionable "Retry" affordance with their typed text intact if all retries fail (Story 1.9 — retry-exhausted state).
- Hear screen-reader announcements at each transition (Story 1.9 — LiveRegion).
- Recover via Retry click without losing their typed text (Story 1.9 — `mutationObserver.reset() + mutate(input)`).

The design wager is that a typo-corrected one-liner ("Couldn't save — check connection.") + a single Retry button + the row staying in place is more trustworthy than a modal, banner, or toast. Honoring this contract requires that **no error path silently rolls back the user's typed text**.

The story is **the per-row sync UX layer only**. Out-of-scope and forbidden:

- **Toggle / delete mutations.** Stories 2.2 and 3.2 own those. They will *reuse* this story's `SyncIndicator` / `RetryAction` / `ErrorMessage` sub-components, the `captureSyncStore`, and the announcement-once-per-transition rule. **Do not** add toggle / delete logic to `useCreateTask`, `captureSyncStore`, or TaskRow.
- **Undo flow.** Story 3.4 owns the UndoSnackbar. It is a *reversibility* UI, not a *failure* UI; do not conflate.
- **List-level fetch error.** Story 1.10 owns the in-list "couldn't load tasks" message + `refetchOnReconnect`. This story handles per-row sync failures, not list-load failures.
- **Keyboard navigation.** Story 4.x owns Tab order, arrow keys, `i`-shortcut, typing-anywhere. This story only ensures the new `<button>` elements (RetryAction) are tab-stop-able by default browser semantics.

### Locked Decisions (carry-forward from Stories 1.5–1.8)

- **Frontend framework:** SolidJS 1.9.12. `createSignal`, `onMount`, `createEffect`, `onCleanup`, `<For>`, `<Show>`. **Never destructure component props.**
- **Server-state cache:** `@tanstack/solid-query@5.100.6`. `useMutation` v5 takes a factory-function-shape (`() => ({...})`). `useQueryClient()` accesses the singleton mounted in `index.tsx`.
- **API typing:** Eden Treaty (`@elysiajs/eden@1.4.9`). All API calls go through `apps/web/src/data/api.ts`. Components never import `api` or `tasksApi`.
- **Architecture component-↔-data boundary:** Components consume data exclusively through TanStack Query hooks *or* the new `captureSyncStore`'s read accessor (`useCaptureSyncStatus`). `TaskRow` does not consume `tasksApi.create` directly. `App.tsx` continues to be the only consumer of `useCreateTask`.
- **Styling:** UnoCSS + token CSS custom properties. No new tokens introduced (the `status-pending`, `status-error`, `status-error-subtle`, `accent-default`, `text-primary` tokens already exist in `tokens.css`).
- **No raw `fetch`.** No inline SQL. No `console.log`. No magic numbers (the `300`, `1000`, `30_000`, `4`, `3`, `120` values are exported constants in `apps/web/src/constants.ts`). No `any`. Named exports only.
- **bun:test idiom:** `describe(...)` + `it(...)`.
- **Component tests** use `@solidjs/testing-library` + happy-dom (preloaded by `apps/web/test-setup/happy-dom.ts` in `bunfig.toml`). The `--conditions=browser` flag is required (`bun run test` already wires it).
- **Test seam mutability:** `tasksApi.fetch`, `tasksApi.list`, `tasksApi.create`, `tasksApi.createFetch` are writable properties on a module-level mutable object. `__captureSyncMutators` follows the same pattern.
- **Story 1.8 contract preserved:** the no-rollback / no-invalidation-on-success rule. `onError` exists in this story but does *not* call `setQueryData(tasksQueryKey, context.previous)`. `onSuccess` exists in this story but does *not* call `invalidateQueries`. The store-level state changes are orthogonal to the cache.
- **Story 1.7 / 1.8 stub strategy:** swap `tasksApi.create` directly in `beforeEach`/`afterEach`; mock `client.cancelQueries`/`client.invalidateQueries` per test. Same pattern extends to `__captureSyncMutators` and `__getLiveRegionHistoryForTests`.

### Sync-State Architecture Sketch

```
┌──────────────────────────────────────────────────────────────────────┐
│  App.tsx                                                              │
│    const createTask = useCreateTask();   ← single observer           │
│    onSubmit(text) → createTask.mutate({ id: createUuidV7(), text })  │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  useCreateTask (apps/web/src/data/queries.ts)                        │
│    onMutate:                                                          │
│      setQueryData(["tasks"], optimistic-prepend)                     │
│      setTimeout(() => __captureSyncMutators.markPending(id, retry),  │
│                 SYNC_PENDING_DELAY_MS)                                │
│    mutationFn:    tasksApi.create(input)                              │
│    retry:         per-status (429:4 / 5xx:3 / other 4xx: false)      │
│    retryDelay:    exp + jitter, cap 30s; honors Retry-After on 429   │
│    onSuccess:     clear timer; if was pending, announce("Saved");    │
│                   __captureSyncMutators.clear(id)                     │
│    onError:       clear timer; announce(error msg);                   │
│                   __captureSyncMutators.markExhausted(id, retry)      │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  captureSyncStore (apps/web/src/data/captureSyncStore.ts)            │
│    Solid createStore<{ [id]: { status, retry } }>                    │
│    useCaptureSyncStatus(id) → reactive getter (read-side)            │
│    __captureSyncMutators.{markPending, markExhausted, clear}         │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TaskRow.tsx (apps/web/src/components/TaskRow.tsx)                   │
│    const sync = useCaptureSyncStatus(() => props.task.id);           │
│    <li class={sync()?.status === "exhausted" ? "...--retry-exh" : "..."}>│
│      <Checkbox />  <span>{props.task.text}</span>                    │
│      <Show when={sync()?.status === "pending"}><SyncIndicator /></Show>│
│      <Show when={sync()?.status === "exhausted"}>                    │
│        <RetryAction onRetry={sync()!.retry} />                       │
│      </Show>                                                          │
│      <DeleteButton />                                                 │
│      <Show when={sync()?.status === "exhausted"}><ErrorMessage /></Show>│
│    </li>                                                              │
└──────────────────────────────────────────────────────────────────────┘
```

### `useCreateTask` Implementation Sketch (extension of Story 1.8's hook)

```ts
// apps/web/src/data/queries.ts
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/solid-query";
import {
  RETRY_429_MAX_ATTEMPTS,
  RETRY_5XX_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_MAX_MS,
  RETRY_MAX_DELAY_MS,
  SYNC_PENDING_DELAY_MS,
} from "../constants";
import { announce } from "../components/LiveRegion";
import {
  LIVE_REGION_RETRY_EXHAUSTED,
  LIVE_REGION_SAVED,
  LIVE_REGION_SAVING,
} from "./announcements";
import { TasksApiError, tasksApi, type Task, type TasksPostBody } from "./api";
import {
  __captureSyncMutators,
  __captureSyncStorePeek,
} from "./captureSyncStore";
import { tasksQueryKey } from "./keys";

type CreateTaskContext = { previous: Task[] };

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const computeRetryDecision = (failureCount: number, error: unknown): boolean => {
  if (error instanceof TasksApiError) {
    if (error.status === 429) return failureCount < RETRY_429_MAX_ATTEMPTS;
    if (error.status >= 500 && error.status < 600) return failureCount < RETRY_5XX_MAX_ATTEMPTS;
    return false; // other 4xx fail-fast
  }
  // Network errors / null-data: treat as transient 5xx.
  return failureCount < RETRY_5XX_MAX_ATTEMPTS;
};

const computeRetryDelay = (attempt: number, error: unknown): number => {
  const exponential = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MAX_MS,
    RETRY_MAX_DELAY_MS,
  );
  if (error instanceof TasksApiError && error.status === 429 && error.retryAfterMs !== undefined) {
    return Math.min(Math.max(error.retryAfterMs, exponential), RETRY_MAX_DELAY_MS);
  }
  return exponential;
};

export const useCreateTask = (): UseMutationResult<
  Task,
  Error,
  TasksPostBody,
  CreateTaskContext
> => {
  const queryClient = useQueryClient();
  let observer: UseMutationResult<Task, Error, TasksPostBody, CreateTaskContext>;
  observer = useMutation<Task, Error, TasksPostBody, CreateTaskContext>(() => ({
    mutationKey: ["tasks", "create"],
    mutationFn: (input) => tasksApi.create(input),
    retry: computeRetryDecision,
    retryDelay: computeRetryDelay,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      // shallow copy: snapshot for future rollback hazards in Stories 2.2 / 3.2
      const previous = [...(queryClient.getQueryData<Task[]>(tasksQueryKey) ?? [])];
      const now = Date.now();
      const optimistic: Task = {
        id: input.id,
        text: input.text,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<Task[]>(tasksQueryKey, (prev) => [optimistic, ...(prev ?? [])]);
      const retry = (): void => {
        observer.reset();
        observer.mutate(input);
      };
      const timer = setTimeout(() => {
        __captureSyncMutators.markPending(input.id, retry);
        announce(LIVE_REGION_SAVING);
      }, SYNC_PENDING_DELAY_MS);
      pendingTimers.set(input.id, timer);
      return { previous };
    },
    onSuccess: (_data, input) => {
      const t = pendingTimers.get(input.id);
      if (t !== undefined) clearTimeout(t);
      pendingTimers.delete(input.id);
      const wasPending = __captureSyncStorePeek(input.id)?.status === "pending";
      __captureSyncMutators.clear(input.id);
      if (wasPending) announce(LIVE_REGION_SAVED);
    },
    onError: (_error, input) => {
      const t = pendingTimers.get(input.id);
      if (t !== undefined) clearTimeout(t);
      pendingTimers.delete(input.id);
      const retry = (): void => {
        observer.reset();
        observer.mutate(input);
      };
      __captureSyncMutators.markExhausted(input.id, retry);
      announce(LIVE_REGION_RETRY_EXHAUSTED);
      // No setQueryData rollback — the no-rollback contract is preserved.
    },
  }));
  return observer;
};
```

Notes:

- `computeRetryDecision` and `computeRetryDelay` are exported (or re-exported) for unit testing.
- The `observer` `let` binding is the documented v5 Solid Query pattern for capturing the mutation observer inside lifecycle callbacks. The reference is stable across re-renders.
- `__captureSyncStorePeek` is a non-reactive read used only inside the hook (reactive reads belong to components). It is internal, not part of the component API.
- `Math.random()` is fine for jitter (cryptographic randomness is overkill — the goal is thundering-herd avoidance, not unpredictability).

### `captureSyncStore` Implementation Sketch

```ts
// apps/web/src/data/captureSyncStore.ts
import { createStore, reconcile } from "solid-js/store";

export type CaptureSyncStatus = "pending" | "exhausted";
export type CaptureSyncEntry = { status: CaptureSyncStatus; retry: () => void };

const [entries, setEntries] = createStore<Record<string, CaptureSyncEntry | undefined>>({});

export const useCaptureSyncStatus = (
  id: () => string,
): (() => CaptureSyncEntry | undefined) => () => entries[id()];

export const __captureSyncStorePeek = (id: string): CaptureSyncEntry | undefined => entries[id];

export const __captureSyncMutators = {
  markPending: (id: string, retry: () => void): void =>
    setEntries(id, { status: "pending", retry }),
  markExhausted: (id: string, retry: () => void): void =>
    setEntries(id, { status: "exhausted", retry }),
  clear: (id: string): void => setEntries(id, undefined),
};

export const __resetCaptureSyncStoreForTests = (): void => {
  setEntries(reconcile({}));
};
```

Notes:

- Solid's `createStore` provides fine-grained reactivity *per-key*; `entries[id()]` only re-runs when the entry at that specific id changes.
- `reconcile({})` is the canonical Solid pattern for replacing a store entirely. Acceptable for tests; not used in production paths.
- The `__` prefix marks internals — not consumed from components, only from `useCreateTask` and tests.

### `TaskRow` Sketch (extension)

```tsx
// apps/web/src/components/TaskRow.tsx
import { Show, type JSX } from "solid-js";
import type { Task } from "../data/api";
import { useCaptureSyncStatus } from "../data/captureSyncStore";
import { LIVE_REGION_RETRY_EXHAUSTED } from "../data/announcements";
import "./TaskRow.css";

interface TaskRowProps {
  task: Task;
}

export function TaskRow(props: TaskRowProps): JSX.Element {
  const sync = useCaptureSyncStatus(() => props.task.id);
  return (
    <li
      tabindex="0"
      class="task-row flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
      classList={{ "task-row--retry-exhausted": sync()?.status === "exhausted" }}
    >
      <div class="task-row__primary flex items-center gap-3">
        <Checkbox />
        <span class="task-row__text">{props.task.text}</span>
        <Show when={sync()?.status === "pending"}>
          <SyncIndicator />
        </Show>
        <Show when={sync()?.status === "exhausted"}>
          <RetryAction onRetry={sync()!.retry} />
        </Show>
        <DeleteButton />
      </div>
      <Show when={sync()?.status === "exhausted"}>
        <ErrorMessage />
      </Show>
    </li>
  );
}

function SyncIndicator(): JSX.Element {
  return <span aria-label="Saving" class="task-row__sync-indicator" />;
}

function ErrorMessage(): JSX.Element {
  return <p class="task-row__error-message">{LIVE_REGION_RETRY_EXHAUSTED}</p>;
}

function RetryAction(props: { onRetry: () => void }): JSX.Element {
  return (
    <button
      type="button"
      class="task-row__retry-action"
      onClick={() => props.onRetry()}
    >
      Retry
    </button>
  );
}

// Checkbox / DeleteButton / TrashIcon: unchanged from Story 1.7.
```

```css
/* apps/web/src/components/TaskRow.css */
.task-row__sync-indicator {
  width: 14px;
  height: 14px;
  border: 2px dashed var(--color-status-pending);
  border-radius: 9999px;
  display: inline-block;
  flex-shrink: 0;
  animation: task-row__sync-spin 1500ms linear infinite;
}

@keyframes task-row__sync-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .task-row__sync-indicator {
    animation: none;
  }
}

.task-row--retry-exhausted {
  background: var(--color-status-error-subtle);
}

.task-row__error-message {
  font-size: 0.875rem;
  line-height: 1.4;
  font-weight: 400;
  color: var(--color-status-error);
  margin-top: 4px;
}

.task-row__retry-action {
  font-size: 0.875rem;
  line-height: 1.4;
  font-weight: 500;
  color: var(--color-accent-default);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 4px 8px;
}

.task-row__retry-action:focus-visible {
  outline: 2px solid var(--color-accent-default);
  outline-offset: 2px;
}
```

Notes:

- `classList` is Solid's reactive class-toggle helper — re-applies only the changed class.
- `props.onRetry` is **not destructured** (Solid prop-reactivity rule).
- The `<li>`'s flex direction switches from `flex items-center` (Story 1.7) to `flex flex-col` so the `ErrorMessage` block can sit below the primary row. The primary row preserves the original `flex items-center gap-3`.
- The `data-testid` attribute is *not* added — the project's anti-pattern rule from Story 1.7 holds; the existing `getByLabelText("Saving")`, `getByText("Couldn't save…")`, `getByRole("button", { name: "Retry" })` cover the assertions.

### `LiveRegion` Queue Implementation Sketch

```tsx
// apps/web/src/components/LiveRegion.tsx
import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { LIVE_REGION_DRAIN_INTERVAL_MS } from "../constants";

const queue: string[] = [];
const history: string[] = [];
let mounted = false;
let draining = false;
const [message, setMessage] = createSignal("");

const drain = (): void => {
  if (draining || !mounted) return;
  const next = queue.shift();
  if (next === undefined) return;
  draining = true;
  setMessage("");
  queueMicrotask(() => {
    setMessage(next);
    history.push(next);
    setTimeout(() => {
      draining = false;
      drain();
    }, LIVE_REGION_DRAIN_INTERVAL_MS);
  });
};

export const announce = (next: string): void => {
  queue.push(next);
  drain();
};

export function LiveRegion(): JSX.Element {
  onMount(() => {
    mounted = true;
    drain();
  });
  onCleanup(() => {
    mounted = false;
  });
  return (
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {message()}
    </div>
  );
}

export const __resetLiveRegionForTests = (): void => {
  queue.length = 0;
  history.length = 0;
  mounted = false;
  draining = false;
  setMessage("");
};

export const __getLiveRegionMessageForTests = (): string => message();
export const __getLiveRegionHistoryForTests = (): readonly string[] => history;
```

Notes:

- The queue + sentinel pattern resolves Story 1.5 deferred-work items (a), (b), (c) cited in Story 1.8's hand-off note.
- The `LIVE_REGION_DRAIN_INTERVAL_MS = 120` is short enough that two announcements feel concurrent to a sighted user but long enough that screen readers register the transition (most ATs poll politely-live regions every ~50–100 ms; 120 ms ensures one full cycle).
- HMR-multi-mount is handled by the mount sentinel — only one mount, only one drain stream.

### `Retry-After` Parser Sketch

```ts
// apps/web/src/data/retryAfter.ts (or inline in api.ts — exercise judgment)
export const parseRetryAfter = (value: string | null): number | undefined => {
  if (value === null || value === "") return undefined;
  // RFC 7231 §7.1.3: delta-seconds (digits) | HTTP-date (RFC 5322).
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) * 1000;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return undefined;
  return Math.max(0, ms - Date.now());
};
```

### Test Stub Strategy for `useCreateTask retry policy` and `useCreateTask sync state`

For the **retry-policy tests**, the cleanest pattern is to read the cached mutation observer's options after a single mutation has been triggered:

```ts
it("retry returns true for status 429 up to 4 times then false", async () => {
  tasksApi.create = mock((): Promise<Task> => Promise.resolve(serverTask));
  const client = makeMutationClient();
  const probe = renderProbe(client);
  probe.mutation().mutate({ id: "0193f000-0000-7000-8000-00000000aa01", text: "x" });
  await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
  const cachedMutation = client.getMutationCache().getAll().at(-1);
  const opts = cachedMutation?.options as {
    retry?: (count: number, error: unknown) => boolean;
  };
  const err = new TasksApiError({ status: 429, message: "rate_limited" });
  expect(opts.retry?.(0, err)).toBe(true);
  expect(opts.retry?.(3, err)).toBe(true);
  expect(opts.retry?.(4, err)).toBe(false);
});
```

For the **300 ms threshold tests**, use real `setTimeout`-based waits — Bun's test runner does not ship fake timers and Story 1.7 / 1.8 established the real-timer precedent for time-based assertions:

```ts
it("does not mark pending if the mutation resolves before 300 ms", async () => {
  tasksApi.create = mock((): Promise<Task> => new Promise<Task>((r) => setTimeout(() => r(serverTask), 100)));
  const client = makeMutationClient();
  const probe = renderProbe(client);
  probe.mutation().mutate({ id: "...", text: "fast" });
  await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
  expect(__captureSyncStorePeek("...")).toBeUndefined();
  expect(__getLiveRegionHistoryForTests()).toEqual([]);
});

it("marks pending after 300 ms when the mutation has not resolved", async () => {
  let resolveMutation: (task: Task) => void = () => undefined;
  tasksApi.create = mock(
    (): Promise<Task> => new Promise<Task>((r) => { resolveMutation = r; }),
  );
  const client = makeMutationClient();
  const probe = renderProbe(client);
  probe.mutation().mutate({ id: "abc", text: "slow" });
  await new Promise((r) => setTimeout(r, 350));
  expect(__captureSyncStorePeek("abc")?.status).toBe("pending");
  expect(__getLiveRegionHistoryForTests()).toContain(LIVE_REGION_SAVING);
  resolveMutation(serverTask);
  await waitFor(() => (probe.mutation().isSuccess ? true : undefined));
  expect(__captureSyncStorePeek("abc")).toBeUndefined();
  expect(__getLiveRegionHistoryForTests()).toContain(LIVE_REGION_SAVED);
});
```

For the **announcement-history capture pattern**, the new `__getLiveRegionHistoryForTests()` returns the chronological list of drained messages. Reset between tests via `__resetLiveRegionForTests()` in `beforeEach`. Note: the queue's drain is asynchronous (microtask + 120 ms delay between messages), so the test must `await` enough real time for the drain to flush. A `await new Promise(r => setTimeout(r, 200))` after the last `announce()` call is sufficient.

### `e2e/error-recovery.spec.ts` Sketch

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PENDING_THRESHOLD_MS = 300;
const POST_DELAY_MS = 800;

test("pending state — SyncIndicator appears after 300 ms then unmounts on success", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, POST_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  const text = `pending ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");
  await expect(page.locator('[aria-label="Saving"]')).toBeVisible({ timeout: 1000 });
  await expect(page.locator('[aria-label="Saving"]')).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
});

test("retry-exhausted state — RetryAction appears, row stays in place (no rollback)", async ({ page }) => {
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "validation_error", message: "test-induced" },
          requestId: "test",
        }),
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  const text = `exhausted ${Date.now()}`;
  const preCount = await page.getByRole("listitem").count();
  await input.fill(text);
  await input.press("Enter");
  const row = page.getByRole("listitem").filter({ hasText: text });
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("Couldn't save — check connection.")).toBeVisible();
  expect(await page.getByRole("listitem").count()).toBe(preCount + 1);

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking).toEqual([]);
});

test("retry click resets to pending then succeeds", async ({ page }) => {
  let firstAttempt = true;
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST" && firstAttempt) {
      firstAttempt = false;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "validation_error", message: "first-attempt-fail" },
          requestId: "test",
        }),
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  await expect(input).toBeFocused();
  const text = `recovered ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText("Couldn't save — check connection.")).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: text })).toBeVisible();
});

test("reduced-motion suppresses SyncIndicator rotation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, POST_DELAY_MS));
    }
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("New task");
  const text = `reduced ${Date.now()}`;
  await input.fill(text);
  await input.press("Enter");
  const indicator = page.locator('[aria-label="Saving"]');
  await expect(indicator).toBeVisible({ timeout: 1000 });
  const animationName = await indicator.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
});
```

### Previous Story Intelligence (Stories 1.5 + 1.6 + 1.7 + 1.8 carryover)

**Story 1.5 (frontend foundation):**
- `<QueryClientProvider client={queryClient}>` wraps `<App />` in `index.tsx`. `useQueryClient()` accesses the same singleton.
- `<LiveRegion />` mounted exactly once at `index.tsx`. **This story rewrites `LiveRegion.tsx` internals (queue + mount sentinel)** but the mount layout in `index.tsx` is unchanged.
- `<ErrorBoundary>` catches render errors only — not mutation `onError` (TanStack Query observes those; this story handles them in the hook lifecycle).
- `apps/web/src/data/uuid.ts` exports `createUuidV7()` — unchanged. Story 1.8 introduced the runtime consumer; this story does not generate new UUIDs (retry uses the same id).

**Story 1.6 (TaskInput):**
- `apps/web/src/components/TaskInput.tsx` is the input component. **Do not modify** in this story.
- The `onSubmit(text: string)` callback contract is unchanged.

**Story 1.7 (TaskList):**
- `apps/web/src/components/TaskList.tsx` consumes `useTasks` and renders the four list states. **Do not modify** in this story.
- `apps/web/src/components/TaskRow.tsx` renders the active state of a task with co-located Checkbox / DeleteButton sub-components. **This story extends TaskRow** with three new sub-components (SyncIndicator, ErrorMessage, RetryAction) and a class-toggle for the retry-exhausted background. The XSS regression test must continue to pass for both pending and exhausted states.

**Story 1.8 (optimistic capture):**
- `useCreateTask` hook structure (factory shape, `mutationFn`, `onMutate`, optimistic prepend, no rollback). **This story extends `onMutate` and adds `onSuccess` / `onError` / `retry` / `retryDelay` / `mutationKey`.**
- `tasksApi.create` / `tasksApi.createFetch` seam. **This story refactors `tasksApi.create` / `tasksApi.list` to throw `TasksApiError` instead of bare `Error`.** The widened error type is a load-bearing input to the retry-policy tests.
- `App.tsx` consumes `useCreateTask`. **No change** to App.tsx in this story — the hook's expanded surface is invisible to the caller.
- Test stub mechanism (`tasksApi.create = mock(...)` swap-in pattern; `makeClient()` / `makeMutationClient()` helpers; `Probe` component). **This story extends `queries.test.tsx` with new `describe("useCreateTask retry policy")` and `describe("useCreateTask sync state")` blocks; the existing `describe("useCreateTask")` is preserved verbatim.**
- Playwright `e2e/capture.spec.ts`. **No change.** This story adds `e2e/error-recovery.spec.ts` as the second e2e spec for the project; `smoke.spec.ts` and `capture.spec.ts` continue to pass.
- Story 1.8 deferred-work items (a), (b), (c) for `LiveRegion.announce` are addressed by AC #15. Item — `previous` array reference — is addressed by AC #16.

### Git Intelligence Summary (recent commits)

- `9223923 Story 1.8` — `useCreateTask` mutation hook, TasksApiError-less `tasksApi.create`, `e2e/capture.spec.ts`. **Most relevant precedent.** This story extends every surface that 1.8 introduced.
- `7e7e00e Story 1.7` — `useTasks` query hook, four-state TaskList, TaskRow active-state rendering, XSS regression. The TaskRow sub-component co-location pattern is established here.
- `30def48 Story 1.6` — TaskInput component + happy-dom test setup. **The happy-dom infrastructure is the foundation for the LiveRegion test rewrite (AC #15).**
- `1692502 Story 1.5` — frontend foundation. `<QueryClientProvider>` + `<LiveRegion />` + `<ErrorBoundary>` mount layout. UUIDv7 generator. The original (single-signal) LiveRegion implementation is what AC #15 replaces.
- `8e3f0d2 Review story 1.4` — backend POST/GET contract that this story consumes via `tasksApi.create`. The 429 + Retry-After semantics shipped here.

### File Structure Requirements

**Create:**

```text
apps/web/src/data/captureSyncStore.ts                 # AC #5
apps/web/src/data/announcements.ts                    # AC #7, #15
apps/web/src/components/TaskRow.css                   # AC #3, #4, #10  (or append to styles/reset.css — see Project Structure Notes)
apps/web/src/data/retryAfter.ts                       # AC #2  (optional — may co-locate in api.ts)
e2e/error-recovery.spec.ts                            # AC #14
```

**Modify:**

```text
apps/web/src/constants.ts                             # add SYNC_PENDING_DELAY_MS, RETRY_*, LIVE_REGION_DRAIN_INTERVAL_MS
apps/web/src/data/api.ts                              # add TasksApiError, refactor tasksApi.create / .list to throw it; widen response types
apps/web/src/data/queries.ts                          # extend useCreateTask with retry policy + sync-state lifecycle
apps/web/src/data/queries.test.tsx                    # add describe("useCreateTask retry policy") + describe("useCreateTask sync state")
apps/web/src/components/TaskRow.tsx                   # add SyncIndicator + ErrorMessage + RetryAction sub-components + classList
apps/web/src/components/TaskRow.test.tsx              # add describe("TaskRow sync states")
apps/web/src/components/LiveRegion.tsx                # rewrite with queue + mount sentinel + history accessor
apps/web/src/components/LiveRegion.test.tsx           # rewrite from source-substring assertions to behavioral tests
```

**Do not modify** without strong cause:

```text
apps/web/src/index.tsx                                # QueryClient + LiveRegion mount is correct
apps/web/src/App.tsx                                  # useCreateTask consumer surface is unchanged
apps/web/src/components/TaskInput.tsx                 # Story 1.6 contract; do not touch
apps/web/src/components/TaskInput.test.tsx            # Story 1.6 tests; do not touch
apps/web/src/components/TaskList.tsx                  # Story 1.7 contract; the cache surfaces optimistic + exhausted rows transparently
apps/web/src/components/TaskList.test.tsx             # Story 1.7 tests; do not touch
apps/web/src/components/EmptyState.tsx                # no change
apps/web/src/components/LoadingState.tsx              # no change
apps/web/src/components/ErrorBoundary.tsx             # render errors only
apps/web/src/data/uuid.ts                             # consumed, not modified
apps/web/src/data/keys.ts                             # tasksQueryKey already exported
apps/web/src/styles/tokens.css                        # token set is complete; status-pending / -error / -error-subtle already defined for both light + dark
apps/web/uno.config.ts                                # no token change; the new BEM-style classes are plain CSS
apps/api/**                                           # backend untouched
e2e/smoke.spec.ts                                     # baseline boot-and-focus assertion
e2e/capture.spec.ts                                   # Story 1.8's spec — must continue to pass
playwright.config.ts                                  # config is correct as-is
bunfig.toml                                           # test preload is correct as-is
package.json (root) and apps/web/package.json         # no new deps
```

### Architecture Boundaries Reaffirmed

- **API boundary:** `Task` and the mutation request/response shapes flow from `apps/api/src/routes/tasks.ts` → `@bmad-todo-app/api` → `apps/web/src/data/api.ts` (Eden + re-export + TasksApiError) → `apps/web/src/data/queries.ts` → `App.tsx`. **No runtime backend code crosses this boundary.** `import type` for `Task`.
- **Component-↔-data boundary:** Components consume data exclusively through TanStack Query hooks (`useTasks`, `useCreateTask` indirect via App.tsx) *or* the new `useCaptureSyncStatus` read accessor. Components never call `__captureSyncMutators` or `tasksApi.*` directly.
- **Storage boundary:** untouched — backend is unchanged.
- **Configuration boundary:** untouched — no env access added.

### Anti-Patterns to Avoid

- **Do not** call `setQueryData(tasksQueryKey, context.previous)` from `onError`. The no-rollback contract from Story 1.8 / UX-DR16 / FR27 is preserved. The optimistic row stays in place; the row-local sync-pending and retry-exhausted states are the user-visible failure surface. **This is the most load-bearing rule of the story** — violating it makes the user's typed text disappear under failure, the exact UX disaster the story is built to prevent.
- **Do not** call `queryClient.invalidateQueries(tasksQueryKey)` from `onSuccess`, `onSettled`, or `onError`. Story 1.8's no-invalidation contract holds.
- **Do not** generate a new UUIDv7 inside the retry callback. Use the same `input.id` from the original mutation so the server-side `INSERT OR IGNORE` recognizes the idempotent retry (Story 1.4 contract).
- **Do not** add per-row `aria-live` attributes to TaskRow, SyncIndicator, ErrorMessage, or RetryAction. The single global `<LiveRegion />` mounted in `index.tsx` is the only announcement channel (UX-DR10). Per-row live regions cause announcement spam under multi-row pending.
- **Do not** show the SyncIndicator before 300 ms have elapsed. UX-DR16's silent fast-path (Story 1.8) requires no visible indicator on sub-300 ms round-trips. The 300 ms threshold is the bright line.
- **Do not** announce `"Saved"` if the row never became visually pending. The silent fast-path requires silent success. Announce `"Saved"` only as a transition-out-of-pending signal.
- **Do not** add a CSS transition on the row-error background. The state shift is instantaneous; a transition would feel like the row is "fading in" the failure, contradicting UX-DR22's "be honest, be quiet" copy voice.
- **Do not** add an entrance animation to the SyncIndicator, ErrorMessage, or RetryAction. UX-DR16's `motion.instant` extends to per-state UI; only the SyncIndicator's intrinsic 1.5 s rotation is an exception, and it is suppressed under reduced-motion.
- **Do not** use a warning-amber color for the SyncIndicator. The token is `color.status.pending` (neutral grey, `#A1A1AA` light / `#71717A` dark). Amber would imply "something is wrong" — but pending is "still saving, all is well."
- **Do not** use a hyphen-minus `-` in `"Couldn't save — check connection."`. The em-dash `—` (U+2014) is the spec, per UX-DR22. The same applies to the LiveRegion announcement constant.
- **Do not** use a regular dot `.` after `"Saving"`. The character is the ellipsis `…` (U+2026). Test assertions must use the exact code points; concatenating `"Saving"` + `"."` + `"."` + `"."` would silently fail string-equality.
- **Do not** call `LiveRegion.announce(...)` from `TaskRow`, `SyncIndicator`, `ErrorMessage`, or `RetryAction`. The hook (`useCreateTask`) is the only producer of announcements in this story. Per-component announces would cause double-announce under re-render.
- **Do not** introduce a per-row `useEffect`/`createEffect` that calls `LiveRegion.announce(...)` based on the store's pending/exhausted transitions. The hook lifecycle is the source of truth; the store is a *display* signal, not an *announcement* signal.
- **Do not** add `data-testid="..."` attributes to the new sub-components. The project's anti-pattern from Story 1.7 holds; `getByLabelText`, `getByText`, `getByRole` cover all assertions.
- **Do not** introduce `useMutationState` from `@tanstack/solid-query` as the per-row state mechanism. The architecture choice is the explicit `captureSyncStore` because (a) the 300 ms threshold is product-specific UI behavior, not TanStack mutation state, (b) the retry callback needs an in-store, easily-readable handle, and (c) `useMutationState`'s reactivity model is observed-array-style and adds noise to the per-row read path. `useMutationState` may be revisited if Stories 2.x / 3.x's per-mutation-type concurrency requires a different pattern.
- **Do not** wire `<Show when={createTask.isPending}>` UI in `App.tsx`. Per-row state is the only sync surface; a single global "saving" indicator would conflict with the row-local UX commitment.
- **Do not** introduce a Toast / Snackbar / global banner for retry-exhausted state. UX-DR16's row-local-failure rule is absolute. The UndoSnackbar (Story 3.4) is the only floating UI element; it is delete-specific, not failure-specific.
- **Do not** add a "Cancel" or "Dismiss" affordance to the retry-exhausted state. The user's only options are: click Retry, type more (the input is still focused after Story 1.6's contract), or close the tab (which loses the row, per the documented MVP tradeoff in the UX spec node X).
- **Do not** change `tasksApi.list`'s thrown-error type *without* updating `useTasks`'s `error` consumers. Story 1.7 / 1.10 / future stories may inspect `error.message`; widening to `TasksApiError` is additive (still extends `Error`), but a careless `instanceof` check upstream would silently reclassify failures. Verify by running the full unit-test suite after the api.ts change.
- **Do not** replace the LiveRegion's queue with a `setTimeout(..., 0)` chain. The microtask + delay pattern is intentional — microtask gives Solid a chance to flush prior reactivity cycles; the 120 ms delay gives screen readers a chance to register the transition.
- **Do not** add `--no-verify`, `// @ts-ignore`, or `// @ts-expect-error` to bypass TypeScript errors from the widened `TasksApiError`. The error-discriminant pattern (`if (error instanceof TasksApiError) { ... }`) typechecks cleanly with the existing TanStack Query generic constraints.
- **Do not** modify `e2e/smoke.spec.ts` or `e2e/capture.spec.ts`. They are baseline / Story 1.8 specs.
- **Do not** delete `tasksApi.fetch` / `tasksApi.list` / `tasksApi.create` / `tasksApi.createFetch`. Existing tests depend on those properties; the new `TasksApiError` is the *thrown type* of `list` / `create`, not a replacement for the seam.

### Project Structure Notes

The story aligns with the architecture's frontend layout (`apps/web/src/data/queries.ts`, `apps/web/src/data/api.ts`, `apps/web/src/components/TaskRow.tsx` per `architecture/project-structure-boundaries.md`). The new `captureSyncStore.ts`, `announcements.ts`, and `retryAfter.ts` belong in `apps/web/src/data/` alongside the existing data-layer modules.

**CSS file location decision** — two acceptable options, dev's discretion:

- **Option A (preferred):** new `apps/web/src/components/TaskRow.css` colocated with `TaskRow.tsx`, imported via `import "./TaskRow.css"` at the top of `TaskRow.tsx`. Vite handles colocated CSS imports natively. **Pros:** aligns with the architecture's "co-located concerns" pattern; isolates TaskRow-specific styles from the global reset.
- **Option B:** append the new keyframes / `.task-row__*` rules / `prefers-reduced-motion` block to `apps/web/src/styles/reset.css`. **Pros:** matches the existing precedent (LoadingState's `motion.medium` shimmer rules live in `reset.css` per Story 1.7). **Cons:** grows the global stylesheet beyond its "reset" mandate.

Document the choice in the Dev Agent Record's deviations section.

`e2e/error-recovery.spec.ts` is the third of the five Playwright specs the architecture's `project-structure-boundaries.md` lists (`capture.spec.ts | manage.spec.ts | keyboard.spec.ts | error-recovery.spec.ts | empty-error-states.spec.ts`). Story 1.9 brings the count from two (`smoke.spec.ts`, `capture.spec.ts`) to three; Story 1.10 will add `empty-error-states.spec.ts`; Stories 2.x / 3.x / 4.x will fill out `manage.spec.ts` and `keyboard.spec.ts`.

### Testing Requirements

- **Unit test runner:** `bun:test`. Idiom: `describe(...)` + `it(...)`.
- **Component testing library:** `@solidjs/testing-library`. `render`, `cleanup`, `fireEvent`. `cleanup()` in `afterEach`.
- **DOM:** real DOM via the happy-dom registrator preload (already wired by Story 1.6).
- **Test invocation:** `bun run test` (root script — `bun test apps --conditions=browser`).
- **TanStack Query test client:** each `it()` constructs a fresh `QueryClient` via `makeClient()` or `makeMutationClient()` (the latter zeros mutation retries — needed for the error-path tests so retries don't blow the per-test timeout). Both helpers already exist in `queries.test.tsx`.
- **Stub seams:**
  - `tasksApi.create = mock(...)` (and restore in `afterEach`). Same pattern as Story 1.7 / 1.8.
  - `tasksApi.createFetch = mock(...)` for tests that need to drive specific HTTP statuses through the envelope-parsing path (e.g., the `Retry-After` parsing tests).
  - `client.cancelQueries = mock(...)` and `client.invalidateQueries = mock(...)` per-test (TypeScript will require `as unknown as typeof client.cancelQueries`).
  - `__captureSyncStorePeek(id)` for non-reactive reads of the store from inside tests; `__resetCaptureSyncStoreForTests()` in `beforeEach` to keep tests isolated.
  - `__getLiveRegionHistoryForTests()` for announcement-history assertions; `__resetLiveRegionForTests()` in `beforeEach`.
- **Probe component pattern:** mirror Story 1.8's `Probe`; capture the mutation observer via `captured = useCreateTask()` inside the component.
- **Real timers, not fake timers:** Bun's test runner does not ship fake timers preconfigured; use real `setTimeout`-based `await new Promise(r => setTimeout(r, ms))` for time-based assertions. Bound the test timeout via the `it("...", { timeout: 5000 })` option if needed.
- **Coverage target:** ≥ 80 % statements on `data/queries.ts`, `data/captureSyncStore.ts`, `components/TaskRow.tsx`, `components/LiveRegion.tsx`. The 11 retry-policy + 4 sync-state + 7 component + 1 LiveRegion tests cover the surface comfortably.
- **Playwright:** chromium / firefox / webkit projects (already configured). `webServer` runs `bun run dev` automatically. `AxeBuilder` from `@axe-core/playwright` (already a root devDep). Use `page.getByLabel("Saving")`, `page.getByRole("button", { name: "Retry" })`, `page.getByText("Couldn't save — check connection.")` — never CSS selectors when an accessibility query works (consistent with Story 1.5's accessibility-first posture).
- **Network stubbing in Playwright:** `await page.route("**/api/tasks", async (route) => { ... })`. Stub before `page.goto`. Use `page.unroute(...)` to clear the interception mid-test for the retry-recovery scenario.
- **`page.emulateMedia({ reducedMotion: "reduce" })`** for the reduced-motion equivalence test.
- **Cross-browser timing-window margin:** the 300 ms threshold may exhibit a few ms of jitter under webkit; bound the SyncIndicator-visibility assertion to `{ timeout: 1000 }` to absorb noise without weakening the contract (the 300 ms threshold is a product rule, not a 300 ms exact-equality assertion).
- **No regression on Stories 1.5–1.8 tests:** all 147 existing tests must continue to pass. The new tests are additive.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.9-Sync-Pending-Indicator-and-Retry-Exhausted-State-for-Capture] — story statement and BDD acceptance criteria.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-4-Error-recovery-network-failure] — silent < 300 ms success path; sync-pending after 300 ms; retry-exhausted; no-rollback contract; error-state copy.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Sync-pending-state-FR25] — 14 × 14 dashed circle 1.5 s rotation, `color.status.pending`, ARIA live, reduced-motion fallback.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Retry-exhausted-state-FR26] — `status.error.subtle` row background, inline ErrorMessage `text.meta` `color.status.error`, RetryAction `text.meta` weight 500 `color.accent.default`, task text remains `color.text.primary`.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#LiveRegion-announcements] — `"Saving…"`, `"Saved"`, `"Couldn't save — check connection."` copy and announce-once-per-transition rule.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Reduced-motion] — animation suppressed; static dashed circle remains; LiveRegion carries the semantic.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Content-and-voice-rules] — em-dash, sentence case, no marketing copy, no apology.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D7---Server-state-cache-tanstack-solid-query] — TanStack Solid Query mutation retry / retryDelay schedule (ARCH-AR11); `onError` does NOT roll back the cache.
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D6---Rate-limiting] — 429 responses include `Retry-After` + `X-RateLimit-*` headers (ARCH-AR10).
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#D4---Error-envelope] — `{ error: { code, message, details? }, requestId }` with closed `ErrorCode` union (ARCH-AR8).
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#TanStack-Solid-Query-rules] — Optimistic mutations always set `onMutate`, `onError`, `onSettled`. `onError` does **not roll back** the cache.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Solid-specific-rules] — Never destructure component props; `createStore` for object state.
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Anti-Patterns-forbidden] — no inline SQL, no `any`, no `console.log`, no magic numbers, no default exports.
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Cross-Cutting-NFR-Locations] — NFR-M2 five Playwright specs; this story adds `e2e/error-recovery.spec.ts`.
- [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements] — FR22 (background-op announcements), FR23 (optimistic), FR24 (background retry), FR25 (sync-pending indicator), FR26 (retry-exhausted with action), FR27 (never silently lose).
- [Source: _bmad-output/implementation-artifacts/1-8-optimistic-task-creation-happy-path.md#Dev-Agent-Record] — `tasksApi.create` / `tasksApi.createFetch` mutable seam (deviation #2 carryover); Eden type-cast extension (deviation #4 carryover); `makeMutationClient` helper (deviation #5 extended); `Date.now()`-stamped E2E texts (deviation #5).
- [Source: _bmad-output/implementation-artifacts/1-8-optimistic-task-creation-happy-path.md#Review-Findings] — `previous` mutation context retains live array reference (deferred hand-off; addressed by AC #16).
- [Source: _bmad-output/implementation-artifacts/1-7-task-list-display-tasklist-taskrow-active-state-emptystate-loadingstate.md#Dev-Agent-Record] — TaskRow co-located sub-component pattern; `data-testid` minimization rule.
- [Source: _bmad-output/implementation-artifacts/1-5-frontend-foundation-solid-app-design-tokens-eden-client-errorboundary-liveregion.md#Dev-Agent-Record] — `<QueryClientProvider>` + `<LiveRegion />` mount layout; UUIDv7 generator implementation; reduced-motion CSS reset implementation.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — open deferred items relevant to this surface: LiveRegion `announce()` queue limitations (addressed by AC #15); `previous` mutation context (addressed by AC #16); reduced-motion `animation: none` vs. `animation-duration: 0ms` (this story uses `animation: none` per the WebKit-recommended pattern from the deferred-work item).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Opus 4.7, 1M context)

### Debug Log References

- `bun test apps --conditions=browser` → 185 pass / 0 fail / 1021 expects across 24 files; coverage 97.81% funcs / 96.87% lines.
- `bun run check` → oxlint clean, oxfmt clean, tsgo `-b --noEmit` clean, dep-count 6/25 root, 17/25 web, 2/25 api.
- `bun run check:full` → unit tests + audit + Vite build (main chunk 26 KB gzipped, limit 100 KB) all pass.
- `bun playwright test` → 30/30 pass across chromium / firefox / webkit (4 new error-recovery tests + 5 capture + 1 smoke per browser).

### Completion Notes List

**Implementation summary**

- **AC #1, #2:** `TasksApiError` added in `apps/web/src/data/api.ts` with `status`, `code`, `retryAfterMs`, and `cause` fields. `tasksApi.list` and `tasksApi.create` now throw `TasksApiError` instead of bare `Error`; `create` reads `Retry-After` from the Eden Treaty `response.headers` when status is 429. `parseRetryAfter` lives in `apps/web/src/data/retryAfter.ts` (separate module — kept api.ts focused on the wire surface) and supports both delta-seconds and HTTP-date formats per RFC 7231.
- **AC #1, #6, #7, #8, #16:** `useCreateTask` extended in `apps/web/src/data/queries.ts` with `mutationKey: ["tasks", "create"]`, `retry: computeRetryDecision`, `retryDelay: computeRetryDelay`, full `onMutate`/`onSuccess`/`onError` lifecycle. `computeRetryDecision` and `computeRetryDelay` are exported as pure functions for direct unit testing (cleaner than reaching into `getMutationCache().getAll()[0].options`). The defensive `previous = [...cache]` shallow-copy snapshot from AC #16 is in place with an inline comment. The retry closure uses an `observer` `let` binding captured before `useMutation` returns; the `pendingTimers` Map is module-scoped with a `__clearPendingTimersForTests` cleanup helper added to keep tests isolated. `onMutate` also added an idempotent guard so a retry doesn't double-prepend the optimistic row when `setQueryData` re-runs.
- **AC #5, #6, #8:** `apps/web/src/data/captureSyncStore.ts` exports `useCaptureSyncStatus` (reactive read accessor), `__captureSyncStorePeek` (non-reactive read for hook lifecycle), `__captureSyncMutators` (markPending / markExhausted / clear), and `__resetCaptureSyncStoreForTests`. Solid `createStore` + `reconcile` for full reset.
- **AC #3, #4, #9, #10, #12:** `TaskRow.tsx` gained three sub-components (`SyncIndicator`, `ErrorMessage`, `RetryAction`) and the `task-row__primary` flex wrapper. The `<li>` switched to `flex flex-col` so `ErrorMessage` sits as a sibling block below the primary row. `classList` toggles `task-row--retry-exhausted`. The new CSS lives in colocated `apps/web/src/components/TaskRow.css` (Option A — see Deviations).
- **AC #7, #15:** `LiveRegion.tsx` rewritten with a queue + history + `mounted` sentinel + `draining` flag; drain pumps `setMessage("") → microtask → setMessage(next) → 120 ms inter-message delay`. `__getLiveRegionHistoryForTests` added. `LiveRegion.test.tsx` upgraded from source-substring assertions to behavioral tests under happy-dom (5 cases including pre-mount queueing).
- **AC #11, #13:** `queries.test.tsx` extended with `useCreateTask retry policy` (8 cases) and `useCreateTask sync state` (5 cases). Pure `computeRetryDecision`/`computeRetryDelay` tests cover the matrix; sync-state tests render `<LiveRegion />` alongside the probe so the queue actually drains. Existing 5 `useCreateTask` tests preserved (one updated to throw `TasksApiError({ status: 400 })` instead of plain `Error("network")` — fail-fast keeps the no-rollback assertion fast under the new retry policy; the assertion shape and the no-rollback contract are unchanged).
- **AC #12:** `TaskRow.test.tsx` gained 6 sync-state test cases + a 4-case CSS-contract block (asserts the keyframes, the `prefers-reduced-motion: reduce { animation: none }` rule, and the token usage).
- **AC #14:** `e2e/error-recovery.spec.ts` covers the four flows (pending → success, retry-exhausted, retry → recovery, reduced-motion). The retry-exhausted axe-clean assertion drove a CSS contrast tweak — see Deviations.
- **AC #15:** Announcement strings exported from `apps/web/src/data/announcements.ts`. `useCreateTask` and `TaskRow.ErrorMessage` import the constants — single source of truth, no inlined string literals.
- **AC #17:** `bun run check` and `bun run check:full` both pass; no new dependencies added (web 17/25, root 6/25, api 2/25).
- **AC #18:** Main chunk after build = 26.69 KB gzipped (under the 100 KB ceiling). The new code added ~5 KB.
- **AC #19:** Coverage 97.81% funcs / 96.87% lines (threshold 70%). Uncovered lines in `api.ts` are the response-shape guards in the rare null-data path; they're exercised in retry/eden integration but not the synthetic envelope tests.
- **AC #20:** All 5 `e2e/capture.spec.ts` tests pass cross-browser; smoke and error-recovery green; no regression on the 162 prior unit tests.
- **AC #21:** No backend changes. No toggle / delete / undo / fetch-error work touched. Only the surfaces enumerated in File List were modified.

**Deviations**

1. **CSS placement — Option A (colocated `TaskRow.css`).** The story offered two acceptable options for keyframes/error-row CSS placement (colocated `TaskRow.css` vs. appending to `styles/reset.css`). I chose Option A: a new `apps/web/src/components/TaskRow.css` imported from `TaskRow.tsx`. Rationale: TaskRow is the only consumer of these rules, colocated CSS aligns with the architecture's "co-located concerns" pattern, and `reset.css` stays scoped to global resets / shimmer animation. The `LoadingState` precedent in `reset.css` is a single rule (`.skeleton-shimmer`) and is global by design (used in any future skeleton); the TaskRow rules are component-private.

2. **`RetryAction` background — surface chip for AA contrast.** AC #4 specifies `color: var(--color-accent-default)` for the Retry button. Rendering accent-default (`#2563eb`) on the retry-exhausted row's `--color-status-error-subtle` (`#fee2e2`) measures **4.37:1** contrast — fails WCAG 2 AA (`4.5:1` for normal text). axe-core flagged this on the retry-exhausted page. Fix: gave `.task-row__retry-action` an explicit `background: var(--color-bg-surface)` + `border-radius: var(--radius-sm)`. The button now reads as a small surface chip on the pink row, and the WCAG contrast is computed against its own white/dark surface (~7:1 in light, ~7:1 in dark), passing AA. No new color tokens introduced (AC #9 satisfied). The spec's "color: accent-default" remains true for the text; only the immediate background was anchored to surface.

3. **`computeRetryDecision` / `computeRetryDelay` exported.** Rather than reaching into `client.getMutationCache().getAll()[0].options.retry` (the suggested seam in the story sketch), I exported the two pure decision functions directly from `queries.ts`. The unit tests assert the policy matrix in isolation without any TanStack Query plumbing. The hook still wires the same functions in via `retry:` / `retryDelay:`. This is a more direct seam and survives any internal restructure of TanStack Query's mutation observer.

4. **`__clearPendingTimersForTests` helper added.** The story sketch did not call out an explicit pending-timer cleanup hook, but module-scoped `setTimeout` references survive `cleanup()` from `@solidjs/testing-library` and leak into subsequent tests' LiveRegion history. Added `__clearPendingTimersForTests` to `queries.ts` and called it from both `useCreateTask` describe blocks' `beforeEach`/`afterEach`. The same module-scoped state pattern Sin is documented in the deferred-work item for Story 1.5 LiveRegion (queue lifecycle); the timer cleanup is the analogous fix for the mutation hook.

5. **`onMutate` idempotent guard against duplicate optimistic prepend.** When `RetryAction.onClick` calls `observer.reset()` + `observer.mutate(input)`, the full lifecycle re-runs including `onMutate`'s `setQueryData(... [optimistic, ...prev])`. Without a guard the row would be prepended twice. The guard `if (list.some((task) => task.id === input.id)) return list;` keeps the cache idempotent for the same input id. Server-side, the second POST is also idempotent on `(id, text)` per Story 1.4 — so the round-trip is safe. The story sketch hinted at this in AC #8 ("the cache write inside `onMutate` is idempotent (the row's `id` is already at index 0)") but the explicit guard wasn't in the sketch.

6. **`Retry-After` parser placed in `apps/web/src/data/retryAfter.ts`.** The story sketch left the placement to dev judgment (inline in `api.ts` vs. separate module). I went separate — `retryAfter.ts` is exercised by 6 dedicated unit tests (delta-seconds, HTTP-date past, HTTP-date future, whitespace, empty, unparseable) and the surface stays trivially auditable. `api.ts` imports `parseRetryAfter` only for the 429 path.

7. **e2e selectors switched from `getByText("Couldn't save — check connection.")` to `.task-row__error-message` locator.** The LiveRegion's visually-hidden `<div aria-live="polite">` also contains the error string while the announcement is the latest message. Strict-mode locators in Playwright fail when `getByText` resolves to multiple elements. Scoped the assertions to the actual `<p class="task-row__error-message">`, which keeps the test specific and avoids LiveRegion-history coupling. Same fix applied to the retry-exhausted-class assertion (`.task-row--retry-exhausted`).

8. **`waitForInitialTasksLoad` helper in `e2e/error-recovery.spec.ts`.** The dev DB grows over time as Playwright runs accumulate persisted tasks. Capturing `preCount` before the GET response settles produces flaky `preCount + 1` assertions. The helper waits for the LoadingState skeleton rows to unmount before snapshotting `preCount`. Contained in the new spec; existing `capture.spec.ts` is untouched.

9. **The `useCreateTask` test (Story 1.8 deviation #5) re-stubbed with `TasksApiError({ status: 400 })` instead of plain `Error("network")`.** Plain `Error` triggers the new retry policy's "treat as 5xx" branch (3 retries with exponential backoff). The assertion still tests the no-rollback contract; the only change is the rejection type. AC #20's "147 existing unit tests continue to pass" was honored in spirit — same assertion, same coverage, only the rejection type changed.

10. **`bun-types` warning suppressed via `// eslint-disable-next-line prefer-const` on the `observer` `let` binding.** The closure-capture pattern requires `let` so the observer is referenceable inside the lifecycle callbacks before `useMutation` returns. oxlint flagged it; since reassignment is intentional, the comment is justified.

11. **`task-row__primary` keeps `gap: var(--space-3)` instead of AC #3 / AC #4's `gap-2`.** The new sub-components (SyncIndicator, RetryAction) inherit the row's flex gap. AC #3 / AC #4's "gap-2 spacer" language reads as a per-element insertion gap, but flex `gap` is row-global — tightening to `gap-2` would also shrink the Story 1.7-vetted Checkbox-to-text spacing. Resolved during code review (2026-05-01) as "keep gap-3, record deviation"; the 4 px difference is imperceptible and the row-wide consistency is more valuable than the literal AC value.

### File List

**Created:**

- `apps/web/src/data/captureSyncStore.ts` — Solid store for per-row sync state (AC #5).
- `apps/web/src/data/captureSyncStore.test.ts` — 6 unit tests for the store + accessor.
- `apps/web/src/data/announcements.ts` — `LIVE_REGION_SAVING` / `LIVE_REGION_SAVED` / `LIVE_REGION_RETRY_EXHAUSTED` constants (AC #15).
- `apps/web/src/data/retryAfter.ts` — `parseRetryAfter` helper (AC #2).
- `apps/web/src/data/retryAfter.test.ts` — 6 unit tests for delta-seconds / HTTP-date parsing.
- `apps/web/src/components/TaskRow.css` — keyframes, `.task-row__sync-indicator`, `.task-row--retry-exhausted`, `.task-row__error-message`, `.task-row__retry-action` (AC #3, #4, #10).
- `e2e/error-recovery.spec.ts` — 4 Playwright tests for pending/exhausted/retry/reduced-motion + axe-clean assertion (AC #14).

**Modified:**

- `apps/web/src/constants.ts` — added `SYNC_PENDING_DELAY_MS`, `RETRY_*` constants, `LIVE_REGION_DRAIN_INTERVAL_MS` (AC #1, #6).
- `apps/web/src/data/api.ts` — added `TasksApiError` class, widened `Tasks{Get,Post}Response` with optional `response`, refactored `tasksApi.list` / `.create` to throw `TasksApiError`, parse `Retry-After` on 429 (AC #2).
- `apps/web/src/data/queries.ts` — extended `useCreateTask` with `mutationKey`, retry policy, full lifecycle, defensive snapshot, exported `computeRetryDecision` / `computeRetryDelay` / `__clearPendingTimersForTests` (AC #1, #6, #7, #8, #16).
- `apps/web/src/data/queries.test.tsx` — 8 new retry-policy tests + 5 new sync-state tests; 1 existing test updated to use `TasksApiError`; reset hooks added to `beforeEach`/`afterEach` (AC #11, #13).
- `apps/web/src/components/TaskRow.tsx` — `useCaptureSyncStatus` consumer, `task-row__primary` wrapper, three sub-components (`SyncIndicator`, `ErrorMessage`, `RetryAction`), conditional rendering, retry-exhausted class toggle (AC #3, #4, #5, #9).
- `apps/web/src/components/TaskRow.test.tsx` — 6 new sync-state component tests + 4 CSS-contract tests (AC #12).
- `apps/web/src/components/LiveRegion.tsx` — queue + mount-sentinel rewrite, `__getLiveRegionHistoryForTests` (AC #15).
- `apps/web/src/components/LiveRegion.test.tsx` — rewritten from source-substring tests to 5 behavioral tests under happy-dom (AC #15).

**Not modified (verified intact):**

- `apps/web/src/index.tsx`, `apps/web/src/App.tsx`, `apps/web/src/components/TaskInput.tsx`, `apps/web/src/components/TaskInput.test.tsx`, `apps/web/src/components/TaskList.tsx`, `apps/web/src/components/TaskList.test.tsx`, `apps/web/src/components/EmptyState.tsx`, `apps/web/src/components/LoadingState.tsx`, `apps/web/src/components/ErrorBoundary.tsx`, `apps/web/src/data/uuid.ts`, `apps/web/src/data/keys.ts`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/reset.css`, `apps/web/uno.config.ts`, `apps/api/**`, `e2e/smoke.spec.ts`, `e2e/capture.spec.ts`, `playwright.config.ts`, `bunfig.toml`, `package.json` (root), `apps/web/package.json`.

### Review Findings

- [x] [Review][Decision] Sub-component gap is `gap-3` (12 px) instead of AC-mandated `gap-2` (8 px) — `apps/web/src/components/TaskRow.css:4`. **Resolved 2026-05-01:** keep `gap-3` and document as deviation #11 (see Dev Agent Record / Deviations). AC's "spacer" language reads per-element, but flex `gap` is row-global; tightening to `gap-2` would also reduce the Story 1.7-vetted Checkbox-to-text spacing for an imperceptible 4 px difference.

- [x] [Review][Patch] `LiveRegion` history array grows unbounded in production [`apps/web/src/components/LiveRegion.tsx:11,24`] — capped at `LIVE_REGION_HISTORY_MAX = 100` via `history.splice(0, history.length - LIVE_REGION_HISTORY_MAX)` after each push.
- [x] [Review][Patch] Missing `<img onerror>` XSS regression for retry-exhausted state [`apps/web/src/components/TaskRow.test.tsx:155-164`] — duplicate test added under `describe("TaskRow sync states")` asserting the `<img src=x onerror=alert(1)>` payload renders as literal text and produces no `<img>` element while `markExhausted` is set.
- [x] [Review][Patch] `concurrent rows pending` test does not exercise the AC #13 "Resolve both. Assert two 'Saved' announcements were emitted." half [`apps/web/src/data/queries.test.tsx:530-563`] — test now awaits both store entries clearing, drains, and asserts `savedCount >= 2` in `__getLiveRegionHistoryForTests()`.

- [x] [Review][Defer] `mounted` boolean is shared across all `<LiveRegion />` instances; HMR / double-mount unmounts disable announcements until next mount [`apps/web/src/components/LiveRegion.tsx:12,38-43`] — deferred, dev-only risk under HMR
- [x] [Review][Defer] `__captureSyncMutators.clear(id)` writes `undefined` instead of removing the key from the Solid store, so `Object.keys(entries).length` grows monotonically per session [`apps/web/src/data/captureSyncStore.ts:22`] — deferred, low memory cost per entry
- [x] [Review][Defer] `parseRetryAfter` falls through to `Date.parse(value)` which accepts non-RFC-5322 strings (ISO partials, year-only, single chars), yielding nonsensical or zero-clamped delays for malformed server values [`apps/web/src/data/retryAfter.ts:9-11`] — deferred, server emits well-formed Retry-After per Story 1.4
- [x] [Review][Defer] `useCreateTask` shares a single mutation observer across rows; rapid Retry click during in-flight retry, or a new `mutate(B)` while row A's retry is in flight, can race `observer.reset()` against the other row's lifecycle [`apps/web/src/data/queries.ts:108-117`] — deferred, multi-mutation orchestration is out of this story's scope
- [x] [Review][Defer] `LiveRegion.drain` race: a message can be `queue.shift()`-ed and pushed to `history` but never displayed if `<LiveRegion />` unmounts between the shift and the `queueMicrotask` body [`apps/web/src/components/LiveRegion.tsx:22-29`] — deferred, single mount in production
- [x] [Review][Defer] `__resetLiveRegionForTests` does not invalidate pending microtask/setTimeout closures from prior tests; a stale callback can write the previous test's message into the next test's signal/history [`apps/web/src/components/LiveRegion.tsx:25-28`] — deferred, no flake observed yet; address with a generation token if it appears
- [x] [Review][Defer] 300 ms pending timer fires during the exponential-backoff sleep between internal TanStack retries (no per-attempt re-schedule), so the spinner can appear when no request is in flight [`apps/web/src/data/queries.ts:113-117`] — deferred, debatable UX call (spinner during backoff is arguably correct)

## Change Log

| Date       | Change                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| 2026-05-01 | Story 1.9 context engineered; status `backlog` → `ready-for-dev`. |
| 2026-05-01 | Story 1.9 implemented (sync-pending indicator + retry-exhausted state + LiveRegion queue + retry policy). 185 unit tests / 30 e2e tests pass; status `ready-for-dev` → `review`. |
| 2026-05-01 | Code review completed: 1 decision-needed resolved (gap-3 deviation), 3 patches applied (LiveRegion history cap, `<img onerror>` exhausted-state XSS regression, concurrent-rows two-SAVED assertion), 7 deferred to `deferred-work.md`, 8 dismissed. 186 unit tests pass; status `review` → `done`. |
