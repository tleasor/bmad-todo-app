---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
filesIncluded:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture/ (sharded)
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-28
**Project:** bmad-todo-app

## Document Inventory

| Type | Source | Format |
|---|---|---|
| PRD | `_bmad-output/planning-artifacts/prd.md` | Whole |
| Architecture | `_bmad-output/planning-artifacts/architecture/` | Sharded (7 files incl. index.md) |
| Epics & Stories | `_bmad-output/planning-artifacts/epics.md` | Whole |
| UX Design | `_bmad-output/planning-artifacts/ux-design-specification.md` | Whole |

Note: `PRD-original.md` (early seed) is retained in the planning-artifacts folder but is not authoritative for this assessment. No whole-vs-sharded duplicates were found for any document type.

## PRD Analysis

### Functional Requirements

**Task Capture & Listing**
- **FR1:** Users can create a new task by entering a short text description (≤ 500 characters).
- **FR2:** Users can view all of their tasks in a single list.
- **FR3:** Users can see at a glance which tasks are active and which are completed, with the distinction communicated through more than color alone.
- **FR4:** The product displays an explicit empty state when the task list contains no tasks.
- **FR5:** The product displays an explicit loading state while the task list is being retrieved.
- **FR6:** The product displays an explicit error state when task retrieval fails, and the message communicates what the user can do.

**Task Completion**
- **FR7:** Users can mark an active task as completed.
- **FR8:** Users can mark a completed task as not completed (restore to active).
- **FR9:** Completed tasks remain in the list and remain visible until the user explicitly deletes them.

**Task Deletion**
- **FR10:** Users can delete a task from the list. (Whether deletion requires confirmation, supports undo, or happens immediately is a UX Design decision.)

**Data Persistence**
- **FR11:** Tasks persist across browser page reloads.
- **FR12:** Tasks persist across browser sessions.
- **FR13:** Tasks persist across server and container restarts.

**Keyboard Operation**
- **FR14:** Users can add a task using the keyboard alone.
- **FR15:** Users can toggle task completion using the keyboard alone.
- **FR16:** Users can delete a task using the keyboard alone.
- **FR17:** Users can move focus between tasks using the keyboard alone.
- **FR18:** The task input is focused on page load so that the user can begin typing immediately, without any input action.
- **FR19:** Every focusable element communicates its focus state visibly, so the user always knows where keyboard input will be applied.

**Responsive & Accessible Presentation**
- **FR20:** The product renders and remains functional across all supported browser and breakpoint combinations.
- **FR21:** The product is operable via screen reader, with task content and state announced by assistive technology.
- **FR22:** Status changes produced by background operations (sync result, retry outcome, error) are announced to assistive technologies.

**Failure Handling & Recovery**
- **FR23:** Task creation, completion toggle, and deletion appear to succeed immediately from the user's perspective.
- **FR24:** When a write operation fails, the product retries in the background without requiring user action.
- **FR25:** When a write operation has not yet successfully synced, the affected task displays a non-intrusive sync-status indicator.
- **FR26:** When background retries ultimately exhaust, the product displays an actionable error message in context without losing the user's input.
- **FR27:** The product never silently loses task data due to network or transient backend failures.

**API**
- **FR28:** The product exposes an HTTP API that supports creating, reading, updating (completion status), and deleting tasks.
- **FR29:** API write operations are idempotent on retry, so repeated attempts with the same intent do not produce duplicate tasks.
- **FR30:** API error responses use a consistent error contract (shape, error codes) across all endpoints.
- **FR31:** The API exposes a health-check endpoint that reports service readiness.

**Deployment & Operability**
- **FR32:** The product starts with a single `docker-compose up` command, with no additional manual configuration required.
- **FR33:** Container logs are accessible via standard `docker-compose logs` to support observability during development and troubleshooting.
- **FR34:** The product can be stopped and restarted without data loss.

**Total FRs: 34**

### Non-Functional Requirements

**Performance**
- **NFR-P1:** The product must meet all targets in the Performance Targets table at release and continuously under CI enforcement. A PR that regresses any target below threshold does not merge.
- **NFR-P2:** Performance budgets are enforced at build time: bundle size, Lighthouse mobile score, and Lighthouse accessibility score are checked per PR in CI.
- **NFR-P3:** Performance targets apply to the median supported device / browser combination; the product does not guarantee targets on unsupported devices but must not crash or render unusably on them.

**Accessibility**
- **NFR-A1:** The product conforms to WCAG 2.1 Level AA with zero critical violations per axe-core and Lighthouse accessibility audits.
- **NFR-A2:** Accessibility audits run in CI on every PR; a PR that introduces a critical violation does not merge.
- **NFR-A3:** Screen-reader smoke tests on NVDA + Chrome (Windows), VoiceOver + Safari (macOS), and VoiceOver + Safari (iOS) pass before release.

**Security & Privacy**
- **NFR-S1:** All user-generated content (task descriptions) is rendered in a way that prevents injection of arbitrary HTML, JavaScript, or script elements into the DOM (XSS prevention).
- **NFR-S2:** The backend validates and sanitizes all task-description input at the API boundary; no SQL injection, no NoSQL injection, no command injection vectors in API handlers.
- **NFR-S3:** All third-party dependencies are version-pinned and audited for known vulnerabilities at build time; a dependency with a known high-or-critical CVE does not ship in a release.
- **NFR-S4:** The product does not collect, log, or transmit any PII. Task content is the only user-generated data stored; it is accessible only to the user who created it and is not shared with third parties.
- **NFR-S5:** The API enforces input-size limits to prevent resource-exhaustion attacks: task-description length ≤ 500 characters; request body ≤ 10 KB; per-IP request rate limiting.

**Reliability & Observability**
- **NFR-R1:** The product tolerates transient network failures without silent data loss (tied to FR23–FR27).
- **NFR-R2:** The product tolerates transient backend failures: a crashed backend container can be restarted via docker-compose without data loss.
- **NFR-R3:** Data persistence is atomic per operation: a crash mid-write does not leave the persisted state in an inconsistent state.
- **NFR-R4:** Logs are emitted in a machine-readable format (structured JSON or equivalent) at appropriate levels — info / warn / error.
- **NFR-R5:** The health-check endpoint reports status within 5 seconds of container start and returns HTTP 200 when ready.

