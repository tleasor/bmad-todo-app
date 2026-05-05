---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain (skipped — low complexity, general domain)
  - step-06-innovation (skipped — no innovation signals; refined execution, not novel pattern)
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - _bmad-output/planning-artifacts/PRD-original.md
  - _bmad-output/planning-artifacts/task-details.md
  - _bmad-output/planning-artifacts/PRD-validation-report.md
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
---

# Product Requirements Document - bmad-todo-app

**Author:** Tommy
**Date:** 2026-04-17

## Executive Summary

bmad-todo-app is a minimal personal task manager delivered as a responsive web app backed by a CRUD API. Users can capture, view, complete, and delete tasks without onboarding or configuration. The product targets individuals who want a frictionless single-user list — no accounts, no configuration, no feature bloat — and who value polish over breadth.

The problem is not a lack of TODO apps; it is the gap between a minimal app that feels unfinished and a minimal app that feels complete. The product closes that gap by treating interaction quality — not feature breadth — as the deliverable.

### What Makes This Special

Speed is the felt-quality differentiator, expressed in two dimensions:

- **Performance:** interactions apply optimistically with no visible latency under normal conditions; initial load completes fast enough that users can begin typing immediately.
- **Usability:** the full task lifecycle — add, complete, delete, navigate — is operable from the keyboard without requiring the mouse.

**Core insight:** At deliberately minimal scope, the only way for the product to feel complete is to execute its few interactions to a polished standard. Five keyboard-accessible, instantaneous actions read as more finished than twenty sluggish, mouse-bound ones.

## Project Classification

- **Project Type:** `web_app` — full-stack: responsive browser UI and backend CRUD API
- **Domain:** `general` — personal productivity; no regulated-industry requirements
- **Complexity:** `low` — no authentication, no multi-tenancy, no compliance framework beyond WCAG AA accessibility
- **Project Context:** `greenfield` — no existing codebase

## Success Criteria

### User Success

- A first-time visitor can add their first task within 10 seconds of page load, without onboarding, documentation, or visible configuration.
- Completed tasks are visually distinguishable from active tasks at a glance, verified by accessibility and color-contrast audit.
- A user who closes the browser and returns later finds their tasks intact — no data loss across sessions.
- The full task lifecycle (add, complete, delete, navigate between tasks) is operable without mouse input; every core action is reachable via keyboard.
- Empty, loading, and error states are explicit and informative; the interface never appears broken or blank under normal failure conditions.

### Business Success

- A user who engages with the core loop (add → complete → delete) once is able to repeat it without referring to external help.
- The product stands up without manual configuration: a developer or reviewer can clone, run one command, and reach a working application in under 2 minutes on a standard laptop.
- Deployment is reproducible: the same single command produces an identical runtime on any machine with Docker installed.

### Technical Success

Technical success is defined by release-gate targets enforced in CI: automated coverage ≥70%, ≥5 passing Playwright E2E tests, zero critical WCAG 2.1 AA violations, `docker-compose up` as the startup command, a responsive health-check endpoint, and durable persistence across container and server restarts. Full specifications: see **Non-Functional Requirements** (NFR-M1, NFR-M2, NFR-A1, NFR-R2, NFR-R5) and **Functional Requirements** (FR11–FR13, FR31, FR32).

### Measurable Outcomes

| Metric | Target | Measurement | Enforced by |
|---|---|---|---|
| Perceived interaction latency (add / toggle / delete) | ≤100ms (95th pct) | Browser performance profiling under normal load | Performance Targets, NFR-P1 |
| Initial load to interactive | ≤1s | Lighthouse on standard broadband | Performance Targets, NFR-P1 |
| Keyboard coverage of core actions | 100% | Manual keyboard-only audit + automated keyboard navigation test | FR14–FR19, Accessibility Level |
| Automated code coverage | ≥70% meaningful | Vitest/Jest coverage report | NFR-M1 |
| E2E test count | ≥5 passing Playwright tests | CI test run | NFR-M2 |
| WCAG 2.1 AA critical violations | 0 | axe-core + Lighthouse | NFR-A1, Accessibility Level |
| Cold-start deploy command | `docker-compose up` | Fresh-clone validation | FR32 |

## Product Scope

### MVP — Minimum Viable Product

