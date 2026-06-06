<!-- refreshed: 2026-06-06 -->
# Architecture

**Analysis Date:** 2026-06-06

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                     │
│              `frontend/src/App.tsx`                          │
│   Technician workspace — ticket list, run page, SSE stream   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / SSE  (VITE_API_BASE)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               Backend API Layer (Hono on Node 22)            │
│  `backend/src/app.ts`  ·  `backend/src/routes/`              │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  tickets.ts  │   runs.ts    │ approvals.ts │  activity.ts   │
│  events.ts   │  health.ts   │              │                │
└──────┬───────┴──────┬───────┴──────┬───────┴────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│              Orchestrator / State Machine                     │
│              `backend/src/ai/orchestrator.ts`                 │
│  Pure fn: (currentState, event) → nextState + sideEffects    │
└──────┬──────────────┬───────────────────────────────────────┘
       │              │
       ▼              ▼
┌─────────────┐  ┌──────────────────────────────────────────┐
│ AI Agents   │  │  Safety Layer                            │
│`ai/agents/` │  │  `safety/command-policy.ts`              │
│             │  │  `safety/classifier.ts`                  │
│ problem-    │  │  `safety/redaction.ts`                   │
│ analyzer    │  └──────────────────────────────────────────┘
│ problem-    │
│ solver      │
│ validator   │
│ activity-   │
│ log-gen     │
└──────┬──────┘
       │ generateObject (Zod structured output)
       ▼
┌─────────────────────────────────────────────────────────────┐
│  External Clients                                            │
├─────────────────────┬───────────────────────────────────────┤
│  Phoenix ERP        │  SSH Executor                         │
│  `phoenix/client.ts`│  `ssh/executor.ts`                    │
│  `phoenix/mock.ts`  │  `ssh/mock.ts`                        │
└─────────────────────┴───────────────────────────────────────┘
       │                         │
       ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Persistence (SQLite / JSONL fallback)                       │
│  `store/db.ts`  ·  `store/runs.ts`  ·  `store/audit.ts`     │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Event Bus → SSE Stream                                      │
│  `events/run-event-bus.ts`  ·  `events/sse.ts`              │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Hono app | Middleware, route mounting, global error handler | `backend/src/app.ts` |
| Entry point | Node server bootstrap (`serve(app)`) | `backend/src/index.ts` |
| Env parser | Zod-validated `process.env`; fails fast on missing vars | `backend/src/env.ts` |
| Ticket routes | Proxy Phoenix ticket list + detail; sort/filter | `backend/src/routes/tickets.ts` |
| Run routes | Create/get runs; advance state machine (`/next`); abort | `backend/src/routes/runs.ts` |
| Approval routes | Approve (with optional edit + safety re-check) / reject | `backend/src/routes/approvals.ts` |
| Activity routes | Draft and submit ERP activity | `backend/src/routes/activity.ts` |
| Events route | SSE stream of run events | `backend/src/routes/events.ts` |
| Orchestrator | State machine: owns transitions, approval gating, audit writes | `backend/src/ai/orchestrator.ts` |
| AI agents | Structured-output LLM roles (propose, diagnose, fix, validate, draft) | `backend/src/ai/agents/` |
| Safety layer | Deterministic blocklist + risk classification + secret redaction | `backend/src/safety/` |
| Phoenix client | Typed ERP wrapper with auth, retries, timeouts | `backend/src/phoenix/client.ts` |
| Phoenix mock | In-memory Phoenix for tests and offline demo | `backend/src/phoenix/mock.ts` |
| SSH executor | Run ONE approved command: timeout, output cap, exit code | `backend/src/ssh/executor.ts` |
| SSH mock | Scripted responses for tests and offline demo | `backend/src/ssh/mock.ts` |
| Store / audit | Append-only audit log; run lifecycle CRUD | `backend/src/store/` |
| Event bus | Per-run EventEmitter that fans out to SSE subscribers | `backend/src/events/run-event-bus.ts` |
| Frontend app | Technician workspace skeleton (to be built out) | `frontend/src/App.tsx` |

