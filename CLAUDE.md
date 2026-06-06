<!-- GSD:project-start source:PROJECT.md -->

## Project

**Service Desk Autopilot**

A technician-controlled AI troubleshooting copilot for the techbold START Hack Vienna '26 track. It loads a service ticket and its SSH target from the Phoenix ERP, an AI proposes **one diagnostic command at a time** (with ranked root-cause hypotheses and evidence), and the technician approves, edits, or rejects every command. The backend runs only approved commands through a safety layer, observes output, iterates to a root cause, proposes a minimal reversible fix, validates it, then drafts a complete ERP activity report built **only from the audit trail** for the technician to edit and submit. The AI never acts on its own.

For: service-desk technicians (primary driver) and hackathon judges (decisive evaluators who watch a live demo and read the repo + audit log + ERP activities).

**Core Value:** Win the scoring rubric. 55 of 100 points are **B (troubleshooting, 35) + C (safety & audit, 20)** — the entire product is shaped around solving hidden Linux-service incidents on fresh VMs, safely and auditably. A polished UI alone does not win.

### Constraints

- **Tech stack:** Node 22 + Hono + TypeScript (backend), React 18 + Vite (frontend), Vercel AI SDK v5, ssh2, better-sqlite3 (JSONL fallback), Zod everywhere — fixed by `docs/ARCHITECTURE.md`. (Note: codebase `STACK.md` says Python/FastAPI; that's a stale dead skeleton, superseded by the Node decision.)
- **Timeline:** code freeze Sun Jun 7 14:00; build the P0 vertical slice in mock mode first, then make it real.
- **Safety (hard-fail):** the model NEVER executes SSH — it proposes; a deterministic backend executes after human approval and a safety re-check. Blocklisted commands or leaked secrets zero the incident and cost further points.
- **Security:** Phoenix token + SSH key stay server-side, never in the browser. Redaction runs on every string before it reaches audit, UI, or model. `.env`/`keys/` git-ignored.
- **Generalisation:** no incident-specific branches keyed to ticket IDs, hostnames, or symptom strings — grading uses fresh VMs and penalises hardcoding.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Python 3.11 - Backend (`backend/`)
- TypeScript 5.6 - Frontend (`frontend/src/`)
- HTML - Entry point (`frontend/index.html`)
- CSS - Styles (`frontend/src/index.css`)

## Runtime

- Python 3.11 (slim Docker image — `backend/Dockerfile`)
- Node 20 (slim Docker image — `frontend/Dockerfile`)
- Backend: pip (via `backend/requirements.txt`) — no lockfile
- Frontend: npm — lockfile present (`frontend/package-lock.json`)

## Frameworks

- FastAPI 0.115.6 — HTTP API server (`backend/app/main.py`)
- Uvicorn 0.34.0 (standard extras) — ASGI server, run command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Pydantic-settings 2.7.1 — environment/config management
- React 18.3.1 — UI framework (`frontend/src/App.tsx`, `frontend/src/main.tsx`)
- Vite 5.4.11 — dev server and build tool (`frontend/vite.config.ts`)
- `@vitejs/plugin-react` 4.3.4 — Vite plugin for React/JSX transform
- TypeScript compiler (`tsc`) — type-check step before production build

## Key Dependencies

- `fastapi==0.115.6` — entire HTTP layer
- `uvicorn[standard]==0.34.0` — production-ready ASGI server with websocket/http2 extras
- `pydantic-settings==2.7.1` — typed settings from env vars
- `httpx` — calling the Phoenix ERP REST API
- `paramiko` — SSH to customer VMs
- `openai` — Azure OpenAI integration
- `react@^18.3.1` + `react-dom@^18.3.1` — core UI

## Configuration

- Backend reads settings via pydantic-settings (env vars / `.env` file)
- `.env.example` present at repo root — copy to `.env` for local dev
- Docker Compose loads `.env` with `required: false` so the stack starts without it
- Frontend reads `VITE_API_BASE` at build/dev time (set to `http://localhost:8000` in `docker-compose.yml`)
- `frontend/tsconfig.json` — TypeScript config (target ES2020, strict mode, bundler module resolution)
- `frontend/vite.config.ts` — Vite config (React plugin, host `0.0.0.0`, port 5173)

## Platform Requirements

- Docker + Docker Compose (primary dev environment)
- Backend: port 8000, Frontend: port 5173
- SSH private key(s) as `.pem` files placed in `./keys/` (git-ignored, mounted read-only into backend container)
- Containerised deployment via Docker Compose
- Backend exposed on port 8000, Frontend on port 5173
- No production-specific build config detected beyond the Dockerfiles

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Project Context

## Naming Patterns

- React components: PascalCase, `.tsx` extension — `App.tsx`
- Entry points: lowercase — `main.tsx`, `main.py`
- CSS: lowercase, matches component or scope — `index.css`
- Config files: lowercase with dots — `vite.config.ts`, `tsconfig.json`
- Python modules: lowercase with underscores — `__init__.py`, `main.py`
- Components: PascalCase default exports — `export default function App()`
- Route handlers (FastAPI): snake_case — `def health()`
- TypeScript: camelCase for variables and props
- Python: snake_case throughout
- TypeScript interfaces and types: PascalCase (no `I` prefix)

## Code Style

- No Prettier config present — no enforced formatter in place
- TypeScript strict mode enabled in `tsconfig.json`
- `noUnusedLocals` and `noUnusedParameters` disabled (intentional for skeleton)
- No ruff or black config present — no enforced formatter in place
- Python docstrings: module-level docstrings used to describe intent; function docstrings omitted on trivial/obvious functions
- No ESLint, Biome, or oxlint config present
- No ruff config present
- Teams adopting this template should add Biome (frontend) and ruff (backend)

## Import Organization

- None configured — imports use relative paths (`./App`)

## Component Design

- Single default export per file
- Functional components only (no class components)
- Inline styles used in skeleton (`style={{ ... }}`) — teams should move to CSS classes

## FastAPI Route Design

- Route functions are plain `def` (sync) for simple handlers; use `async def` when doing I/O
- Return plain dicts for JSON responses — no explicit `JSONResponse` wrapping for simple cases
- Group related routes together; the skeleton suggests logical groupings via comments

## Error Handling

- No error handling patterns established in skeleton
- Teams should implement React error boundaries for component trees
- API call errors should be surfaced to the UI, not silently swallowed
- FastAPI's built-in exception handling is in place via the framework
- Use FastAPI `HTTPException` for expected error conditions
- Do not use bare `except:` or `except Exception: pass`

## Environment Configuration

- Environment variables via Vite: `import.meta.env.VITE_API_BASE`
- All public vars prefixed with `VITE_`
- Default fallback documented in comments: `http://localhost:8000`
- `pydantic-settings` is in `requirements.txt` — use `BaseSettings` for config, not `os.getenv` directly

## Security Constraints (from skeleton comments)

- ERP token and SSH keys must stay on the backend — never passed to the browser
- CORS is open (`allow_origins=["*"]`) for local dev only — restrict in production

## Comments

- Module-level docstrings to describe purpose and intent (Python)
- Inline comments only for non-obvious constraints or workarounds
- The skeleton uses comments to guide implementers — remove scaffolding comments as code is written
- Leave `# TODO` in commits — implement or file an issue
- Add section-header banners
- Restate what the code does

## CSS

- Minimal global reset only — `box-sizing: border-box`, bare `body` styles
- Component-specific styles go in component files or dedicated CSS modules
- No CSS framework configured

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- The state machine owns truth; the AI only proposes — it never executes
- Every SSH command passes the safety gate twice: at proposal and again after any human edit
- Agents are distinct prompts + Zod output schemas invoked by one orchestrator, not independent processes
- All agent output is structured (`generateObject` / `Output.object`) — never free-form when the backend must act on it
- The model tool `proposeSshCommand` has no `execute`; `executeApprovedCommand` is backend-only and never registered as a model tool

## Layers

- Purpose: Accept requests, validate with Zod middleware, call orchestrator or store, return JSON
- Location: `backend/src/routes/`
- Contains: Hono route handlers, request/response schemas
- Depends on: orchestrator, store, phoenix client, safety layer
- Used by: frontend
- Purpose: Drive run phases; sequence agent calls; gate on approvals; write audit events
- Location: `backend/src/ai/orchestrator.ts`
- Contains: State transition logic, agent dispatch, event bus emissions
- Depends on: AI agents, safety layer, store, event bus
- Used by: runs route, approvals route
- Purpose: LLM roles that propose commands, interpret output, draft prose — structured output only
- Location: `backend/src/ai/agents/`
- Contains: `problem-analyzer.ts`, `customer-system-analyzer.ts`, `problem-solver.ts`, `validator.ts`, `activity-log-generator.ts`
- Depends on: `ai/model.ts`, `ai/prompts.ts`, Vercel AI SDK
- Used by: orchestrator
- Purpose: Deterministic allow/block before any execution; risk classification; secret redaction
- Location: `backend/src/safety/`
- Contains: `command-policy.ts`, `classifier.ts`, `redaction.ts`, `risk-levels.ts`
- Depends on: nothing external (pure functions)
- Used by: orchestrator, approvals route
- Purpose: Typed wrappers over Phoenix ERP REST API and ssh2 SSH client
- Location: `backend/src/phoenix/`, `backend/src/ssh/`
- Contains: clients, mocks, Zod type definitions
- Depends on: `env.ts` for credentials/config
- Used by: orchestrator, AI tool implementations
- Purpose: Append-only audit log; run lifecycle state; command approvals; observations
- Location: `backend/src/store/`
- Contains: `db.ts`, `schema.ts`, `runs.ts`, `audit.ts`
- Depends on: better-sqlite3 (or JSONL fallback)
- Used by: orchestrator, route handlers
- Purpose: Fan out run events from orchestrator to SSE subscribers in real time
- Location: `backend/src/events/`
- Contains: `run-event-bus.ts` (per-run EventEmitter), `sse.ts` (Hono streamSSE wiring)
- Depends on: Hono `streamSSE`
- Used by: orchestrator (emit), events route (subscribe)

## Data Flow

### Primary Request Path — Advance Run (`/next`)

### Approval → Execution Path

### Activity Submission Path

- Run phases live in `store/runs.ts` (SQLite `runs` table, `current_phase` column)
- Phoenix ticket status (`OPEN`/`PENDING`/`DONE`) is updated only at submit time
- Per-run event subscriptions live in memory in `events/run-event-bus.ts`

## Key Abstractions

- Purpose: Structured output from `problem-analyzer` agent — ranked hypotheses + one command
- Examples: `backend/src/ai/agents/problem-analyzer.ts`
- Pattern: Zod schema enforced via `generateObject`; includes `hypotheses[]`, `command`, `purpose`, `expectedSignal`, `riskNotes`, `isReadOnly`
- Purpose: The record of a proposed command, its human decision, and what actually ran
- Examples: `backend/src/store/schema.ts` (`command_approvals` table)
- Pattern: Stateful record — transitions PENDING → APPROVED/REJECTED/EXECUTED/BLOCKED
- Purpose: Classify every command before execution
- Examples: `backend/src/safety/risk-levels.ts`
- Pattern: Enum — `SAFE_READ_ONLY | LOW_RISK_CHANGE | MEDIUM_RISK_CHANGE | HIGH_RISK_BLOCKED`; determined deterministically, LLM may only raise (never lower) the level
- Purpose: Append-only record of every significant action — the source of truth for activities
- Examples: `backend/src/store/audit.ts`
- Pattern: Type matches SSE event type; `actor` field tags source (system/technician/agent/phoenix/ssh); payload is redacted before write

## Entry Points

- Location: `backend/src/index.ts`
- Triggers: `node src/index.ts` (via tsx in dev); Docker container start
- Responsibilities: Bootstrap Hono app, bind port, load env
- Location: `frontend/src/main.tsx`
- Triggers: `vite --host 0.0.0.0 --port 5173`
- Responsibilities: Mount React app into `frontend/index.html`
- Location: `docker-compose.yml`
- Triggers: `docker compose up`
- Responsibilities: Start backend (port 8000) + frontend (port 5173); mount `./keys:/keys:ro`

## Incident-Run State Machine

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. `better-sqlite3` is synchronous — keep DB calls short. SSH and Phoenix calls are async/await.
- **Global state:** Per-run EventEmitter instances in `events/run-event-bus.ts` are module-level singletons. Run state is in SQLite, not in-process memory (survives restart).
- **Secret handling:** SSH private key is read from the `/keys` mount path (never inlined, never logged). Phoenix token is read from env via `env.ts`. Redaction runs before any string reaches the audit log, UI, or model.
- **No backend auth:** Single-team local tool. The Phoenix token is the only secret and it stays server-side.
- **CORS:** Open (`*`) for local dev — appropriate for a single-machine tool with no cookies.
- **Circular imports:** Avoid importing from `routes/` inside `ai/` or `safety/`. Dependency direction: routes → orchestrator → agents/safety/store/clients.

## Anti-Patterns

### Registering `executeApprovedCommand` as a model tool

### Writing un-redacted output to audit or returning it to the UI

### Hardcoding incident-specific commands or conditions

## Error Handling

- `env.ts` throws on startup if required vars are missing — no silent misconfiguration
- Phoenix client maps HTTP 401/404/422 to typed errors surfaced as clean UI states; retries once on 5xx/network, never on 4xx
- SSH executor sets connect timeout and per-command timeout; kills channel on overrun; caps stdout/stderr length
- AI calls wrapped with timeout + single retry; model failure degrades to "agent unavailable, propose manually" — never to an unsafe default
- Hono `app.onError` in `backend/src/app.ts` catches unhandled route errors and returns structured JSON

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