- Create a task with a short textual description.
- Display a list of tasks, with completed tasks visually distinguished from active tasks.
- Toggle task completion status.
- Delete a task.
- Persist tasks across page reloads and browser restarts (backend storage).
- Empty state, loading state, and error state for the task list.
- Full keyboard operability: add, complete, delete, and move focus between tasks without the mouse.
- Responsive layout across all supported breakpoint tiers (see **Web App Specific Requirements › Responsive Design**).
- Accessibility: WCAG 2.1 AA compliance, zero critical violations (see **Accessibility Level** and **NFR-A1**).

### Growth Features (Post-MVP)

- User accounts and authentication (multi-user support).
- Task editing in place.
- Filtering (all / active / completed).
- Bulk actions (clear completed, mark all done).
- Task prioritization (high / medium / low).
- Due dates.
- Keyboard-shortcut reference overlay.

### Vision (Future)

- Multi-device sync and offline-first support.
- Shared / collaborative task lists.
- Categories and tags.
- Reminders and notifications (browser, email, mobile push).
- Natural-language task entry ("Buy milk tomorrow 5pm").
- Native mobile applications.

## User Journeys

### Persona: Sam

Sam is a self-employed designer juggling client deliverables and admin chores. He has tried half a dozen task apps and abandoned each one — Todoist's projects and tags became their own chore, Things wanted sync configuration, Apple Reminders buried his list behind three taps. He opens a browser tab while he thinks of something, and closes it when he is done. He wants a list that behaves like a sticky note he cannot lose.

### Journey 1 — First-time capture (happy path)

**Opening scene:** Sam is on a call. Someone mentions a contract rider he needs to review. He opens the URL a colleague sent him in a new tab.

**Rising action:** The page renders within a second. There is a single text input, focused. No signup prompt, no tour overlay, no "Allow notifications?" banner. He types *"Review contract rider"* and hits Enter. The task appears in the list below the input — no spinner, no delay. He types his next thought, hits Enter again. The call moves on; he closes the tab.

**Climax:** Later that evening he reopens the URL. His two tasks are still there.

**Resolution:** Sam registers the app as safe to throw thoughts into. The friction of "will this thing keep my data?" never materialized.

**Capabilities revealed:** instant-on UI with focused input, no onboarding, optimistic task creation, durable server-side persistence, session-independent data.

### Journey 2 — Daily list management (returning user)

**Opening scene:** It is the next morning. Sam opens the tab before coffee. Seven tasks from yesterday are on screen, two already marked complete from last night.

**Rising action:** He reads down the list. He checks off "Review contract rider" — the row visually shifts to a muted/struck-through state; still visible, but clearly done. He deletes a stale task ("Call about car service") that he handled out of band — it disappears with no confirmation dialog. He adds three new ones for the day.

**Climax:** The list now visually sorts into "what needs doing" vs "already done" without him needing to think about it. He can scan it at a glance and know where he stands.

**Resolution:** Sam spends fewer than 90 seconds in the app and leaves with a clear picture of the day. No friction, no decisions about labels or priorities or projects.

**Capabilities revealed:** visually distinct active vs. completed tasks, delete without confirmation (safety pattern — undo, dialog, or other — deferred to UX Design; see FR10), instant toggle, no mandatory categorization.

### Journey 3 — Keyboard-only flow (power user)

**Opening scene:** Sam has made this his default scratchpad. He keeps the tab pinned. He never uses the mouse when he is in it — muscle memory developed fast.

**Rising action:** He presses the text input (already focused), types a task, hits Enter. Arrow keys move focus between tasks. Space toggles complete / incomplete on the focused task. A dedicated delete key (e.g. Delete or Cmd+Backspace) removes the focused task. Tab moves focus back to the input.

**Climax:** Sam adds six tasks, completes four, and deletes two in under 15 seconds without lifting his hands from the keyboard. The experience feels closer to a terminal than a web app.

**Resolution:** The app becomes the fastest surface Sam has for capturing and clearing quick tasks, faster than paper.

**Capabilities revealed:** input always reachable, arrow-key task navigation, Space to toggle, Delete shortcut, Tab focus management, visible focus indicators, no keyboard traps.

### Journey 4 — Error recovery (edge case)

**Opening scene:** Sam is on a spotty train Wi-Fi. He types a task and hits Enter.

**Rising action:** The task appears immediately in the list (optimistic). Under the hood, the request to the backend fails. The app does not blow up. A subtle indicator appears next to the task showing it has not yet synced — not a modal, not a red banner, just a muted icon. The app retries in the background. When Wi-Fi returns, the icon clears; the task is now persisted.