**Maintainability**
- **NFR-M1:** Automated test coverage ≥70% meaningful coverage (branch and logic) on both frontend and backend, enforced by CI.
- **NFR-M2:** End-to-end test suite of ≥5 Playwright tests covering the core journeys (create, complete, delete, empty state, error handling).
- **NFR-M3:** The codebase passes its own linter and type-checker without warnings. PRs introducing new warnings do not merge.
- **NFR-M4:** Public interfaces are documented either inline or in a minimal README sufficient for a new developer to run and modify the product locally within 30 minutes.
- **NFR-M5:** Production dependency footprint: ≤ 25 direct dependencies per package (frontend and backend counted separately), enforced by CI dependency-count check.

**Total NFRs: 21**

### Additional Requirements & Constraints

- **Browser Matrix:** Latest 2 major versions of Chrome / Firefox / Safari / Edge on desktop; iOS 15+ Safari; latest 2 Chrome on Android. IE and legacy Edge explicitly unsupported.
- **Responsive Breakpoints:** Compact (0–599) / Medium (600–899) / Expanded (900–1199) / Large (1200–1799) / Extra-large (1800+).
- **Touch targets ≥44×44px** on mobile/tablet; text scales to 200% zoom; no horizontal scroll at any breakpoint; layout via Grid/Flexbox (no fixed pixel widths on containers).
- **Performance Targets (table):** Lighthouse mobile ≥90 / desktop ≥95; TTI ≤1s; LCP ≤1.5s mobile / ≤1s desktop; INP ≤100ms p95; perceived interaction latency ≤100ms p95; main JS chunk ≤100KB gzipped.
- **MVP storage:** file-based (SQLite or equivalent); no Postgres / Redis.
- **CI gates required:** bundle-size check, Lighthouse check, axe-core check, coverage gate, Playwright E2E run per PR.
- **MVP type:** Experience MVP — polish bar matters; growth features (auth, editing, filters, priority, due dates, undo overlay) are explicitly deferred Post-MVP.
- **Single-developer team**, AI-assisted; Docker + docker-compose required infra.

### PRD Completeness Assessment

The PRD is unusually well-formed for the start of an implementation-readiness check:

- ✅ Requirements are individually numbered and grouped by capability area (FR1–FR34, NFR-P/A/S/R/M).
- ✅ Each FR is testable; ambiguous decisions (e.g., delete confirmation/undo for FR10, sync-status visual for FR25, error message tone for FR26) are explicitly deferred to UX Design rather than left undefined.
- ✅ Success Criteria, Performance Targets, and NFRs cross-reference the relevant FRs (e.g., NFR-R5 ↔ FR31; NFR-R1 ↔ FR23–FR27).
- ✅ Scope boundaries (MVP / Growth / Vision) are explicit; scope-creep risks are named in Risk Mitigation.
- ✅ Browser matrix, breakpoint tiers, performance targets, accessibility level, and CI gates are all quantified.
- ⚠️ A few "deferred to UX Design" items (FR10, FR25, FR26) are appropriate deferrals at PRD level but must be resolved by the UX spec — that traceability will be checked in step 4.
- ⚠️ Keyboard-shortcut specifics (Enter, arrows, Space, Delete, Tab) are surfaced by Journey 3 but flagged as "expectations for the UX Design phase to formalize" — also a step-4 traceability check.
- ⚠️ No explicit FR for the keyboard-shortcut hint affordance called out in the Product Risks table (subtle hover/focus shortcut labels). Worth checking whether epics/stories or UX picked this up.

Overall, the PRD provides a strong, traceable basis for coverage validation. Proceeding to epic coverage check.

## Epic Coverage Validation

The epics document includes its own FR Coverage Map (epics.md L217–L254). For this validation I cross-checked each PRD FR against the Coverage Map *and* against the actual story acceptance criteria — claims-without-acceptance-criteria are flagged as gaps.

### Functional Requirements Coverage Matrix

