# Project Context Analysis

## Requirements Overview

**Functional Requirements:** 34 FRs across 8 categories — Task Capture & Listing (FR1–FR6), Task Completion (FR7–FR9), Task Deletion (FR10, resolved by UX as immediate-delete + 5s UndoSnackbar + Cmd/Ctrl+Z), Data Persistence (FR11–FR13), Keyboard Operation (FR14–FR19), Responsive & Accessible Presentation (FR20–FR22), Failure Handling & Recovery (FR23–FR27), API (FR28–FR31), Deployment & Operability (FR32–FR34).

The architecturally load-bearing FRs are:

- **FR23–FR27 + FR29** — optimistic UI with background retry plus idempotent writes. Forces client-generated task IDs and a row-local sync-state model spanning frontend data layer and API.
- **FR11–FR13** — durable persistence across reload, session, and container restart. Forces a real backing store, not in-memory state.
- **FR14–FR19** — full keyboard operability including focus-on-load and predictable focus landing. Forces explicit focus management primitives.
- **FR28–FR31** — REST CRUD plus health check plus consistent error contract. Defines the API surface.
- **FR32–FR34** — single `docker compose up`, log access via `docker compose logs`, restart-without-loss. Forces a deployable that boots clean from a fresh clone with no manual configuration.

**Non-Functional Requirements:** the NFRs that drive architectural decisions:

- **NFR-P1/P2/P3 (Performance):** ≤100ms interaction latency (95th pct), ≤1s TTI, Lighthouse mobile ≥90 / desktop ≥95, ≤100KB main JS chunk gzipped. Bundle and Lighthouse enforced per PR. This constrains framework choice and CSS approach materially.
- **NFR-A1/A2/A3 (Accessibility):** WCAG 2.1 AA with zero critical violations, axe-core in CI, screen-reader smoke on NVDA/VoiceOver before release.
- **NFR-S1–S5 (Security & Privacy):** XSS prevention at DOM render, input validation/sanitization at API boundary, dependency CVE audit, no PII/PHI, ≤500-char task / ≤10KB body / per-IP rate limit (policy TBD this phase).
- **NFR-R1–R5 (Reliability):** transient-failure tolerance, atomic single operations, structured JSON logging, health endpoint readiness ≤5s.
- **NFR-M1–M5 (Maintainability):** ≥70% meaningful coverage, ≥5 Playwright E2E tests, lint/type-check clean, ≤25 direct deps per package, README sufficient for a new developer to run + modify in 30 minutes.

**Scale & Complexity:**

- **Primary domain:** full-stack web — responsive SPA against a REST API.
- **Complexity level:** low — single-user, no auth, no multi-tenancy, no regulated-data concerns, no real-time sync. Architecturally simple; the difficulty is in execution discipline against tight performance and accessibility gates.
- **Architectural components anticipated:** ~2 packages (frontend SPA, backend API), possibly a small shared types module. Single deployable unit via `docker compose` — service split inside the compose file is a decision for this phase.

## Technical Constraints & Dependencies

Constraints inherited from the PRD and UX specification:

- **Topology fixed:** SPA + REST API; no SSR, no WebSockets, no service worker / PWA, no offline mode at MVP, no client-side routing required.
- **Deployment fixed:** `docker compose up` only; no managed cloud services; file-based storage acceptable (SQLite-class). No Postgres, no Redis at MVP.
- **Bundle budget:** ≤100KB gzipped main chunk forces a lean framework (PRD names Solid / Preact / Svelte / lean React as candidates) and a thin CSS strategy.
- **Dependency cap:** ≤25 direct deps per package — frontend and backend counted separately. Any framework that brings a heavy default dependency tail is disqualified.
- **Custom design system, token-driven** — no third-party component kit permitted for the visual layer. A single narrow headless a11y primitive may be imported for UndoSnackbar if that path is selected.
- **Idempotency contract:** writes must be safe to retry; client-generated task IDs are the implied mechanism.
- **Consistent error contract** across all API endpoints (FR30); the shape and error codes are an architecture-phase decision.

## Cross-Cutting Concerns Identified

- **Optimistic-mutation + retry contract** spans frontend data layer and API. Affects: data-fetching library choice, ID generation strategy, API request/response shape, error contract.
- **Error contract consistency** (FR30): every endpoint emits the same shape. Centralized error-mapping module on each side.
- **Structured JSON logging** (NFR-R4): consistent log schema across frontend (where applicable, e.g. unhandled errors reported to backend or console) and backend, at info / warn / error levels.
- **ARIA live-region strategy:** a single global LiveRegion announces state transitions; component-level events feed into it. Cross-cuts every mutation path.
- **Quality gates as architecture:** bundle-size check, Lighthouse mobile, axe-core, dep-count, coverage, Playwright. These are first-class workflow obligations, not afterthoughts.
- **Atomic single-operation persistence** (NFR-R3): no half-written state. Affects storage-engine and write-path choice.
- **Input safety at boundaries** (NFR-S1, S2, S5): XSS prevention at DOM render, validation/sanitization + size limits at API ingress, per-IP rate-limit policy.
- **Theme via `prefers-color-scheme`:** OS-driven; no user toggle at MVP. Affects token wiring in CSS.
- **Reduced-motion compliance:** every animation collapses to instant under `prefers-reduced-motion: reduce`. Cross-cuts component CSS.