**Alternate climax:** If the retry ultimately fails after a few attempts (Sam is offline for a long stretch), the task keeps its "unsynced" indicator and a small inline message explains: "Couldn't save — check connection." Sam trusts that his data is not silently lost.

**Resolution:** Sam never sees "Something went wrong" white-screen errors. The app either works or tells him clearly what it cannot do, without dropping his work.

**Capabilities revealed:** optimistic UI updates, retry-with-backoff for writes, non-intrusive sync-status indication, explicit error state with actionable message, no data loss on network failure.

### Journey Requirements Summary

The four journeys surface capabilities across four domains: core interaction, keyboard operation, persistence and durability, and UI state handling. Each capability traces to specific Functional Requirements — see **Functional Requirements** (particularly Task Capture & Listing, Task Completion, Task Deletion, Data Persistence, Keyboard Operation, and Failure Handling & Recovery). Keyboard-shortcut specifics (Enter, arrows, Space, Delete, Tab) surfaced by Journey 3 are expectations for the UX Design phase to formalize.

## Web App Specific Requirements

### Project-Type Overview

bmad-todo-app is delivered as a single-page web application (SPA) running in the browser against a REST API. The SPA choice follows directly from the speed-as-differentiator vision: optimistic updates, keyboard-driven interactions, and instant-on UI all require client-side state management. No SSR, no MPA navigation. No WebSockets — the app is single-user, so real-time sync is not required; the "feels instant" quality is achieved through optimistic UI + background retry, not server push.

### Browser Matrix

| Platform | Browser | Minimum version |
|---|---|---|
| Desktop | Chrome | Latest 2 major versions |
| Desktop | Firefox | Latest 2 major versions |
| Desktop | Safari | Latest 2 major versions |
| Desktop | Edge (Chromium) | Latest 2 major versions |
| Mobile | Safari on iOS | iOS 15+ |
| Mobile | Chrome on Android | Latest 2 major versions |

**Explicitly not supported:** Internet Explorer, legacy Edge (non-Chromium), browsers older than the listed minimums.

### Responsive Design

Breakpoints (mobile-first). Each breakpoint sits in the *gap* between common device widths so that common devices (iPhone 390–430, iPad 768–834, MacBook 1280–1440) fall inside a tier rather than on its boundary.

| Tier | Width range | Design notes |
|---|---|---|
| Compact | 0–599px | Phones portrait. Primary capture surface; one-thumb operation. Task list and input stack vertically. |
| Medium | 600–899px | Phones landscape, small tablets portrait. Increased horizontal padding; list width capped for readability. |
| Expanded | 900–1199px | Tablets landscape, small laptops. Content column centered; list width capped (~640–720px). |
| Large | 1200–1799px | Desktops. Same centered column layout; generous whitespace around the list. |
| Extra-large | 1800px+ (optional) | Large desktops / ultrawide. No further layout changes; content does not stretch to fill viewport. |

Rationale: common device widths fall inside tiers, not on boundaries — avoids layout thrash at common resize / orientation-change points.

Additional requirements:
- Touch targets ≥44×44px on mobile/tablet.
- Text scales gracefully with user zoom up to 200% (WCAG 1.4.4).
- No horizontal scroll at any supported breakpoint.
- Layout uses CSS Grid/Flexbox; no fixed pixel widths on containers.

### Performance Targets

| Metric | Target | Tool |
|---|---|---|
| Lighthouse Performance score (mobile) | ≥90 | Lighthouse, simulated Slow 4G + 4× CPU slowdown |
| Lighthouse Performance score (desktop) | ≥95 | Lighthouse, desktop profile |
| Time to Interactive (standard broadband) | ≤1s | Lighthouse |
| Largest Contentful Paint | ≤1.5s mobile, ≤1s desktop | Lighthouse |
| First Input Delay / INP | ≤100ms (95th pct) | Lighthouse + RUM where available |
| Perceived interaction latency (add / toggle / delete) | ≤100ms (95th pct) | Browser performance profiling under normal load |
| JavaScript bundle size (main chunk, gzipped) | ≤100KB | Build-time analysis |

### SEO Strategy

**Not an SEO product.** The application is a tool, not a content site — there is nothing meaningful to index. SEO effort is intentionally minimal:

