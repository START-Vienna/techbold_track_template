# Codebase Structure

**Analysis Date:** 2026-06-06

## Directory Layout

```
techbold_track_template/
├── backend/                  # Node 22 + Hono API server (to be built)
│   ├── Dockerfile
│   ├── requirements.txt      # Python skeleton deps (superseded by Node stack per ARCHITECTURE.md)
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py           # FastAPI skeleton — replaced by Node/Hono implementation
│   └── src/                  # Target layout (not yet created — see below)
│       ├── index.ts          # Server bootstrap
│       ├── env.ts            # Zod-validated env
│       ├── app.ts            # Hono app + middleware + routes + onError
│       ├── routes/
│       │   ├── health.ts
│       │   ├── tickets.ts
│       │   ├── runs.ts
│       │   ├── approvals.ts
│       │   ├── activity.ts
│       │   └── events.ts
│       ├── phoenix/
│       │   ├── client.ts
│       │   ├── mock.ts
│       │   └── types.ts
│       ├── ssh/
│       │   ├── client.ts
│       │   ├── executor.ts
│       │   ├── mock.ts
│       │   └── types.ts
│       ├── ai/
│       │   ├── model.ts
│       │   ├── prompts.ts
│       │   ├── orchestrator.ts
│       │   ├── agents/
│       │   │   ├── problem-analyzer.ts
│       │   │   ├── customer-system-analyzer.ts
│       │   │   ├── problem-solver.ts
│       │   │   ├── validator.ts
│       │   │   └── activity-log-generator.ts
│       │   └── tools/
│       │       ├── phoenix-tools.ts
│       │       ├── ssh-tools.ts
│       │       ├── audit-tools.ts
│       │       └── safety-tools.ts
│       ├── safety/
│       │   ├── command-policy.ts
│       │   ├── classifier.ts
│       │   ├── redaction.ts
│       │   └── risk-levels.ts
│       ├── store/
│       │   ├── db.ts
│       │   ├── schema.ts
│       │   ├── runs.ts
│       │   └── audit.ts
│       ├── events/
│       │   ├── run-event-bus.ts
│       │   └── sse.ts
│       └── tests/
│           ├── safety.test.ts
│           ├── phoenix-client.test.ts
│           └── orchestrator.test.ts
├── frontend/                 # React 18 + Vite + TypeScript
│   ├── Dockerfile
│   ├── index.html            # Vite entry HTML
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx          # React root mount
│       ├── App.tsx           # Skeleton app component (to be built out)
│       └── index.css
├── docs/                     # Project documentation
│   ├── ARCHITECTURE.md       # Authoritative architecture + stack decisions
│   ├── PRD.md                # Product requirements + API contract
│   ├── SAFETY_POLICY.md      # Safety rules + blocklist
│   ├── TASKS.md              # Hackathon task breakdown
│   ├── IMPLEMENTATION_PROCEDURE.md
│   ├── scoring.md            # Rubric (100 pts)
│   └── phoenix-openapi.yaml  # Phoenix ERP OpenAPI spec
├── keys/                     # SSH private keys (git-ignored, mounted read-only in Docker)
│   └── .gitkeep
├── .claude/
│   └── settings.local.json
├── .planning/
│   └── codebase/             # GSD codebase map documents
├── docker-compose.yml        # Backend (8000) + Frontend (5173) + keys mount
├── .env.example              # Required env var template (no secrets)
├── .gitignore
├── README.md
└── LICENSE
```

## Directory Purposes

**`backend/src/routes/`:**
- Purpose: Hono route handlers — one file per resource group
- Contains: Request validation (Zod), orchestrator/store calls, JSON responses
- Key files: `runs.ts` (state machine advancement), `approvals.ts` (approve/reject + safety re-check), `events.ts` (SSE stream)