| FR | PRD Capability | Epic / Story | Verified by AC | Status |
|---|---|---|---|---|
| FR1 | Create task ≤ 500 chars | 1.4 (POST schema), 1.6 (TaskInput maxlength), 1.8 (mutation) | ✅ | ✅ Covered |
| FR2 | View all tasks in a single list | 1.4 (GET), 1.7 (TaskList renders `<ul>`) | ✅ | ✅ Covered |
| FR3 | Active vs completed visible (non-color) | 2.2 (strike-through + muted color *together*) | ✅ | ✅ Covered |
| FR4 | Empty state | 1.7 (EmptyState component + copy) | ✅ | ✅ Covered |
| FR5 | Loading state | 1.7 (LoadingState + 200 ms gate + SkeletonRow) | ✅ | ✅ Covered |
| FR6 | Explicit error state w/ guidance | 1.10 (list-level fetch-error + Retry, neutral copy) | ✅ | ✅ Covered |
| FR7 | Mark active → completed | 2.2 (Checkbox + `useToggleTask`) | ✅ | ✅ Covered |
| FR8 | Mark completed → active | 2.2 (target-state PATCH; click again toggles back) | ✅ | ✅ Covered |
| FR9 | Completed tasks remain visible until deleted | 2.2 (no re-sort on completion), 2.3 | ✅ | ✅ Covered |
| FR10 | Delete with safety pattern (UX-decided) | 3.2 (immediate delete + animated row-out), 3.4 (Undo snackbar + Cmd/Ctrl+Z) | ✅ | ✅ Covered |
| FR11 | Persist across page reloads | 1.3 (SQLite at DATABASE_PATH), 1.11 | ✅ | ✅ Covered |
| FR12 | Persist across browser sessions | 1.3 + 1.11 | ✅ | ✅ Covered |
| FR13 | Persist across server / container restarts | 1.11 (`docker compose down` then `up` → tasks present) | ✅ | ✅ Covered |
| FR14 | Add task via keyboard alone | 1.6 (Enter on TaskInput) | ✅ | ✅ Covered |
| FR15 | Toggle via keyboard alone | 2.3 (Space on focused row) | ✅ | ✅ Covered |
| FR16 | Delete via keyboard alone | 3.3 (Delete / Backspace on focused row) | ✅ | ✅ Covered |
| FR17 | Move focus between tasks via keyboard | 4.1 (Arrow Up/Down + j/k) | ✅ | ✅ Covered |
| FR18 | Input focused on page load | 1.6 (auto-focus on mount, ref) | ✅ | ✅ Covered |
| FR19 | Visible focus on every focusable element | 1.6 (input), 2.2 (Checkbox), 3.2 (DeleteButton), 1.9 (RetryAction), 3.4 (Undo button), 4.5 (full audit + automated outline test) | ✅ | ✅ Covered |
| FR20 | Renders / functions across browsers + breakpoints | 1.1 (Vite `build.target: chrome120, edge120, firefox120, safari15`), 1.7 (responsive snapshots Compact / Expanded / Large), UX-DR18 cascade | ✅ (build target + snapshot tests) | ⚠️ Partial — see note below |
| FR21 | Operable via screen reader | 1.5 (LiveRegion), 1.7 (`role="list"`), 1.6 (`aria-label`), 2.2 (`role="checkbox"`), 3.2 (`aria-label="Delete task"`) | ✅ | ✅ Covered |
| FR22 | Status announcements via ARIA live regions | 1.5 (LiveRegion), 1.9 ("Saving…" / "Saved" / error), 2.3 (toggle reuses), 3.3 (delete + Cmd/Ctrl+Z hint, "N tasks deleted") | ✅ | ✅ Covered |
| FR23 | Optimistic immediate success | 1.8 (create), 2.2 (toggle), 3.2 (delete) | ✅ | ✅ Covered |
| FR24 | Background retry without user action | 1.9 (exponential backoff + jitter, 429 honors `Retry-After`, 5xx ×3, fail-fast on other 4xx) | ✅ | ✅ Covered |
| FR25 | Non-intrusive sync-pending indicator | 1.9 (SyncIndicator after 300 ms, neutral grey, dashed circle, reduced-motion fallback) | ✅ | ✅ Covered |
| FR26 | Actionable error after retries exhausted | 1.9 (ErrorMessage + RetryAction + subtle row bg + "Couldn't save — check connection.") | ✅ | ✅ Covered |
| FR27 | Never silently lose task data | 1.9 (no-rollback contract on `onError`; row stays optimistically committed) | ✅ | ✅ Covered |
| FR28 | HTTP API for C / R / U / D | 1.4 (POST + GET), 2.1 (PATCH), 3.1 (DELETE) | ✅ | ✅ Covered |
| FR29 | Idempotent on retry | 1.4 (POST `INSERT OR IGNORE` + 200/409 semantics), 2.1 (target-state PATCH), 3.1 (DELETE → 204 even when missing) | ✅ | ✅ Covered |
| FR30 | Consistent error contract | 1.2 (closed `ErrorCode` union, `errorEnvelope()` helper, single Elysia `onError`) | ✅ | ✅ Covered |
| FR31 | Health-check endpoint | 1.2 (`GET /health` → 200), 1.3 (503 on migration failure) | ✅ | ✅ Covered |
| FR32 | `docker compose up` single-command start | 1.1 (multi-stage Dockerfile, compose.yaml), 1.11 (fresh-clone end-to-end validation) | ✅ | ✅ Covered |
| FR33 | Logs via `docker compose logs` | 1.2 (logger to stdout structured JSON), 1.11 (`docker compose logs` emits JSON) | ✅ | ✅ Covered |
| FR34 | Stop / restart without data loss | 1.11 (`docker compose down` → `up` cycle preserves tasks; volume mount) | ✅ | ✅ Covered |

**Note on FR20 (partial):** Vite's `build.target` matrix and responsive snapshots cover the *build* and *layout* dimensions of the browser matrix. Cross-browser **runtime** validation (Chrome / Firefox / Safari / Edge desktop + iOS Safari + Android Chrome) is implicit — the Playwright suite ships under one default browser configuration; no story explicitly mandates a multi-browser Playwright project list. Practical risk is low for an MVP at this scope, but it is worth confirming whether the team intends to enforce multi-browser CI later.

### Non-Functional Requirements Coverage Matrix

