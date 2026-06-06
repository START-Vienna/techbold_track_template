# Requirements: Service Desk Autopilot

**Defined:** 2026-06-06
**Core Value:** Win the scoring rubric — B (troubleshooting, 35) + C (safety & audit, 20) are 55% of the score. Solve hidden Linux-service incidents on fresh VMs, safely and auditably.

> Derived from `docs/PRD.md` (scope §6), `docs/scoring.md` (rubric A–E), and `docs/TASKS.md` (P0/P1 + build order). These docs are LOCKED source of truth. REQ-IDs map to phases via the build-order critical path. Rubric block noted on each requirement.

## v1 Requirements

Requirements for the hackathon submission (code freeze Sun Jun 7, 14:00). Each maps to a roadmap phase.

### Platform (Repo, Env, Reproducibility)

- [ ] **PLAT-01**: Backend migrated to Node 22 + Hono + TypeScript; `docker compose up` serves `GET /health → {status:"ok"}` and the frontend still loads at :5173 — *E*
- [ ] **PLAT-02**: Zod-validated env config fails fast with a readable message on a missing required var — *E*
- [ ] **PLAT-03**: `.env.example` present with placeholders only; `.env` and `keys/` git-ignored; no secrets committed — *C/E*
- [ ] **PLAT-04**: Mock mode (`MOCK_MODE`) drives the full loop offline for Phoenix, SSH, and LLM — *E*

### ERP Workflow (Phoenix Client + Tickets)

- [ ] **ERP-01**: Typed Phoenix client lists assigned tickets via the ERP API (auth, 8s timeout, 1 retry on 5xx) — *A*
- [ ] **ERP-02**: Ticket list shows title, customer, priority, and status — *A*
- [ ] **ERP-03**: Ticket list supports sort/filter by at least status, priority, or date — *A*
- [ ] **ERP-04**: Customer-system (SSH target) information loads for a ticket — *A*
- [ ] **ERP-05**: Auth (401), 404, and empty states degrade gracefully without breaking the workflow — *A*
- [ ] **ERP-06**: In-memory Phoenix mock returns fixtures for every client method used in the loop — *E*

### Safety & Audit

- [ ] **SAFE-01**: Deterministic blocklist classifies every dangerous command as `HIGH_RISK_BLOCKED` before execution, including obfuscation variants (extra spaces, quotes, `$()`/backtick wrappers) — *C*
- [ ] **SAFE-02**: Risk classifier assigns a risk level to every command; the LLM may only raise a level, never lower it — *C*
- [ ] **SAFE-03**: Secret redaction strips secrets from every string before it reaches the audit log, UI, or model — *C*
- [ ] **SAFE-04**: Append-only audit log records every proposed/approved/rejected/executed command and key action; no delete path — *C*
- [ ] **SAFE-05**: Edited commands are re-validated at approval time; a dangerous edit is blocked (422 + audit BLOCKED) — *C*
- [ ] **SAFE-06**: Safety layer is covered by tests — every blocklist pattern, obfuscation variant, edited-command recheck, and redaction — *C/E*

### Troubleshooting (Agents + Orchestrator)

- [ ] **DIAG-01**: `problem_analyzer` agent returns ranked root-cause hypotheses with evidence, then one read-only diagnostic command (purpose + expected signal + risk) — *B/D*
- [ ] **DIAG-02**: Agent prompts are scoped to local Linux services only and generalise — no branches keyed to ticket IDs, hostnames, or symptom strings — *B*
- [ ] **DIAG-03**: Deterministic orchestrator drives run phases (TRIAGING → WAITING_FOR_APPROVAL → EXECUTING → OBSERVING → … → DRAFTING_ACTIVITY) with a max-steps cap; block → ask alternative — *B/C*
- [ ] **DIAG-04**: `problem_solver` agent proposes a minimal, reversible fix with a captured rollback — *B*
- [ ] **DIAG-05**: `validator` agent proves the customer benefit is restored (never `is-active`) and checks persistence after reboot/restart; single success → `LIKELY_FIXED`, repeated → `VERIFIED_FIXED` — *B*
- [ ] **DIAG-06**: Generalising loop solves all 5 practice VMs cleanly, reboot-persistent, with zero safety flags, via prompts/safety/validation (no per-incident hacks) — *B*

### Run API & Events

- [ ] **API-01**: Run routes work per PRD §9: `POST /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/next`, `POST /api/runs/:id/abort` — *B/D*
- [ ] **API-02**: Approval routes approve (optionally edited) → safety re-check → execute, and reject-with-reason → agent proposes an alternative — *C*
- [ ] **API-03**: SSE stream emits run events live (`run.started`, `approval.required`, `command.completed`, etc.); every meaningful side-effect emits and audits the same event — *D*
- [ ] **API-04**: Run store persists runs, approvals, results, observations, and activity drafts (SQLite, JSONL fallback) — *C/E*

### Activity Generation

- [ ] **ACT-01**: `activity_log_generator` produces all 5 graded fields (`summary`, `root_cause`, `actions_taken`, `commands_summary`, `validation_result`) from the audit trail only — no invented facts, no secrets — *A/B*
- [ ] **ACT-02**: `POST /api/runs/:id/activity/draft` and `/activity/submit` create a Phoenix activity via `createActivity` — *A/B*

### Technician UX (Frontend)

