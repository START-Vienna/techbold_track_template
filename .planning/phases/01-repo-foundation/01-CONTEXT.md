# Phase 1: Repo Foundation - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the backend from the dead Python/FastAPI skeleton to the locked Node 22 + Hono + TypeScript stack, establish Zod-validated fail-fast env config, and stand up the mock-mode seam that every later phase plugs into. This phase ships infrastructure only — no Phoenix, SSH, or agent features. It delivers: `docker compose up` serving `GET /health`, a fail-fast env parser, the per-service mock toggle pattern, a pnpm workspace, and committed `.env.example` with placeholders.

Covers requirements PLAT-01, PLAT-02, PLAT-03, PLAT-04 (TASKS P0-1, P0-2).

</domain>

<decisions>
## Implementation Decisions

### Mock-Mode Seam
- **D-01:** Mock toggle is **per-service flags with a master override**. `MOCK_MODE=true` forces all services to mock; per-service flags (`MOCK_PHOENIX`, `MOCK_SSH`, `MOCK_LLM`) override individually when the master is off. This lets later phases (Phoenix=2, SSH=4, LLM=5) go real one at a time while the rest stay mocked — critical for demo resilience on flaky Wi-Fi.
- **D-02:** Phase 1 builds the **seam + health stub only** — not full mock clients (no real services exist yet). Concretely: a client-resolution pattern (`registerClient`/`resolveClient` or equivalent `selectX()` resolver) that honors the per-service flags, plus `GET /health → { status: 'ok', mode: 'mock' | 'real' }` proving the toggle is wired. Later phases register their real+mock implementations into this seam.

### Repo Layout & Tooling
- **D-03:** **pnpm workspace at repo root.** `pnpm-workspace.yaml` lists `backend` and `frontend` as packages; `pnpm install` / `pnpm test` run from root. Resolves the lockfile conflict by **deleting `frontend/package-lock.json`** (npm) in favor of pnpm — pnpm is locked by ARCHITECTURE.md §1.
- **D-04:** Backend runs in Docker via **`tsx` directly, no build step**. `node:22-slim` base, `corepack enable` for pnpm, `pnpm tsx src/index.ts` as the command. Matches the zero-build dev model from ARCHITECTURE.md §1 and keeps the container simple under time pressure.

### Claude's Discretion
- Exact filenames and internal API of the client-resolution seam (`registerClient`/`resolveClient` vs a typed `resolveClient('phoenix')` factory) — planner/executor choose, as long as it honors D-01's flag precedence.
- Zod env schema field-by-field shape, beyond the required keys named in TASKS P0-2 (LLM/SSH/Phoenix/MOCK_MODE) and the fail-fast-on-missing behavior from ARCHITECTURE.md §10.
- Whether the workspace uses a root `tsconfig.json` base with per-package extends, or standalone configs.
- `.dockerignore` contents and whether frontend keeps its own Dockerfile or joins a shared build.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack, Layout & Config (primary for this phase)
- `docs/ARCHITECTURE.md` §1 — locked stack decision (Node 22 + pnpm + tsx, Hono, Zod, SSE, SQLite). Non-negotiable.
- `docs/ARCHITECTURE.md` §2 — exact `backend/src/` folder structure to scaffold (routes/, phoenix/, ssh/, ai/, safety/, store/, events/, tests/).
- `docs/ARCHITECTURE.md` §10 — config rules: `env.ts` parses `process.env` through Zod, fails fast with a readable message; secrets only from env; SSH key read from `/keys` mount, never inlined or logged. CORS open (`*`) for local dev.
- `docs/TASKS.md` P0-1, P0-2 — acceptance criteria for repo migration and env config.

### Product & Scope Guardrails
- `docs/PRD.md` — product scope, API contract, scoring; the authority on what ships.
- `.planning/REQUIREMENTS.md` — PLAT-01..04 acceptance wording (rubric E mapping).

### Downstream Seams (read for awareness, built in later phases)
- `docs/SAFETY_POLICY.md` — informs nothing built in Phase 1, but the safety/ folder is scaffolded here.
- `docs/phoenix-openapi.yaml` — Phoenix types land in Phase 2; the phoenix/ folder seam is created here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml` — keep the two-service layout (backend:8000, frontend:5173), `./keys:/keys:ro` mount, `host.docker.internal` extra_host, and `env_file required:false` so the stack starts without `.env`. Only the backend build target changes.
- `frontend/` — React 18 + Vite 5 app is the surviving stack; keep it. Its `package.json` scripts (`dev`/`build`/`preview` on host 0.0.0.0 port 5173) stay. Only the lockfile changes (npm → pnpm).
- `.gitignore` — already ignores `.env`, `keys/*` (except `.gitkeep`), `*.pem`, `*.key`, `node_modules/`, `frontend/dist/`, `*.tsbuildinfo`. Node section present. No change likely needed.
- `keys/.gitkeep` — keeps the git-ignored keys mount directory tracked.

### Established Patterns
- `VITE_API_BASE` env var is how the frontend finds the backend (`http://localhost:8000` in compose). Preserve.
- Codebase maps (`.planning/codebase/STACK.md` etc.) still describe the Python skeleton — they are stale post-migration and should be regenerated after this phase, not trusted during it.

### Integration Points
- The mock seam (D-01/D-02) is the contract Phase 2 (Phoenix), Phase 4 (SSH), and Phase 5 (LLM) register into. Get the flag precedence right here.
- `env.ts` is imported by nearly everything downstream — its Zod schema is the single source of config truth.

### To Be Replaced / Removed
- `backend/app/` (FastAPI `main.py`, `__init__.py`), `backend/requirements.txt`, `backend/Dockerfile` (python:3.11-slim) — all superseded by the Node stack.
- `frontend/package-lock.json` — deleted in favor of pnpm workspace (D-03).

</code_context>

<specifics>
## Specific Ideas

- Health endpoint should report mode: `GET /health → { status: 'ok', mode: 'mock' | 'real' }` — makes the mock toggle visible and demoable from turn one (D-02).
- Mock flag precedence is explicit: master `MOCK_MODE=true` wins (forces all on); when false, each `MOCK_<SERVICE>` flag decides independently (D-01).
- Dockerfile shape is settled (D-04): `FROM node:22-slim`, `corepack enable`, `pnpm install`, `CMD ["pnpm","tsx","src/index.ts"]`.

</specifics>

<deferred>
## Deferred Ideas

- Real Phoenix/SSH/LLM mock client implementations — built in their own phases (2/4/5); Phase 1 only builds the seam they plug into.
- Regenerating the stale `.planning/codebase/*.md` maps to reflect the Node stack — a docs/housekeeping task, not Phase 1 scope.
- Drizzle ORM over raw better-sqlite3 — TASKS P2-6, only if raw SQLite becomes painful.

None of these block Phase 1.

</deferred>

---

*Phase: 01-repo-foundation*
*Context gathered: 2026-06-06*