**`backend/src/ai/agents/`:**
- Purpose: One file per LLM role; each exports a single async function returning a typed Zod object
- Contains: System prompt, output schema, `generateObject` call
- Key files: `problem-analyzer.ts` (ranked hypotheses + next command), `activity-log-generator.ts` (5 graded ERP fields)

**`backend/src/ai/tools/`:**
- Purpose: AI SDK tool definitions callable by agents
- Contains: Tool input schemas, execute stubs or proposal-recording logic
- Key constraint: `ssh-tools.ts` exports `proposeSshCommand` (no execute); `executeApprovedCommand` lives in `ssh/executor.ts` and is never registered as a model tool

**`backend/src/safety/`:**
- Purpose: Pure functions for command risk classification, policy enforcement, and secret redaction
- Contains: Deterministic blocklist, risk enum, redaction regex patterns
- Key files: `command-policy.ts` (the gate), `redaction.ts` (must run before any string reaches audit/UI/model)

**`backend/src/store/`:**
- Purpose: SQLite persistence (better-sqlite3) with JSONL fallback option
- Contains: DB init, table schemas as Zod types, CRUD for runs and append-only audit events
- Key files: `audit.ts` (append-only — never delete), `schema.ts` (canonical data shapes)

**`backend/src/phoenix/`:**
- Purpose: Typed wrapper over Phoenix ERP REST API + in-memory mock for offline dev and tests
- Contains: `client.ts` (fetch with AbortController timeout + bounded retry), `mock.ts`, `types.ts` (Zod from phoenix-openapi.yaml)

**`backend/src/ssh/`:**
- Purpose: ssh2-based single-command executor + scripted mock
- Contains: `executor.ts` (one command, timeout, output cap, exit code), `client.ts` (key-auth connection), `mock.ts`

**`backend/src/events/`:**
- Purpose: Real-time run event delivery from orchestrator to frontend SSE subscribers
- Contains: Per-run EventEmitter (`run-event-bus.ts`), Hono `streamSSE` wiring (`sse.ts`)

**`backend/src/tests/`:**
- Purpose: Vitest test suites for the three critical modules
- Contains: `safety.test.ts` (blocklist, redaction), `phoenix-client.test.ts` (mocked fetch), `orchestrator.test.ts` (mocked SSH + model, happy + reject paths)

**`docs/`:**
- Purpose: Authoritative design documents — read before implementing any module
- Key files: `ARCHITECTURE.md` (stack decisions, folder structure contract), `PRD.md` (API contract + request/response examples), `phoenix-openapi.yaml` (ERP types), `scoring.md` (rubric)

**`keys/`:**
- Purpose: SSH private key storage — git-ignored, mounted read-only into backend container at `/keys`
- Generated: No (placed manually)
- Committed: No (`.gitignore` covers `keys/*.pem`)

## Key File Locations

**Entry Points:**
- `backend/src/index.ts`: Node server bootstrap — `serve(app)` on port from env
- `frontend/src/main.tsx`: React root mount into `frontend/index.html`
- `docker-compose.yml`: Compose entry — starts both services with env and keys mount

**Configuration:**
- `backend/src/env.ts`: Single source of truth for all env vars — Zod-parsed, fails fast
- `frontend/vite.config.ts`: Vite + React plugin config
- `frontend/tsconfig.json`: TypeScript config for frontend
- `.env.example`: Template for required env vars (copy to `.env`, never commit `.env`)

**Core Logic:**
- `backend/src/ai/orchestrator.ts`: State machine — the central coordinator
- `backend/src/safety/command-policy.ts`: Safety gate — deterministic allow/block
- `backend/src/safety/redaction.ts`: Secret redaction — must run before any write
- `backend/src/store/audit.ts`: Append-only audit log — source of truth for activities
- `backend/src/phoenix/client.ts`: ERP integration — the three scored endpoints

**Testing:**
- `backend/src/tests/safety.test.ts`: Safety policy unit tests
- `backend/src/tests/phoenix-client.test.ts`: Phoenix client with mocked fetch
- `backend/src/tests/orchestrator.test.ts`: Full happy + reject path with mocked SSH + model