| NFR | Capability | Epic / Story | Status | Notes |
|---|---|---|---|---|
| NFR-P1 | Performance targets continuously enforced | 1.1 (`bun run check:release` runs Lighthouse mobile + desktop) | ✅ Covered | Thresholds checked in via `lighthouserc.json` |
| NFR-P2 | Bundle / Lighthouse-mobile / Lighthouse-a11y per build | 1.1 (`scripts/check-bundle-size.sh`, `lighthouserc.json`) | ✅ Covered | |
| NFR-P3 | Median-device baseline; no crash on unsupported | 1.1 (Vite `build.target` matrix) | ⚠️ Partial | No explicit story tests "does not crash on unsupported"; relies on transpile target alone |
| NFR-A1 | WCAG 2.1 AA, zero critical violations | axe-core assertions across 1.6, 1.7, 1.10, 2.2, 2.3, 3.2, 3.3, 3.4, 4.5 | ✅ Covered | |
| NFR-A2 | A11y audits per build, gate on critical | 1.1 (`bun run check:release`), 1.11 (axe-core in Playwright) | ✅ Covered | |
| NFR-A3 | Screen-reader smoke tests on NVDA + VoiceOver before release | — | ❌ **Gap** | **No story captures the manual NVDA + VoiceOver Win/macOS/iOS smoke checklist as a release gate.** The closest is automated axe-core, which is not equivalent to a real-AT smoke test. |
| NFR-S1 | XSS prevention on rendering | — | ❌ **Gap** | Solid auto-escapes JSX by default, but no story has an AC asserting it (e.g. an attempted `<script>` payload renders as text). Worth one explicit AC. |
| NFR-S2 | Backend input validation / no injection vectors | 1.4 (Elysia `t.Object` schema; `taskRepo` uses parameterized SQL via `bun:sqlite`) | ✅ Covered | |
| NFR-S3 | Dependencies pinned + vuln-audited | 1.1 (`bun audit` in `bun run check:full`); architecture-locked versions | ✅ Covered | |
| NFR-S4 | No PII collected / logged / transmitted | — | ⚠️ Partial | No PII is collected by design, but no AC explicitly asserts logger output omits user-supplied text or that no PII fields exist on `tasks`. Implicit-by-architecture. |
| NFR-S5 | Input-size limits + per-IP rate limit | 1.4 (rate-limit middleware + 500-char text limit) | ⚠️ Partial | **Body size ≤ 10 KB limit is in the PRD but not enforced or tested in any story** (`payload_too_large` exists in the ErrorCode union but no story produces it). |
| NFR-R1 | Tolerate transient network without data loss | 1.9 (retry + no-rollback + exhausted state), 1.10 | ✅ Covered | |
| NFR-R2 | Crashed backend restart via docker compose | 1.11 (down + up → tasks preserved) | ✅ Covered | |
| NFR-R3 | Atomic per-operation SQL | 1.3 (repo skeleton), 2.1 (atomic UPDATE), 3.1 (atomic DELETE) | ✅ Covered | |
| NFR-R4 | Structured JSON logs at info / warn / error | 1.2 (logger.info / warn / error) | ✅ Covered | |
| NFR-R5 | Health-check ready ≤ 5 s; 200 when ready | 1.2 (`/health` → 200), 1.3 (503 on migration failure) | ⚠️ Partial | The "within 5 seconds of container start" timing is not asserted by any test; only the 200/503 distinction is. |
| NFR-M1 | ≥ 70% meaningful test coverage, CI-enforced | 1.2 mentions ≥ 70% on its own modules | ❌ **Gap** | **No story or script enforces a project-wide ≥ 70% coverage threshold.** Per-module assertions in Story 1.2 are scoped to that story's added modules; no aggregated coverage gate exists in `bun run check`. |
| NFR-M2 | ≥ 5 Playwright tests covering core journeys | 1.11 enumerates the 5 specs (`capture`, `manage`, `keyboard`, `error-recovery`, `empty-error-states`) | ✅ Covered | |
| NFR-M3 | Linter + type-checker no warnings | 1.1 (`bun run check` → oxlint + tsgo `--noEmit`) | ✅ Covered | |
| NFR-M4 | README clone-and-run ≤ 30 min | 1.1 (README documents install / dev / check / deploy) | ✅ Covered | |
| NFR-M5 | ≤ 25 direct deps per package | 1.1 (`scripts/check-dep-count.sh`) | ✅ Covered | |

### Missing / Weak Coverage

The FR map is fully covered; the gaps are concentrated in NFRs and a few edge requirements:

#### ❌ Critical Missing or Weak

- **NFR-A3 — Screen-reader smoke tests (NVDA + VoiceOver)**
  - Impact: Without a release-gate manual SR audit, axe-core passes can mask broken AT experience (e.g. announcement timing, focus ordering as heard, live-region politeness).
  - Recommendation: Add a checklist-style story (or AC on Story 4.5) — *"Pre-release SR smoke checklist"* covering Journey 1 / 2 / 3 on NVDA+Chrome (Win), VoiceOver+Safari (macOS), VoiceOver+Safari (iOS).

- **NFR-S1 — XSS-on-render assertion**
  - Impact: Solid auto-escapes JSX, but the contract is currently undocumented and untested. A future migration or `innerHTML` slip would silently regress.
  - Recommendation: Add one AC to Story 1.6 (or 1.7) asserting that a task whose text contains `<script>alert(1)</script>` renders verbatim as text in the DOM, not as a script element.

- **NFR-S5 — Request body ≤ 10 KB limit**
  - Impact: PRD specifies a 10 KB body cap to prevent resource-exhaustion. The 500-char text cap *almost* covers it, but a multi-field future payload or oversized header could bypass; `payload_too_large` is in the ErrorCode union but unreachable.
  - Recommendation: Add an AC to Story 1.4 (or backend plumbing) — Elysia body-limit middleware rejects > 10 KB bodies with `payload_too_large`; integration test exercises it.

- **NFR-M1 — Aggregated ≥ 70% coverage gate**
  - Impact: The PRD mandates ≥ 70% project-wide. Per-module assertions in Story 1.2 do not aggregate; nothing in `bun run check` or `:full` fails on cumulative drift.
  - Recommendation: Add a coverage threshold step to `bun run check:full` (e.g. `bun test --coverage --coverage-threshold 70`) and a brief AC to Story 1.1 referencing it.

#### ⚠️ Partial / Implicit

- **FR20 (multi-browser Playwright runtime):** Build target covers compile-time; no story configures Playwright projects for Firefox / WebKit alongside Chromium. Acceptable for MVP if the team accepts single-browser CI.
- **NFR-P3 (does-not-crash on unsupported):** Implicitly handled by `build.target` choice; no explicit AC.
- **NFR-S4 (no PII):** Architectural property of the schema; worth a brief AC on the logger that it never logs request body content.
- **NFR-R5 (5-second health-check readiness):** No story tests the timing bound, only the 200/503 distinction.

### Coverage Statistics

- **Total PRD FRs:** 34
- **FRs covered by ≥ 1 story AC:** 34 (100%)
- **FRs with partial coverage notes:** 1 (FR20 — multi-browser runtime)
- **Total PRD NFRs:** 21
- **NFRs fully covered:** 14 (66.7%)
- **NFRs with partial coverage:** 3 (NFR-P3, NFR-S4, NFR-R5)
- **NFRs with material gaps:** 4 (NFR-A3, NFR-S1, NFR-S5, NFR-M1)

Proceeding to UX alignment validation.

## UX Alignment Assessment

### UX Document Status

**Found.** `_bmad-output/planning-artifacts/ux-design-specification.md` (98 KB), authored 2026-04-23, with companion HTML preview at `ux-design-preview.html`. The spec consumed both `prd.md` and the post-validation report as inputs and is structured into 14 traceable workflow steps (Executive Summary through Responsive Design & Accessibility).

### UX ↔ PRD Alignment

✅ **All four PRD journeys are formalized in UX flows.** Each PRD journey (first-time capture, daily management, keyboard-only, error recovery) appears in the *User Journey Flows* section as a step-by-step mermaid flow with explicit decision branches and error paths.