- `<title>` and `<meta name="description">` present with sensible defaults.
- Favicon set (16×16, 32×32, apple-touch-icon).
- `<meta name="viewport">` set for mobile responsiveness.
- **Not required:** sitemap, robots.txt beyond default, Open Graph / Twitter Card tags, JSON-LD / schema.org, SSR for crawlers, internationalization.

### Accessibility Level

**Target: WCAG 2.1 Level AA conformance.**

- **Keyboard operability:** 100% of core actions reachable via keyboard with no traps (WCAG 2.1.1, 2.1.2).
- **Visible focus:** every focusable element has a visible focus indicator meeting 3:1 contrast (WCAG 2.4.7, 2.4.11).
- **Color contrast:** text meets 4.5:1 for normal, 3:1 for large (WCAG 1.4.3); completed-task visual style must meet contrast against its background.
- **Non-color signaling:** completed state uses text-decoration + optional icon, not color alone (WCAG 1.4.1).
- **Form labels:** task input has an explicit programmatic label (WCAG 3.3.2, 4.1.2).
- **Live regions:** sync-status changes announced via ARIA live regions (WCAG 4.1.3).
- **Zero critical violations** per axe-core and Lighthouse accessibility audits.

### Implementation Considerations

- **Client architecture:** single-page application with client-side routing only if a settings/about page is added; MVP has a single view, so routing is not strictly required for MVP.
- **State management:** the product has minimal client-side state. Server data (the task list) should be managed by a server-state caching library appropriate to the chosen framework (e.g. TanStack Query for React / Solid / Vue, or equivalent), providing optimistic mutations and background retry out of the box. UI-only state (focus target, transient error, sync-status flags) belongs in component-local state or a lightweight reactivity primitive appropriate to the framework (e.g. Solid signals, React hooks + lightweight store, Svelte stores, Vue refs). Specific libraries are deferred to the architecture phase. The only PRD-level constraints: any choice must fit the bundle-size target (≤100KB main chunk, gzipped) and must not introduce meaningful per-action ceremony for the CRUD loop — heavy-ceremony patterns like hand-rolled Redux reducers/actions are not justified at this scope, but that is a dev-experience constraint, not a framework prescription.
- **Data fetching:** optimistic mutations against the REST API with automatic retry and cache invalidation (e.g. TanStack Query, SWR, or equivalent).
- **Offline behavior:** not required for MVP. Failed writes retry in background; persistent offline support is a Vision feature.
- **Asset delivery:** static assets served with long-lived cache headers; application shell cached via standard HTTP caching. Service Worker / PWA is a Vision feature, not MVP.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP type: Experience MVP.** The product is deliberately *not* proving a problem (the need for a TODO app is not in question) and not targeting revenue. What it validates is whether a minimal capability set, executed to a polished quality bar, feels like a *complete* product rather than a toy. The smallest set of interactions that earns that judgement is the MVP — not the smallest set that technically passes unit tests.

**Implication for scope decisions:** adding more features does not improve the MVP; it dilutes it. When scope pressure appears, the answer is to execute the existing scope more finely (sharper focus states, crisper keyboard affordances, tighter error handling), not to add a sixth or seventh feature.

### MVP Feature Set (Phase 1)

See **Product Scope › MVP** for the authoritative capability list. The MVP delivers the four core user journeys documented in **User Journeys** (first-time capture, daily management, keyboard-only flow, error recovery).

### Post-MVP Features

See **Product Scope › Growth Features (Post-MVP)** and **Product Scope › Vision (Future)** for the phased roadmap. Summary of the phasing logic:

- **Phase 2 (Growth)** unlocks multi-user (accounts) and list management ergonomics (editing, filtering, priority, due dates). Entered only after MVP has been validated as complete on its own terms.
- **Phase 3 (Vision)** unlocks multi-device sync, collaboration, and platform surfaces (mobile native, offline-first, notifications). Entered only if demand for single-user use is clearly saturating.

### Resource Requirements

- **Team:** 1 full-stack developer, AI-assisted. No dedicated designer required — the product's visual scope is intentionally minimal and design follows WCAG patterns + the breakpoint system.
- **Infrastructure:** Docker and docker-compose; no managed cloud services required for the MVP runtime. Storage can be file-based (SQLite or equivalent); no Postgres, no Redis.
- **CI:** required — bundle-size check, Lighthouse check, axe-core check, coverage gate, Playwright E2E run per PR. Without CI enforcement, the measurable success criteria are aspirational only.

### Risk Mitigation Strategy