**Reference:**
- `docs/phoenix-openapi.yaml`: Phoenix ERP OpenAPI spec — derive all `phoenix/types.ts` Zod schemas from this
- `docs/scoring.md`: Rubric — consult when prioritising what to build

## Naming Conventions

**Files:**
- `kebab-case.ts` for all TypeScript source files: `problem-analyzer.ts`, `run-event-bus.ts`, `command-policy.ts`
- `UPPERCASE.md` for documentation: `ARCHITECTURE.md`, `PRD.md`, `SAFETY_POLICY.md`
- Test files co-located under `src/tests/` with `.test.ts` suffix: `safety.test.ts`

**Directories:**
- `lowercase/` or `kebab-case/` for all source directories: `routes/`, `ai/`, `ssh/`, `phoenix/`

**TypeScript:**
- Zod schemas: `PascalCase` for schema variable names matching their type: `DiagnosticProposal`, `CommandApproval`
- Route handler functions: named exports matching HTTP method + resource: `getTickets`, `postRun`
- Agent functions: named exports matching their brief vocabulary: `problemAnalyzer`, `activityLogGenerator`
- Risk levels: `SCREAMING_SNAKE_CASE` enum values: `SAFE_READ_ONLY`, `HIGH_RISK_BLOCKED`

## Where to Add New Code

**New API endpoint:**
- Route handler: `backend/src/routes/<resource>.ts`
- Mount in: `backend/src/app.ts` via `app.route('/api/<resource>', <resource>Router)`
- Request/response types: inline Zod schemas in the route file

**New AI agent role:**
- Implementation: `backend/src/ai/agents/<role-name>.ts`
- Output schema: define Zod schema in the same file, export the type
- Registration: import and call from `backend/src/ai/orchestrator.ts` in the relevant state handler

**New AI tool:**
- Implementation: `backend/src/ai/tools/<domain>-tools.ts`
- Constraint: if the tool involves SSH execution, it must only record a proposal — never call `ssh/executor.ts` directly

**New safety rule:**
- Blocklist entry: `backend/src/safety/command-policy.ts`
- New risk pattern: `backend/src/safety/classifier.ts`
- Redaction pattern: `backend/src/safety/redaction.ts`
- Tests: `backend/src/tests/safety.test.ts`

**New Phoenix ERP wrapper:**
- Client method: `backend/src/phoenix/client.ts`
- Corresponding mock method: `backend/src/phoenix/mock.ts`
- Zod type: `backend/src/phoenix/types.ts` (derive from `docs/phoenix-openapi.yaml`)

**New frontend view/component:**
- Component: `frontend/src/` — flat for now; introduce subdirectories (`components/`, `pages/`) when count exceeds ~5 files
- API calls: use `import.meta.env.VITE_API_BASE` as the base URL

**New store query:**
- Add to the relevant store file: `backend/src/store/runs.ts` (run lifecycle) or `backend/src/store/audit.ts` (audit/observations)
- Schema changes: `backend/src/store/schema.ts`

**Utilities / shared helpers:**
- Backend: no `utils/` directory yet — keep helpers co-located with their domain module
- Shared Zod types used across routes + agents: `backend/src/store/schema.ts` or the relevant domain `types.ts`

## Special Directories

**`keys/`:**
- Purpose: SSH private key file(s) — e.g. `keys/id_rsa` or `keys/<vm>.pem`
- Generated: No — placed manually before running
- Committed: No — covered by `.gitignore`
- Docker: mounted read-only at `/keys` inside the backend container; path read via `env.ts`

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents (this file and ARCHITECTURE.md)
- Generated: Yes — by `/gsd-map-codebase`
- Committed: Yes

**`docs/`:**
- Purpose: Authoritative design and planning documents — not generated, hand-written
- Committed: Yes — judges read the repo

---

*Structure analysis: 2026-06-06*