✅ **Every PRD item the PRD deferred to UX is resolved:**
- **FR10 (delete safety pattern)** → immediate delete + UndoSnackbar (bottom-center, 5 s auto-dismiss) + Cmd/Ctrl+Z within window. Concurrent-delete collapse to "N tasks deleted" + single undo. Restore at original list position.
- **FR25 (non-intrusive sync indicator)** → 14 × 14 px dashed circle, `color.status.pending` (neutral grey), appears after 300 ms pending; rotation removed under reduced-motion.
- **FR26 (actionable retry-exhausted message)** → inline below task text: `"Couldn't save — check connection."` + RetryAction button + `status.error.subtle` row background. Task text remains primary color (failure is about saving, not content).
- **Keyboard shortcut specifics (FR14–FR19 informed by Journey 3)** → complete shortcut table in *UX Consistency Patterns* (Enter / Escape / Shift+Enter / Space / Delete / Backspace / arrows / `j` / `k` / `i` / Tab / Cmd/Ctrl+Z), scoped per-context to satisfy WCAG 2.1.4.

✅ **UX additions over PRD are intentional and consistent with PRD principles:**
- Cmd/Ctrl+Z global undo, `j` / `k` vim-style row nav, `i` to focus input, typing-anywhere-captures, focus-landing-after-delete rule (next → previous → input), 200 ms loading-state gate, light/dark theme via `prefers-color-scheme` (no user toggle), 4 px-base spacing scale, Inter self-hosted variable font (~28 KB).
- All additions stay within PRD constraints: ≤ 44 × 44 px touch targets, ≤ 100 KB main chunk, WCAG 2.1 AA, ≤ 200% zoom support, no horizontal scroll.

✅ **No conflicts** between UX decisions and PRD requirements. Where UX makes a stronger claim than PRD (e.g., specific motion durations 120 / 180 ms), the PRD does not contradict; where PRD makes a stronger claim (e.g., bundle size cap), UX explicitly references and respects it.

⚠️ **One PRD callout that UX does not formalize:** the PRD's *Product Risks* table mentions a *"visible hint affordance (e.g. subtle shortcut labels on hover/focus)"* as the mitigation for keyboard-shortcut undiscoverability. UX explicitly defers a shortcut-reference overlay to Growth (per PRD) and relies on convention + minimal shortcut set, but it does not deliver the *"subtle shortcut labels on hover/focus"* mitigation. This is a defensible design choice (placeholder-only register, no chrome) and the epics inherit that choice. Worth confirming explicitly that this mitigation is intentionally dropped, or capturing it as a known accepted risk.

### UX ↔ Architecture Alignment

✅ **Architecture explicitly references UX decisions as locked inputs.** `core-architectural-decisions.md` *Already Decided by Prior Steps* lists *"FR10 delete safety: immediate delete + 5 s UndoSnackbar + Cmd/Ctrl+Z (UX spec)"*, *"Theme: OS-driven via prefers-color-scheme, no user toggle"*, *"Styling: UnoCSS 66.6.8 with presetMini and custom rules expressing the UX-spec design tokens"*. UX is a first-class input to architectural decisions, not a downstream concern.

✅ **Tech stack supports the UX register:**
- **SolidJS + signals** → fits "instant, terminal-like" interaction quality the UX spec targets (fine-grained reactivity, no VDOM diff cost on per-keystroke updates).
- **UnoCSS preset-mini** → directly expresses the UX token system (colors, spacing, typography, radii, motion).
- **TanStack Solid Query** → supports the optimistic-mutation contract and the retry policy from UX Journey 4 (D7 in architecture explicitly notes *"`onError` does NOT roll back the optimistic update — per UX spec"*; this is the load-bearing UX-DR16 contract).
- **Vite `build.target: [chrome120, edge120, firefox120, safari15]`** → covers the PRD browser matrix without under-targeting Safari 15 mobile (UX viewport meta + iOS-15 floor).
- **Inter self-hosted variable font (~28 KB)** → fits within the ≤ 100 KB main-chunk budget while delivering UX typographic register.
- **Hand-rolled UUIDv7** → enables UX-DR14 (newest-first ordering via `ORDER BY id DESC`).

✅ **All UX-DR items map cleanly to architectural primitives.** No UX requirement requires a capability the architecture has not provided. The architecture's *Decision Impact Analysis* traces every cross-component dependency that UX touches (UUIDv7 → POST → INSERT OR IGNORE → 200/201 → TanStack cache).

⚠️ **Two thin spots in UX-driven implementation guidance:**
- The UX spec mandates *typing-anywhere-captures* (a printable keystroke on a focused row routes back to TaskInput and appends). Architecture does not call out where the global keymap lives or how the focused-row event handler defers to TaskInput — left entirely to story-level implementation in Epic 4 (Story 4.4). Acceptable, but worth a story-level note that this is the single most subtle keyboard-routing piece in the app.
- Cross-browser **runtime** validation (Playwright projects on Firefox / WebKit alongside Chromium) is not configured in any story; UX *Testing Strategy* notes *"manual spot-check at major releases"* for cross-browser. The architecture's CI gates do not include multi-browser runs.

### UX ↔ Epics Alignment

✅ **Epics include a dedicated UX Design Requirements list (UX-DR1 through UX-DR22).** All 22 UX-DRs are derived from the UX spec and traced to specific stories. Examples:
- UX-DR1 (design tokens) → Story 1.5
- UX-DR4 (TaskInput) → Story 1.6
- UX-DR7 (TaskRow with sub-parts) → Stories 1.7 + 1.9 + 2.2 + 3.2
- UX-DR10 (LiveRegion) → Stories 1.5 + 1.9 + 2.3 + 3.3
- UX-DR11 (UndoSnackbar) → Story 3.4
- UX-DR12 (full keyboard shortcut set) → Stories 1.6 + 2.3 + 3.3 + 4.1 + 4.2 + 4.3 + 4.4
- UX-DR15 (FR10 delete safety) → Stories 3.2 + 3.4
- UX-DR20 (reduced motion) → recurring AC across stories that touch motion
- UX-DR22 (content & voice) → recurring AC on copy-bearing stories