## Pattern Overview

**Overall:** Backend-first deterministic state machine with AI as bounded advisor roles

**Key Characteristics:**
- The state machine owns truth; the AI only proposes — it never executes
- Every SSH command passes the safety gate twice: at proposal and again after any human edit
- Agents are distinct prompts + Zod output schemas invoked by one orchestrator, not independent processes
- All agent output is structured (`generateObject` / `Output.object`) — never free-form when the backend must act on it
- The model tool `proposeSshCommand` has no `execute`; `executeApprovedCommand` is backend-only and never registered as a model tool

## Layers

**HTTP Layer:**
- Purpose: Accept requests, validate with Zod middleware, call orchestrator or store, return JSON
- Location: `backend/src/routes/`
- Contains: Hono route handlers, request/response schemas
- Depends on: orchestrator, store, phoenix client, safety layer
- Used by: frontend

**Orchestrator / State Machine:**
- Purpose: Drive run phases; sequence agent calls; gate on approvals; write audit events
- Location: `backend/src/ai/orchestrator.ts`
- Contains: State transition logic, agent dispatch, event bus emissions
- Depends on: AI agents, safety layer, store, event bus
- Used by: runs route, approvals route

**AI Agent Layer:**
- Purpose: LLM roles that propose commands, interpret output, draft prose — structured output only
- Location: `backend/src/ai/agents/`
- Contains: `problem-analyzer.ts`, `customer-system-analyzer.ts`, `problem-solver.ts`, `validator.ts`, `activity-log-generator.ts`
- Depends on: `ai/model.ts`, `ai/prompts.ts`, Vercel AI SDK
- Used by: orchestrator

**Safety Layer:**
- Purpose: Deterministic allow/block before any execution; risk classification; secret redaction
- Location: `backend/src/safety/`
- Contains: `command-policy.ts`, `classifier.ts`, `redaction.ts`, `risk-levels.ts`
- Depends on: nothing external (pure functions)
- Used by: orchestrator, approvals route

**External Client Layer:**
- Purpose: Typed wrappers over Phoenix ERP REST API and ssh2 SSH client
- Location: `backend/src/phoenix/`, `backend/src/ssh/`
- Contains: clients, mocks, Zod type definitions
- Depends on: `env.ts` for credentials/config
- Used by: orchestrator, AI tool implementations

**Persistence Layer:**
- Purpose: Append-only audit log; run lifecycle state; command approvals; observations
- Location: `backend/src/store/`
- Contains: `db.ts`, `schema.ts`, `runs.ts`, `audit.ts`
- Depends on: better-sqlite3 (or JSONL fallback)
- Used by: orchestrator, route handlers

**Event Bus / SSE:**
- Purpose: Fan out run events from orchestrator to SSE subscribers in real time
- Location: `backend/src/events/`
- Contains: `run-event-bus.ts` (per-run EventEmitter), `sse.ts` (Hono streamSSE wiring)
- Depends on: Hono `streamSSE`
- Used by: orchestrator (emit), events route (subscribe)

## Data Flow

### Primary Request Path — Advance Run (`/next`)

1. `POST /api/runs/:runId/next` received by Hono (`backend/src/routes/runs.ts`)
2. Route calls `orchestrator.advance(runId)` (`backend/src/ai/orchestrator.ts`)
3. Orchestrator reads run state from `store/runs.ts`, observations from `store/audit.ts`
4. Orchestrator calls appropriate AI agent (e.g. `ai/agents/problem-analyzer.ts`) via `generateObject`
5. Agent returns structured `DiagnosticProposal` (Zod-typed)
6. Orchestrator calls `safety/command-policy.ts` → `classifyCommandRisk` + `validateCommandAgainstPolicy`
7a. If blocked: writes `command.blocked` audit event; emits on event bus; returns `TRIAGING` state
7b. If allowed: writes `createPendingApproval` (PENDING); emits `command.proposed` + `approval.required`; returns `WAITING_FOR_APPROVAL`
8. Route returns `{ status, pendingApproval }` to frontend