**Technical risks**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Triple-constraint target (≤100KB bundle + ≤90 Lighthouse mobile + ≤100ms interaction) missed due to framework / library weight | Medium | High — misses the differentiator | Enforce bundle budget in CI; architecture phase picks a framework that fits the budget (Solid, Preact, Svelte, or a lean React setup); use server-state cache library rather than hand-rolled client state |
| Focus management breaks on task deletion (where does focus go?) — silent a11y regression | Medium | Medium | Include focus-management test cases in Playwright E2E suite; manual keyboard-only audit in story DoD |
| Optimistic update + retry logic has edge cases (duplicate writes, stale reads) | Medium | Medium | Explicit idempotency in API design (client-generated task IDs); architecture phase produces sequence diagrams for happy path + failure path |
| Keyboard shortcuts conflict with browser or screen-reader shortcuts | Low | Medium | Reserve only non-conflicting keys (Enter, Space, Delete, arrows, Tab); test against NVDA + VoiceOver in accessibility audit |

**Product risks**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| "Minimal" reads as "unfinished" if interaction polish slips | Medium | High | Polish is MVP scope, not post-MVP; scope pressure must not trade polish for features |
| No onboarding means keyboard shortcuts are undiscoverable | Medium | Low–Medium | Visible hint affordance (e.g. subtle shortcut labels on hover/focus); shortcut reference overlay is a Growth feature but initial set should be self-evident (Enter, Space, Delete, arrows) |

**Resource / scope risks**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep toward Growth features (auth, due dates, prioritization) mid-build | Medium | High — dilutes the execution-over-breadth vision | Reject during story intake; reference this Scoping section as the authoritative MVP boundary |
| Over-engineering in architecture (multi-service compose, unnecessary databases, speculative abstraction) | Medium | Medium | Architecture phase defends against its own complexity — single-container deployable, file-backed storage, no premature service split |
| Missing a measurable target (coverage, WCAG, Lighthouse) at release | Medium | High — the targets *are* the Success Criteria | CI gates per PR from day one, not bolted on at end |

## Functional Requirements

### Task Capture & Listing

- **FR1:** Users can create a new task by entering a short text description.
- **FR2:** Users can view all of their tasks in a single list.
- **FR3:** Users can see at a glance which tasks are active and which are completed, with the distinction communicated through more than color alone.
- **FR4:** The product displays an explicit empty state when the task list contains no tasks.
- **FR5:** The product displays an explicit loading state while the task list is being retrieved.
- **FR6:** The product displays an explicit error state when task retrieval fails, and the message communicates what the user can do.

### Task Completion

- **FR7:** Users can mark an active task as completed.
- **FR8:** Users can mark a completed task as not completed (restore to active).
- **FR9:** Completed tasks remain in the list and remain visible until the user explicitly deletes them.

### Task Deletion

- **FR10:** Users can delete a task from the list. (Whether deletion requires confirmation, supports undo, or happens immediately is a UX Design decision.)

### Data Persistence

- **FR11:** Tasks persist across browser page reloads.
- **FR12:** Tasks persist across browser sessions.
- **FR13:** Tasks persist across server and container restarts.

### Keyboard Operation

- **FR14:** Users can add a task using the keyboard alone.
- **FR15:** Users can toggle task completion using the keyboard alone.
- **FR16:** Users can delete a task using the keyboard alone.
- **FR17:** Users can move focus between tasks using the keyboard alone.
- **FR18:** The task input is focused on page load so that the user can begin typing immediately, without any input action.
- **FR19:** Every focusable element communicates its focus state visibly, so the user always knows where keyboard input will be applied.

### Responsive & Accessible Presentation

- **FR20:** The product renders and remains functional across all supported browser and breakpoint combinations (see Browser Matrix and Responsive Design).
- **FR21:** The product is operable via screen reader, with task content and state announced by assistive technology.
- **FR22:** Status changes produced by background operations (sync result, retry outcome, error) are announced to assistive technologies.

### Failure Handling & Recovery

- **FR23:** Task creation, completion toggle, and deletion appear to succeed immediately from the user's perspective.
- **FR24:** When a write operation fails, the product retries in the background without requiring user action.
- **FR25:** When a write operation has not yet successfully synced, the affected task displays a non-intrusive sync-status indicator.
- **FR26:** When background retries ultimately exhaust, the product displays an actionable error message in context without losing the user's input.
- **FR27:** The product never silently loses task data due to network or transient backend failures.

### API