⚠️ **NFR-A3 release-gate gap (already flagged in step 3, reinforced here):** UX *Testing Strategy* explicitly names NVDA + VoiceOver smoke tests as a *release gate* (with named scenarios per AT). The epics do not promote this checklist into a story or DoD item — it lives only in the UX spec.

### Alignment Issues Summary

| # | Type | Issue | Severity | Recommendation |
|---|---|---|---|---|
| A1 | UX↔Epics | NFR-A3 SR smoke checklist named in UX as release gate, but not turned into a story or DoD | Medium | Add an AC to Story 4.5 (or a new release-checklist story) — manual SR smoke pass on NVDA + VoiceOver Win/macOS/iOS before release tag |
| A2 | UX↔Architecture | Cross-browser Playwright projects not configured (Firefox / WebKit alongside Chromium) | Low | Either accept single-browser CI for MVP and note as known constraint, or add Playwright `projects` config + targeted spec to `bun run check:release` |
| A3 | PRD↔UX | PRD risk mitigation *"subtle shortcut labels on hover/focus"* not delivered by UX | Low | Confirm explicitly that this mitigation was intentionally dropped (UX prefers no chrome) — if so, capture as accepted risk |
| A4 | UX↔Stories | Typing-anywhere-captures global routing has no architectural-level guidance | Low | Acceptable as story-level work in Story 4.4, but flag in story-author DoD as the most subtle event-routing piece |
| A5 | UX↔Stories | Visual regression at Compact (375 px) / Expanded (1024 px) / Large (1440 px) called *optional* in UX, not enforced anywhere | Low | Acceptable as MVP scope decision; document as deferred to post-MVP if desired |

### Warnings

- **No unresolved UX↔PRD conflicts.** Alignment is strong.
- **The most material gap remains NFR-A3** (manual SR smoke checklist), which is flagged twice — once in NFR coverage (step 3), once here. Address with a single AC and it closes both.
- All other alignment issues are low-severity and are appropriate to either accept or capture as known constraints; none is a blocker.

Proceeding to epic quality review.

## Epic Quality Review

Validation of epic and story quality against best practices: user-value framing, epic independence, story sizing, AC specificity, dependency direction, and database-creation timing.

### Epic-Level Review

| Epic | Stories | User outcome (verbatim) | User-value framing | Stands alone? | Forward refs? |
|---|---|---|---|---|---|
| 1: Foundation & Task Capture | 11 | *"I can open the app, type a task, hit Enter, and trust it's saved — even on a flaky network."* | ✅ Concrete user moment | ✅ Yes — capture + recovery is a complete journey | None |
| 2: Task Completion | 3 | *"I can mark tasks complete and see at-a-glance what's left to do."* | ✅ Concrete user moment | ✅ Yes — needs only Epic 1 | None |
| 3: Task Deletion with Undo | 4 | *"I can delete tasks confidently — accidents are reversible."* | ✅ Concrete user moment | ✅ Yes — needs only Epic 1 (Epic 2 not strictly required) | None |
| 4: Keyboard-First Navigation | 5 | *"I can operate everything from the keyboard — fast as a terminal."* | ✅ Concrete user moment | ✅ Yes — layers on Epics 1–3 | None |

✅ **No technical-milestone epics.** "Foundation" appears in Epic 1's title but the *outcome* statement is user-facing, and the epic ships Journeys 1 and 4 in working form — not a scaffolding-only release. The scaffold work is encapsulated in Story 1.1 only.

✅ **Epic ordering is monotonic.** Each epic's "State after Epic N" section names exactly what is and is not yet present, matching the dependency direction:
- After Epic 1: capture works; toggle and delete UI absent.
- After Epic 2: capture + toggle work; delete UI absent.
- After Epic 3: full CRUD works via mouse + per-action keyboard; cross-row keyboard navigation absent.
- After Epic 4: full keyboard parity; all four PRD journeys validated in CI.

✅ **No epic looks forward.** Each "scope highlights" list builds only on infrastructure introduced in earlier epics (e.g., Epic 2 reuses Epic 1's SyncIndicator + retry-exhausted primitive; Epic 3 reuses both; Epic 4 audits across all prior).

### Story-Level Review

#### Greenfield Setup (Story 1.1)

The architecture document mandates a hand-rolled scaffold rather than a third-party starter (ARCH-AR1: *"the first implementation story owns the full initialization sequence"*). Story 1.1 satisfies the workflow's "starter-template equivalent" requirement: it ships root configs, all per-package configs, Dockerfile, compose.yaml, scripts, README, plus one `bun:test` + one Playwright test as toolchain proof. Splitting the scaffold into multiple stories would produce orphan PRs (tsconfig changes that can't compile until package.json lands), so the bundling is justified by architectural lock and explicitly noted in the architecture's *Decision Impact Analysis*.

✅ **Story 1.1 is large but bounded** — every config / file / script is enumerated in the AC, not left as "set up the project."

#### Story Sizing

- All 23 stories use single-feature framing (one component, one endpoint, one cross-cutting concern).
- Story 1.1 is the largest by deliverable count; the rest are right-sized (1 backend route + tests, or 1 component + states + tests, or 1 cross-cutting primitive + integration).
- No story is "epic-sized" (multi-feature, multi-day with no incremental ship boundary).

#### Acceptance Criteria Quality

✅ **All ACs use Given / When / Then BDD shape** consistently.

✅ **ACs are specific and testable.** Spot-checks:
- Story 1.4 names exact status codes per scenario (`201` first insert / `200` idempotent retry / `409 id_conflict` / `400 validation_error` / `429 rate_limited`).
- Story 1.9 names the exact retry formula (`Math.min(1000 * 2 ** attempt + jitter, 30_000)`).
- Story 2.2 names exact dimensions, tokens, and reduced-motion fallback (*"20 × 20 px circle with 2 px border in `color.border.strong`"*).
- Story 3.4 names exact timing (*"auto-dismisses after 5 seconds"*).
- Story 4.5 names the exact focus-ring spec (*"2 px `accent.default` outline with 2 px offset, ≥ 3:1 contrast"*).

✅ **Error-path ACs are present.** Almost every story includes ACs for missing-id (404), bad input (400), rate-limit-exhaustion (429), reduced-motion fallback, retry-exhausted, etc. — failure paths are not deferred to a "polish" story.