### Approval → Execution Path

1. `POST /api/runs/:runId/approvals/:approvalId/approve` (`backend/src/routes/approvals.ts`)
2. Safety re-check on final command (original or edited) via `safety/command-policy.ts`
3. If re-check fails: writes `BLOCKED` audit event; returns 422
4. If passes: writes `APPROVED` audit event; emits `command.executing` on event bus
5. `ssh/executor.ts` runs the single approved command with timeout + output cap
6. Result returned; `safety/redaction.ts` runs on stdout/stderr before any write
7. `store/audit.ts` appends `command_result` + `observation` (redacted)
8. Event bus emits `command.completed` + `observation.added`
9. Route returns redacted result to frontend

### Activity Submission Path

1. `POST /api/runs/:runId/activity/submit` (`backend/src/routes/activity.ts`)
2. `ai/agents/activity-log-generator.ts` reads only `store/audit.ts` observations + command results — never raw secrets
3. Agent returns structured `ActivityDraft` (5 graded fields)
4. Route calls `phoenix/client.ts` → `createActivity(ticketId, fields)`
5. Optionally PATCHes ticket status to `DONE`
6. Emits `activity.submitted` on event bus

**State Management:**
- Run phases live in `store/runs.ts` (SQLite `runs` table, `current_phase` column)
- Phoenix ticket status (`OPEN`/`PENDING`/`DONE`) is updated only at submit time
- Per-run event subscriptions live in memory in `events/run-event-bus.ts`

## Key Abstractions

**DiagnosticProposal:**
- Purpose: Structured output from `problem-analyzer` agent — ranked hypotheses + one command
- Examples: `backend/src/ai/agents/problem-analyzer.ts`
- Pattern: Zod schema enforced via `generateObject`; includes `hypotheses[]`, `command`, `purpose`, `expectedSignal`, `riskNotes`, `isReadOnly`

**CommandApproval:**
- Purpose: The record of a proposed command, its human decision, and what actually ran
- Examples: `backend/src/store/schema.ts` (`command_approvals` table)
- Pattern: Stateful record — transitions PENDING → APPROVED/REJECTED/EXECUTED/BLOCKED

**RiskLevel:**
- Purpose: Classify every command before execution
- Examples: `backend/src/safety/risk-levels.ts`
- Pattern: Enum — `SAFE_READ_ONLY | LOW_RISK_CHANGE | MEDIUM_RISK_CHANGE | HIGH_RISK_BLOCKED`; determined deterministically, LLM may only raise (never lower) the level

**AuditEvent:**
- Purpose: Append-only record of every significant action — the source of truth for activities
- Examples: `backend/src/store/audit.ts`
- Pattern: Type matches SSE event type; `actor` field tags source (system/technician/agent/phoenix/ssh); payload is redacted before write

## Entry Points

**Backend server:**
- Location: `backend/src/index.ts`
- Triggers: `node src/index.ts` (via tsx in dev); Docker container start
- Responsibilities: Bootstrap Hono app, bind port, load env

**Frontend dev server:**
- Location: `frontend/src/main.tsx`
- Triggers: `vite --host 0.0.0.0 --port 5173`
- Responsibilities: Mount React app into `frontend/index.html`

**Docker Compose:**
- Location: `docker-compose.yml`
- Triggers: `docker compose up`
- Responsibilities: Start backend (port 8000) + frontend (port 5173); mount `./keys:/keys:ro`

## Incident-Run State Machine

States: `CREATED` → `LOADED_CONTEXT` → `TRIAGING` ↔ `WAITING_FOR_APPROVAL` → `EXECUTING_COMMAND` → `OBSERVING` → `PLANNING_FIX` → `VALIDATING` → `DRAFTING_ACTIVITY` → `WAITING_FOR_ACTIVITY_REVIEW` → `SUBMITTING_ACTIVITY` → `COMPLETED`

Terminal states: `COMPLETED`, `FAILED`, `ABORTED`

Owned entirely by `backend/src/ai/orchestrator.ts`. The AI does not own state transitions.

