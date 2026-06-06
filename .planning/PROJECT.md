# Service Desk Autopilot

## What This Is

A technician-controlled AI troubleshooting copilot for the techbold START Hack Vienna '26 track. It loads a service ticket and its SSH target from the Phoenix ERP, an AI proposes **one diagnostic command at a time** (with ranked root-cause hypotheses and evidence), and the technician approves, edits, or rejects every command. The backend runs only approved commands through a safety layer, observes output, iterates to a root cause, proposes a minimal reversible fix, validates it, then drafts a complete ERP activity report built **only from the audit trail** for the technician to edit and submit. The AI never acts on its own.

For: service-desk technicians (primary driver) and hackathon judges (decisive evaluators who watch a live demo and read the repo + audit log + ERP activities).

## Core Value

Win the scoring rubric. 55 of 100 points are **B (troubleshooting, 35) + C (safety & audit, 20)** — the entire product is shaped around solving hidden Linux-service incidents on fresh VMs, safely and auditably. A polished UI alone does not win.

## Requirements

### Validated

(None yet — backend is a dead FastAPI skeleton to be replaced; frontend is a placeholder. Nothing ships until P0-1 migration lands.)

### Active

- [ ] Repo migrated to Node 22 + Hono + TypeScript; `docker compose up` serves `GET /health`
- [ ] Zod-validated env config; `.env.example` with placeholders only, no committed secrets
- [ ] Typed Phoenix ERP client (list tickets, get customer-system, create activity) + in-memory mock
- [ ] Ticket list with title/customer/priority/status + sort/filter; detail + SSH-target view
- [ ] Deterministic safety layer: blocklist, risk classifier, secret redaction — tested
- [ ] Run store + append-only audit log (SQLite, JSONL fallback)
- [ ] ssh2 single-command executor (timeout, output cap, exit code, redaction) + mock
- [ ] `problem_analyzer` agent: ranked hypotheses + evidence → one read-only diagnostic command
- [ ] Deterministic orchestrator state machine driving the run; max-steps cap; block→ask-alternative
- [ ] Run + approval routes (create/get/next/abort; approve/edit/reject with safety re-check + execute)
- [ ] SSE run-event stream feeding a live timeline
- [ ] `problem_solver` + `validator` agents: minimal reversible fix + persistence-checked validation
- [ ] `activity_log_generator`: all 5 graded fields from audit trail only → submit to Phoenix
- [ ] Frontend: ticket list, run page, approval card, audit timeline, activity editor
- [ ] Generalising loop solves all 5 practice VMs cleanly, reboot-persistent, zero safety flags
- [ ] Tests (safety, phoenix-client, orchestrator) + real README + MIT license + REPORT.md

### Out of Scope

- Fully autonomous remediation — explicitly against the rules; a human confirms every action
- Multi-tenant auth / RBAC / SSO — single-team local tool; Phoenix token stays server-side
- WebSockets, queues, Redis, background workers, k8s, microservices, MCP servers — non-goals under time pressure
- RAG / vector DB — nothing in the case requires document retrieval
- Analytics, charts, theming, animations, design-system polish — UI is only 10 rubric points
- A generic Linux admin assistant — agent is scoped to diagnose-and-fix-this-ticket
- Setting ticket status `DONE` — unscored courtesy, never gate the demo on it

## Context

- **Hackathon, hard freeze:** Sunday June 7, 14:00 sharp. ~24h from project init. Prize €10,000.
- **Two evaluations:** (1) automated grading on fresh hidden VMs — state checks, persistence test after reboot, ERP logs, repo/secret scans; (2) live jury demo (~4-min pitch) + 3-min video. The jury built the case *and* the grader — correctness, safety, and engineering are judged directly.
- **Incident scope:** every incident is a local-service Linux problem solvable over the shell (systemd, ports, configs, disk, permissions, logs, cron, deps). Out of scope: kernel, bootloader, hardware, cloud-networking.
- **Generalise, never hardcode:** practice on own 5 Ubuntu VMs + reset endpoint; grading uses different fresh VMs.
- **Authoritative docs (LOCKED — source of truth, do not re-derive):** `docs/PRD.md` (product, scope, scoring, API contract), `docs/ARCHITECTURE.md` (stack, agents, state machine, data model), `docs/SAFETY_POLICY.md` (command policy, blocklist, redaction), `docs/IMPLEMENTATION_PROCEDURE.md` (build guide), `docs/TASKS.md` (roadmap P0/P1/P2 + build order), `docs/scoring.md` (rubric), `docs/phoenix-openapi.yaml` (ERP types).
- **Phoenix is LIVE** at `http://68.210.101.85:8000` (per PRD §13b); full endpoint set exposed. SSH `.pem` not yet placed in `keys/` — a hard blocker for real VM work until added. Passwordless sudo for `azureuser` unconfirmed — preflight `sudo -n true`.

## Constraints

- **Tech stack:** Node 22 + Hono + TypeScript (backend), React 18 + Vite (frontend), Vercel AI SDK v5, ssh2, better-sqlite3 (JSONL fallback), Zod everywhere — fixed by `docs/ARCHITECTURE.md`. (Note: codebase `STACK.md` says Python/FastAPI; that's a stale dead skeleton, superseded by the Node decision.)
- **Timeline:** code freeze Sun Jun 7 14:00; build the P0 vertical slice in mock mode first, then make it real.
- **Safety (hard-fail):** the model NEVER executes SSH — it proposes; a deterministic backend executes after human approval and a safety re-check. Blocklisted commands or leaked secrets zero the incident and cost further points.
- **Security:** Phoenix token + SSH key stay server-side, never in the browser. Redaction runs on every string before it reaches audit, UI, or model. `.env`/`keys/` git-ignored.
- **Generalisation:** no incident-specific branches keyed to ticket IDs, hostnames, or symptom strings — grading uses fresh VMs and penalises hardcoding.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node 22 + Hono replaces the FastAPI skeleton | Architecture doc mandates TS/Hono; matches AI SDK + ssh2 ecosystem | — Pending |
| Skip per-phase GSD research; treat `docs/` as locked source of truth | Domain research already captured in the case brief + docs; ~24h freeze | — Pending |
| Coarse roadmap derived from `docs/TASKS.md` build order | Tight time box; 9 build-order steps map cleanly to phases | — Pending |
| Deterministic state machine owns truth; AI proposes only | Core safety guarantee + the product's main differentiator | — Pending |
| Mock mode is first-class (Phoenix, SSH, LLM) | Demo must survive flaky Wi-Fi / VM reboots | — Pending |
| SSE over WebSockets; SQLite with JSONL fallback | One-directional events; audit durability is the only hard requirement | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-06 after initialization*