✅ **Tests are first-class in ACs.** Stories explicitly name the test files (`e2e/capture.spec.ts`, `e2e/manage.spec.ts`, `e2e/keyboard.spec.ts`, `e2e/error-recovery.spec.ts`, `e2e/empty-error-states.spec.ts`) and what each must assert. NFR-M2's ≥ 5 spec count is achieved by name.

#### Dependency Direction

I walked every story-to-story reference; **all are backward-pointing**:

- 1.2 → 1.1; 1.3 → 1.1, 1.2 (`/health` from 1.2); 1.4 → 1.2 (error envelope), 1.3 (taskRepo).
- 1.5 → 1.1 (Eden import path); 1.6 → 1.5 (tokens); 1.7 → 1.5, 1.6; 1.8 → 1.6, 1.7, 1.5; 1.9 → 1.8; 1.10 → 1.7.
- 1.11 → all of Epic 1 (capstone integration story).
- 2.1 → 1.4 (route foundation); 2.2 → 1.7 (TaskRow), 1.9 (sync primitives), 2.1; 2.3 → 2.2.
- 3.1 → 1.4; 3.2 → 1.7, 3.1; 3.3 → 3.2; 3.4 → 3.3.
- 4.1–4.5 → all build on prior epics' deliverables.

⚠️ **One subtle case to flag (not a violation).** Story 1.11 mandates that `e2e/manage.spec.ts`, `e2e/keyboard.spec.ts`, and `e2e/error-recovery.spec.ts` *exist* in `e2e/` even though their meaningful assertions are filled in by Epics 2 / 3 / 4. The story explicitly calls these "stubs to be filled by Epics 2–4." This is not a forward dependency (the stubs themselves ship in Epic 1), but it does *name* future work. Acceptable framing; worth being explicit during sprint planning that the stubs are Epic 1's responsibility.

#### Database / Entity Creation Timing

✅ **Single feature table created exactly when needed.** Story 1.3 creates the `tasks` table (the only feature table the app uses). The `schema_versions` infrastructure table is created by the migration runner — internal-only. No "create all tables upfront" pattern; no speculative schema for Growth-phase features (priority, due dates) — these would create their own migration files in their own future stories.

#### Component-Wiring Discipline

✅ **Stories ship coherent vertical slices.** Each story produces something testable end-to-end within its scope:
- Story 1.6 ships TaskInput with a `onSubmit` *callback contract* (and AC asserts behavior on the callback). The callback is wired in Story 1.8. This is correct vertical slicing — the component contract ships independently of integration.
- Story 1.7 ships TaskList rendering the existing list (using the pure GET path). Mutation wire-up is Story 1.8.
- Story 1.8 ships the optimistic create that closes the loop.

A reader could mistake this as "Story 1.6 ships dead UI." It does not — the input is testable in isolation against its callback. Worth flagging only because sprint-planning conversations sometimes reframe vertical slices as "incomplete."

### Best Practices Compliance Checklist

| Check | Result |
|---|---|
| Each epic delivers user value | ✅ Pass |
| Each epic can function independently of subsequent epics | ✅ Pass |
| Stories appropriately sized | ✅ Pass |
| No forward dependencies | ✅ Pass |
| Database tables created only when needed | ✅ Pass |
| Clear acceptance criteria with Given / When / Then | ✅ Pass |
| Traceability to FRs maintained (FR Coverage Map) | ✅ Pass |
| Greenfield setup story present | ✅ Pass (Story 1.1) |
| Tests named in story scope (NFR-M2 supported by name) | ✅ Pass |
| Reduced-motion / a11y / non-color-signaling ACs propagate to relevant stories | ✅ Pass |

### Findings by Severity

#### 🔴 Critical Violations

**None.**

#### 🟠 Major Issues

**None.**

#### 🟡 Minor Concerns

1. **Epic 1 title framing.** "Foundation & Task Capture" leads with a technical word. The outcome statement and scope rescue it (capture + Journey 4 ship as user-visible value), but a stronger title — e.g. *"Capture & Persistence"* — would remove ambiguity. **Severity:** cosmetic.

2. **Stub Playwright spec files in Story 1.11.** Story 1.11 ships empty stubs of `manage.spec.ts`, `keyboard.spec.ts` for Epics 2/3/4 to fill in. Not a forward dependency, but cross-epic file ownership is worth surfacing in sprint planning to avoid "whose responsibility is this stub?" confusion. **Severity:** process clarity.

3. **Vertical-slice across Stories 1.6 → 1.8.** Story 1.6 ships TaskInput as a component with a callback contract; the contract is wired in Story 1.8. This is correct vertical slicing for component-driven development, but a sprint-planning reviewer unfamiliar with the pattern might read 1.6 as "input UI without behavior." **Severity:** documentation/communication, no remediation needed unless the team prefers a single combined story.

4. **NFR gaps from step 3** (NFR-A3 SR smoke checklist; NFR-S1 XSS-on-render assertion; NFR-S5 10 KB body limit; NFR-M1 aggregate coverage gate) are not story-quality issues per se, but they could be addressed by adding focused ACs to existing stories rather than creating new ones. Carried forward to the final assessment.

### Summary

This epic / story breakdown is unusually disciplined for a Phase-3 deliverable. The structural quality is high — no technical-milestone epics, no forward dependencies, well-sized stories with specific ACs that name exact endpoints / tokens / status codes / file paths. The only material gaps are the four NFR coverage items already surfaced in step 3 (resolvable with focused AC additions to existing stories), and a handful of cosmetic concerns.

Proceeding to final assessment.

## Summary and Recommendations

### Overall Readiness Status

**READY — with 4 focused fixes recommended before kickoff.**

The PRD, UX, Architecture, and Epics package is unusually well-formed. Coverage is strong (34 / 34 FRs traced to story ACs; 14 / 21 NFRs fully covered, 3 partial, 4 with material gaps). Epic structure passes every best-practice check: no technical-milestone epics, no forward dependencies, well-sized stories with specific Given/When/Then ACs that name exact endpoints, tokens, status codes, and file paths. Architecture is tightly coupled to UX decisions (theme handling, optimistic-mutation contract, FR10 resolution) without conflicts.