Max-steps guard: orchestrator caps total proposed commands per run (e.g. 12); on cap transitions to `WAITING_FOR_ACTIVITY_REVIEW` with partial findings rather than looping.

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. `better-sqlite3` is synchronous — keep DB calls short. SSH and Phoenix calls are async/await.
- **Global state:** Per-run EventEmitter instances in `events/run-event-bus.ts` are module-level singletons. Run state is in SQLite, not in-process memory (survives restart).
- **Secret handling:** SSH private key is read from the `/keys` mount path (never inlined, never logged). Phoenix token is read from env via `env.ts`. Redaction runs before any string reaches the audit log, UI, or model.
- **No backend auth:** Single-team local tool. The Phoenix token is the only secret and it stays server-side.
- **CORS:** Open (`*`) for local dev — appropriate for a single-machine tool with no cookies.
- **Circular imports:** Avoid importing from `routes/` inside `ai/` or `safety/`. Dependency direction: routes → orchestrator → agents/safety/store/clients.

## Anti-Patterns

### Registering `executeApprovedCommand` as a model tool

**What happens:** SSH execution is exposed as a callable tool in the AI SDK tool registry.
**Why it's wrong:** The model gains a path to direct execution, bypassing the human approval gate and safety re-check. This is a hard-fail safety violation.
**Do this instead:** Keep `executeApprovedCommand` in `backend/src/ssh/executor.ts` as a plain async function called only from `backend/src/routes/approvals.ts` after the safety gate passes.

### Writing un-redacted output to audit or returning it to the UI

**What happens:** Raw stdout/stderr from SSH is written to `store/audit.ts` or returned in the API response before running through `safety/redaction.ts`.
**Why it's wrong:** Secrets (tokens, passwords, private key material) appear in the audit log, UI, and potentially in the model's context on the next turn.
**Do this instead:** Always call `redactSecrets(stdout)` and `redactSecrets(stderr)` immediately after the SSH result is received, before any write or response — as shown in the approval flow in `backend/src/routes/approvals.ts`.

### Hardcoding incident-specific commands or conditions

**What happens:** Agent prompts or orchestrator logic contains branches keyed to specific ticket IDs, hostnames, or symptom strings from the practice VMs.
**Why it's wrong:** Grading uses fresh hidden VMs. Hardcoded assumptions will fail and may trigger the generalisation tie-breaker penalty.
**Do this instead:** Keep all diagnostic logic in `ai/agents/problem-analyzer.ts` prompts — generalise from ticket symptom + observations only.

## Error Handling

**Strategy:** Fail fast with typed errors at each boundary; degrade gracefully on non-critical paths; never default to an unsafe action.

**Patterns:**
- `env.ts` throws on startup if required vars are missing — no silent misconfiguration
- Phoenix client maps HTTP 401/404/422 to typed errors surfaced as clean UI states; retries once on 5xx/network, never on 4xx
- SSH executor sets connect timeout and per-command timeout; kills channel on overrun; caps stdout/stderr length
- AI calls wrapped with timeout + single retry; model failure degrades to "agent unavailable, propose manually" — never to an unsafe default
- Hono `app.onError` in `backend/src/app.ts` catches unhandled route errors and returns structured JSON

## Cross-Cutting Concerns

**Logging:** Structured audit events via `store/audit.ts` — these are the official record. Console logging for dev/debug only.
**Validation:** Zod schemas at every boundary — env vars (`env.ts`), request bodies (Hono `@hono/zod-validator`), AI agent outputs (`generateObject`), Phoenix response types (`phoenix/types.ts`).
**Redaction:** `safety/redaction.ts` is a pure function run on every string before write to audit, return to UI, or feed back to model. Patterns cover env-var-shaped secrets, private keys, `password=`/`token=`/`Authorization:` values, connection strings.
**Safety gate:** Always two passes — once at proposal (orchestrator), once after any human edit (approvals route). Deterministic policy runs first; LLM classifier can only raise risk level, never lower it.

---

*Architecture analysis: 2026-06-06*