- [ ] **UX-01**: Ticket overview (list) is easy to understand and drives navigation — *D*
- [ ] **UX-02**: Ticket detail view shows the customer system information — *D*
- [ ] **UX-03**: Run page shows visible agent progress via a live SSE timeline — *D*
- [ ] **UX-04**: Approval card shows command, purpose, expected signal, risk level, and safety notes with approve / edit-then-approve / reject-with-reason — *C/D*
- [ ] **UX-05**: Audit timeline shows followable logs and actions — *C/D*
- [ ] **UX-06**: Activity editor lets the technician edit and submit the generated draft — *A/D*
- [ ] **UX-07**: Retry and abort controls are available in the UI — *D*

### Engineering & Submission

- [ ] **ENG-01**: Real README covers setup, run, environment, architecture, assumptions, and troubleshooting; a fresh clone runs via `docker compose up` following only the README — *E*
- [ ] **ENG-02**: Tests for phoenix-client and orchestrator (mocked fetch + mocked SSH/model; happy path + reject path); `pnpm test` green — *E*
- [ ] **ENG-03**: MIT LICENSE present; repo public in the START Hack Vienna '26 org; secret scan clean before freeze — *C/E*
- [ ] **ENG-04**: `REPORT.md` covers approach, agent design, safety model, and results on the 5 practice VMs — *Submission*

## v2 Requirements

Deferred — build only if P0 is green (PRD §6.2, TASKS P1/P2). Tracked, not in the current roadmap critical path.

### Human Control & Reliability

- **HCR-01**: Human-driven command path — technician runs their own command through the same safety + audit path (`POST /runs/:id/manual-command`)
- **HCR-02**: One-click verified Undo — revert last change via rollback, re-test no-regression
- **HCR-03**: Plan-approval for read-only batches — approve a read-only plan at once; every mutation still individually gated
- **HCR-04**: SSH executor hardening + tool preflight (`bash -lc` PATH, `sudo -n`, exit-code-truth, `LANG=C`, OS/tools/sudo preflight)
- **HCR-05**: Agent→human question channel (`agent.question` event + answer endpoint)
- **HCR-06**: Policy auto-approve mode — auto-confirm `SAFE_READ_ONLY`, hard-block DENY (confirm grading flow with mentors)

### UX & Safety Boosters

- **BOOST-01**: Ranked-hypotheses + evidence panel in UI; technician picks which hypothesis to pursue
- **BOOST-02**: Redaction preview in UI — show output was redacted before display
- **BOOST-03**: Optional LLM safety second-opinion — can only raise concern, never override a deterministic block
- **BOOST-04**: Dry-run + redacted diff before mutate (`nginx -t` / `apt-get -s` + config diff)
- **BOOST-05**: Blast-radius on approval card — dependents + active connections before a restart/stop
- **BOOST-06**: Broader orchestrator/safety test coverage (blocked path, SSH-timeout path, Phoenix-submit path)

## Out of Scope

Explicitly excluded (PRD §6.3, §11). Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Fully autonomous remediation | Against the rules — a human confirms every action |
| Multi-tenant auth / RBAC / SSO | Single-team local tool; Phoenix token stays server-side |
| WebSockets, queues, Redis, background workers, k8s, microservices | Non-goals under a 24h time box; SSE + SQLite suffice |
| RAG / vector DB | Nothing in the case requires document retrieval |
| Analytics, charts, theming, animations, design-system polish | UI is only 10 rubric points |
| Generic Linux admin assistant beyond incident scope | Agent is scoped to diagnose-and-fix-this-ticket |
| Setting ticket status `DONE` | Unscored courtesy (P2); never gate the demo on it |
| Provider-agnostic LLM gateway | One provider behind one `model.ts`; no abstraction layer |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 1 | Pending |
| PLAT-04 | Phase 1 | Pending |
| ERP-01 | Phase 2 | Pending |
| ERP-02 | Phase 2 | Pending |
| ERP-03 | Phase 2 | Pending |
| ERP-04 | Phase 2 | Pending |
| ERP-05 | Phase 2 | Pending |
| ERP-06 | Phase 2 | Pending |
| SAFE-01 | Phase 3 | Pending |
| SAFE-02 | Phase 3 | Pending |
| SAFE-03 | Phase 3 | Pending |
| SAFE-04 | Phase 3 | Pending |
| SAFE-05 | Phase 3 | Pending |
| SAFE-06 | Phase 3 | Pending |
| API-04 | Phase 3 | Pending |
| DIAG-06 | Phase 4 | Pending |
| DIAG-01 | Phase 5 | Pending |
| DIAG-02 | Phase 5 | Pending |
| DIAG-03 | Phase 5 | Pending |
| DIAG-04 | Phase 5 | Pending |
| DIAG-05 | Phase 5 | Pending |
| API-01 | Phase 6 | Pending |
| API-02 | Phase 6 | Pending |
| API-03 | Phase 6 | Pending |
| ACT-01 | Phase 7 | Pending |
| ACT-02 | Phase 7 | Pending |
| UX-01 | Phase 8 | Pending |
| UX-02 | Phase 8 | Pending |
| UX-03 | Phase 8 | Pending |
| UX-04 | Phase 8 | Pending |
| UX-05 | Phase 8 | Pending |
| UX-06 | Phase 8 | Pending |
| UX-07 | Phase 8 | Pending |
| ENG-01 | Phase 9 | Pending |
| ENG-02 | Phase 9 | Pending |
| ENG-03 | Phase 9 | Pending |
| ENG-04 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 39 total (REQUIREMENTS.md header said 36 — that count was stale; actual count is 39 after PLAT/ERP/SAFE/DIAG/API/ACT/UX/ENG IDs enumerated)
- Mapped to phases: 39/39
- Unmapped: 0

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-06-06 after roadmap creation*