- **FR28:** The product exposes an HTTP API that supports creating, reading, updating (completion status), and deleting tasks.
- **FR29:** API write operations are idempotent on retry, so repeated attempts with the same intent do not produce duplicate tasks.
- **FR30:** API error responses use a consistent error contract (shape, error codes) across all endpoints.
- **FR31:** The API exposes a health-check endpoint that reports service readiness.

### Deployment & Operability

- **FR32:** The product starts with a single `docker-compose up` command, with no additional manual configuration required.
- **FR33:** Container logs are accessible via standard `docker-compose logs` to support observability during development and troubleshooting.
- **FR34:** The product can be stopped and restarted without data loss.

## Non-Functional Requirements

### Performance

Specific targets (Lighthouse scores, TTI, LCP, INP, interaction latency, bundle size) are documented in **Web App Specific Requirements › Performance Targets**. NFR obligations:

- **NFR-P1:** The product must meet all targets in the Performance Targets table at release and continuously under CI enforcement. A PR that regresses any target below threshold does not merge.
- **NFR-P2:** Performance budgets are enforced at build time, not at release gate: bundle size, Lighthouse mobile score, and Lighthouse accessibility score are checked per PR in CI.
- **NFR-P3:** Performance targets apply to the median supported device / browser combination. The product does not guarantee targets on unsupported devices (see Browser Matrix), but must not crash or render unusably on them.

### Accessibility

Detailed obligations are documented in **Web App Specific Requirements › Accessibility Level**. NFR summary:

- **NFR-A1:** The product conforms to WCAG 2.1 Level AA with zero critical violations per axe-core and Lighthouse accessibility audits.
- **NFR-A2:** Accessibility audits run in CI on every PR; a PR that introduces a critical violation does not merge.
- **NFR-A3:** Screen-reader smoke tests on NVDA + Chrome (Windows), VoiceOver + Safari (macOS), and VoiceOver + Safari (iOS) pass before release.

### Security & Privacy

The product does not handle authentication, payments, PHI, PII, or any regulated data classification. Security obligations are therefore the web-app baseline, not a heavy compliance framework.

- **NFR-S1:** All user-generated content (task descriptions) is rendered in a way that prevents injection of arbitrary HTML, JavaScript, or script elements into the DOM (XSS prevention).
- **NFR-S2:** The backend validates and sanitizes all task-description input at the API boundary; no SQL injection, no NoSQL injection, no command injection vectors in the API handlers.
- **NFR-S3:** All third-party dependencies are version-pinned and audited for known vulnerabilities at build time; a dependency with a known high-or-critical CVE does not ship in a release.
- **NFR-S4:** The product does not collect, log, or transmit any personal identifying information. Task content is the only user-generated data stored; it is accessible only to the user who created it and is not shared with third parties.
- **NFR-S5:** The API enforces reasonable input-size limits (task-description length, request body size) to prevent resource-exhaustion attacks.

### Reliability & Observability

- **NFR-R1:** The product tolerates transient network failures without silent data loss (tied to FR23–FR27).
- **NFR-R2:** The product tolerates transient backend failures: a crashed backend container can be restarted via docker-compose without data loss.
- **NFR-R3:** Data persistence is atomic per operation: a crash mid-write does not leave the persisted state in an inconsistent state (e.g. half-written task row).
- **NFR-R4:** Logs are emitted in a machine-readable format (structured JSON or equivalent) at appropriate levels — `info` for normal operations, `warn` for retryable errors, `error` for unexpected failures.
- **NFR-R5:** The health-check endpoint (FR31) reports status within 5 seconds of container start and returns HTTP 200 when the product is ready to serve requests.

### Maintainability

Maintainability is an explicit product concern: the solution should be easy to understand, deploy, and extend.

- **NFR-M1:** Automated test coverage ≥70% meaningful coverage (branch and logic) on both frontend and backend, enforced by CI.
- **NFR-M2:** End-to-end test suite of ≥5 Playwright tests covering the core journeys (create, complete, delete, empty state, error handling).
- **NFR-M3:** The codebase passes its own linter and type-checker without warnings. PRs introducing new warnings do not merge.
- **NFR-M4:** Public interfaces (API contract, module boundaries) are documented either inline (docstrings, schema) or in a minimal `README.md` sufficient for a new developer to run and modify the product locally within 30 minutes.
- **NFR-M5:** Dependency footprint is conservative: libraries are added only when they replace more code than they introduce, and total dependency count is reviewable on a single screen.