The four NFR coverage gaps below are addressable by adding focused ACs to existing stories — none requires new epics or restructuring. The remaining minor concerns are cosmetic.

### Critical Issues Requiring Immediate Action

None. The four NFR gaps below are *high-priority but not blockers* — they can be closed with single-AC additions during sprint planning rather than re-planning.

### Important Gaps to Close Before / During Implementation

1. **NFR-A3 — Manual screen-reader smoke checklist as a release gate.**
   - **Issue:** UX *Testing Strategy* names NVDA + VoiceOver smoke tests as a release gate; no story enforces this as DoD.
   - **Fix:** Add an AC to **Story 4.5** (or a dedicated release-checklist story): *"Before tagging a release, an SR smoke pass is performed on (a) NVDA + Chrome on Windows, (b) VoiceOver + Safari on macOS, (c) VoiceOver + Safari on iOS — exercising add / toggle / delete / undo / sync-pending / retry-exhausted scenarios. Every LiveRegion announcement fires audibly."*
   - **Why now:** retro-fitting AT compliance is dramatically more expensive than catching it during the build.

2. **NFR-S1 — XSS-on-render explicit assertion.**
   - **Issue:** Solid auto-escapes JSX, but no story has an AC that asserts the contract. A future migration or `innerHTML` slip would silently regress.
   - **Fix:** Add one AC to **Story 1.6** or **Story 1.7**: *"Given a task with text containing `<script>alert(1)</script>`, When the row renders, Then the literal text appears in the DOM as text content (not as a script element); a unit test exercises this."*
   - **Why now:** five-line AC and a five-line test; insurance against a class of regressions that automated tools may miss.

3. **NFR-S5 — Request body ≤ 10 KB limit.**
   - **Issue:** PRD specifies 10 KB body cap. The 500-char text limit *almost* covers it, but `payload_too_large` is in the ErrorCode union and currently unreachable.
   - **Fix:** Add an AC to **Story 1.4** (or to backend plumbing in 1.2): *"Elysia body-limit middleware rejects requests > 10 KB with `payload_too_large`; an integration test sends an 11 KB body and asserts the 413 + envelope."*
   - **Why now:** closing this also retires an unreachable enum branch and exercises the error-envelope path for a status code no other test hits.

4. **NFR-M1 — Aggregate ≥ 70% coverage gate.**
   - **Issue:** Per-module assertions in Story 1.2 do not aggregate; nothing in `bun run check` or `:full` fails on cumulative drift.
   - **Fix:** Add a coverage-threshold step to `bun run check:full` (e.g. `bun test --coverage --coverage-threshold 70`) and reference it in the **Story 1.1** AC list.
   - **Why now:** the gate is cheap to add at scaffold time; cumulative coverage drift past Epic 2 is much harder to walk back than to enforce from day one.

### Lower-Priority Items (Accept or Defer)

- **A2 — Cross-browser Playwright runtime** (Firefox / WebKit projects). UX accepts manual spot-check; document as known constraint or opt in for `check:release`.
- **A3 — PRD Product-Risk mitigation** "subtle shortcut labels on hover/focus" not delivered by UX. Confirm intentional drop or capture as accepted risk.
- **A4 — Typing-anywhere-captures** has no architectural-level guidance. Acceptable as Story 4.4 work; flag during story-author DoD as the most subtle keyboard-routing piece.
- **A5 — Visual regression at three primary tiers** is *optional* in UX testing strategy. Acceptable to defer.
- **NFR-P3** ("does not crash on unsupported devices") and **NFR-S4** (no PII collected/logged) are implicit-by-architecture; consider adding one-line ACs to lock the property.
- **NFR-R5** (5-second health-check readiness timing) — currently only the 200/503 distinction is asserted. Acceptable for MVP.
- **Epic 1 title** ("Foundation & Task Capture"): cosmetic, no remediation needed.
- **Story 1.11 stub Playwright specs** for Epic 2/3/4 to fill in: surface in sprint planning to avoid ownership confusion.

### Coverage Statistics (Repeated for Reference)

| Dimension | Total | Fully Covered | Partial | Material Gap |
|---|---|---|---|---|
| Functional Requirements | 34 | 33 | 1 (FR20 multi-browser runtime) | 0 |
| Non-Functional Requirements | 21 | 14 | 3 (NFR-P3, NFR-S4, NFR-R5) | 4 (NFR-A3, NFR-S1, NFR-S5, NFR-M1) |
| UX Design Requirements (UX-DR1–UX-DR22) | 22 | 22 | 0 | 0 |
| Architecture Decisions (ARCH-AR1–AR19) | 19 | 19 | 0 | 0 |

### Recommended Next Steps

1. **Add four focused ACs** to existing stories to close NFR-A3, NFR-S1, NFR-S5, and NFR-M1 gaps (Stories 4.5, 1.6/1.7, 1.4, 1.1 respectively). Estimated effort: 1–2 hours total to draft; no re-planning required.
2. **Confirm or document** the PRD risk-mitigation drop ("subtle shortcut labels on hover/focus") as an accepted design decision.
3. **Decide** whether to add multi-browser Playwright projects to `bun run check:release` or formally accept single-browser CI for MVP.
4. **Optional housekeeping:** archive `PRD-original.md` (early seed) to remove ambiguity for future readers.
5. **Proceed to implementation.** After items 1–3, the planning package is ready for Phase 4. Story 1.1 (scaffold) is the natural starting point.

### Final Note

This assessment identified **8 issues** across **3 categories** (NFR coverage gaps, UX alignment notes, and minor epic-quality concerns). **None is a blocker.** The four high-priority items each resolve with a single focused AC addition rather than restructuring; closing them takes the package from "READY with caveats" to "READY without caveats."

The discipline visible across the PRD, UX, Architecture, and Epics is unusual for the volume of detail involved — the FR coverage map is verbatim-traceable, the UX design tokens are referenced by exact name in story ACs, and architecture decisions explicitly list UX-locked inputs. Continuing that discipline through implementation will preserve the chain-of-traceability that makes this readiness check straightforward.

---

**Date:** 2026-04-28
**Assessor:** Implementation Readiness Skill (BMM)
**Project:** bmad-todo-app
**Output:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-04-28.md`
