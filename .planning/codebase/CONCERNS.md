# Codebase Concerns

**Analysis Date:** 2026-06-06

## Tech Debt

**Backend is entirely unimplemented (Python skeleton, wrong language):**
- Issue: `backend/app/main.py` is a FastAPI skeleton with a single `/health` route and a TODO comment. The architecture decision (documented in `docs/ARCHITECTURE.md` §1) explicitly rejects FastAPI in favor of Node 22 + Hono + TypeScript. The entire backend — Phoenix client, SSH executor, safety layer, orchestrator, store, SSE events — is unwritten.
- Files: `backend/app/main.py`, `backend/requirements.txt`, `backend/Dockerfile`
- Impact: Zero scoring rubric points can be earned until P0-1 (repo migration to TS/Hono) is complete. All P0 tasks depend on it.
- Fix approach: Execute `docs/TASKS.md` P0-1 — replace Python backend with Node 22 + Hono; keep Docker layout and `./keys` mount.

**Frontend is a placeholder only:**
- Issue: `frontend/src/App.tsx` renders a static heading and two lines of text. No routing, no API calls, no ticket list, no run page, no approval card, no SSE consumer.
- Files: `frontend/src/App.tsx`
- Impact: Rubric D (10 pts) and the live demo are entirely blocked. Rubric A points (ticket list, sort/filter, detail view) are unreachable from the frontend.
- Fix approach: Implement per `docs/TASKS.md` P0-15 after backend routes exist.

**`requirements.txt` lists packages for a stack that will be replaced:**
- Issue: `backend/requirements.txt` pins `fastapi`, `uvicorn`, `pydantic-settings`. These will be discarded during P0-1. The actual Node dependencies (`hono`, `better-sqlite3`, `ssh2`, `ai`, `zod`, etc.) have not been declared anywhere yet.
- Files: `backend/requirements.txt`
- Impact: Low — these packages are harmless until removed, but `package.json` for the backend does not exist.
- Fix approach: Delete `requirements.txt` and `backend/app/` during P0-1; create `backend/package.json` with the correct TS/Hono stack.

**No `package.json` / lockfile for backend:**
- Issue: The backend has no `package.json`, `pnpm-lock.yaml`, or `tsconfig.json`. The frontend uses `npm` (`package-lock.json`) rather than `pnpm` as specified in the architecture docs.
- Files: `frontend/package-lock.json`, missing `backend/package.json`
- Impact: Reproducible builds (`docker compose up`) will fail until these are created. `pnpm` vs `npm` inconsistency may cause friction.
- Fix approach: Create `backend/package.json` + `pnpm-lock.yaml` during P0-1. Decide consistently on one package manager.

**`noUnusedLocals` and `noUnusedParameters` are disabled in frontend tsconfig:**
- Issue: `frontend/tsconfig.json` sets `"noUnusedLocals": false` and `"noUnusedParameters": false`. This allows dead code to accumulate silently.
- Files: `frontend/tsconfig.json`
- Impact: Low now (skeleton), but will hide stale variables as the frontend grows.
- Fix approach: Re-enable both flags before the implementation phase begins.

---

## Known Bugs

No runtime bugs are detectable yet — the application is pre-implementation. The only executable code is the FastAPI health endpoint.

---

## Security Considerations

**CORS is fully open in the FastAPI skeleton:**
- Risk: `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]` in `backend/app/main.py`. The architecture acknowledges this is intentional for local dev, but the Python backend will be deleted anyway. The new Hono backend must not ship with open CORS by default if it ever runs in a non-local context.
- Files: `backend/app/main.py` lines 13–18
- Current mitigation: Documented as dev-only; no auth, no cookies, single local tool.
- Recommendations: Scope CORS to `http://localhost:5173` (and `VITE_API_BASE` origin) in `backend/src/app.ts` even in dev. Document clearly in `.env.example`.

**SSH private key path is mount-only — no validation exists yet:**
- Risk: The `docker-compose.yml` mounts `./keys:/keys:ro`. There is no `env.ts` yet to validate that `SSH_PRIVATE_KEY_PATH` is set and the file exists at startup. A missing key will produce a confusing runtime error mid-run rather than a fast-fail at boot.
- Files: `docker-compose.yml`, missing `backend/src/env.ts`
- Current mitigation: `.gitignore` correctly ignores `keys/*` (only `keys/.gitkeep` committed).
- Recommendations: `env.ts` (P0-2) must validate key path existence at startup with a readable error message.

**`.env` file access is denied in this environment:**
- Risk: The `.env` file exists (confirmed by `docker-compose.yml` referencing it as `required: false`) but could not be read due to permissions. Its contents are unknown — if it contains real credentials it must not be committed.
- Files: `.env` (existence confirmed, contents unread)
- Current mitigation: `.gitignore` lists `.env` as ignored.
- Recommendations: Run `SUB-3` secret scan (`git grep` for tokens/keys) before code freeze (Sun Jun 7, 14:00). Confirm `.env` is not tracked: `git ls-files .env`.

**No redaction implementation exists yet:**
- Risk: `safety/redaction.ts` is specified in `docs/SAFETY_POLICY.md` §6 and `docs/ARCHITECTURE.md` §10 as a prerequisite for audit writes, UI display, and model feedback. Until it exists, any SSH stdout/stderr containing secrets would be stored and surfaced unredacted.
- Files: Missing `backend/src/safety/redaction.ts`
- Current mitigation: None — backend is not yet implemented.
- Recommendations: Implement redaction as part of P0-5 (safety layer), with unit tests, before any real SSH execution is wired.

---

## Performance Bottlenecks

**SQLite with `better-sqlite3` is synchronous — blocks the Node event loop:**
- Problem: `better-sqlite3` is deliberately synchronous. Every DB write (audit append, run update, observation insert) blocks the event loop for the duration of the write.
- Files: Planned `backend/src/store/db.ts`, `backend/src/store/audit.ts`
- Cause: This is a known tradeoff of `better-sqlite3` vs async alternatives.
- Improvement path: For a 24-hour hackathon with low concurrency this is acceptable. If writes become slow, batch audit events or switch to the JSONL fallback (`docs/PRD.md` §10). Do not switch to an async SQLite driver mid-build — it's a context switch cost not worth it under time pressure.

**SSE event bus is in-process only:**
- Problem: The planned `run-event-bus.ts` uses a per-run `EventEmitter`. If the process restarts mid-run (e.g. Docker container crash), all in-flight SSE subscribers are lost and clients must reconnect and replay from the audit log.
- Files: Planned `backend/src/events/run-event-bus.ts`
- Cause: No external message broker; this is an explicit non-goal (`docs/PRD.md` §11).
- Improvement path: Acceptable for the hackathon. Ensure the frontend reconnects on SSE disconnect and re-fetches run state via `GET /api/runs/:runId`.

---

## Fragile Areas

**The orchestrator state machine is the critical path with the most moving parts:**
- Files: Planned `backend/src/ai/orchestrator.ts`
- Why fragile: It integrates the Phoenix client, SSH executor, safety layer, all five agent roles, the audit store, and the SSE event bus. A bug in any dependency surfaces here. It has the most complex acceptance criteria (P0-9) and the most test coverage debt.
- Safe modification: Build with mock SSH and mock Phoenix first (offline demo path). Only wire real SSH/Phoenix after the mock loop passes `orchestrator.test.ts`.
- Test coverage: `tests/orchestrator.test.ts` is specified but does not exist yet.

**Safety blocklist regex matching is security-critical and untested:**
- Files: Planned `backend/src/safety/command-policy.ts`, `backend/src/safety/classifier.ts`, missing `backend/src/tests/safety.test.ts`
- Why fragile: A missed blocklist pattern or a regex that can be bypassed by whitespace/quoting is a hard-fail that zeros the incident score. `docs/SAFETY_POLICY.md` §3 explicitly calls out obfuscation attempts (extra spaces, quotes, `$()`/backtick wrappers) as attack vectors the policy must handle.
- Safe modification: Write `safety.test.ts` (P0-5) before any SSH execution is wired. Cover every blocklist pattern, obfuscation variant, and the targeted-vs-broad distinction.
- Test coverage: None yet.

**Activity draft must not invent facts — no guardrail exists yet:**
- Files: Planned `backend/src/ai/agents/activity-log-generator.ts`
- Why fragile: Rubric B explicitly penalizes invented actions in the activity. The agent must use only the audit trail. Until `activity-log-generator.ts` exists and is tested against a known audit trail, there is no guarantee the model won't hallucinate observations.
- Safe modification: Provide the full audit trail (observations + command results) as the only context for the activity writer prompt. Never inject ticket description or free-form notes into its context.
- Test coverage: Not specified in the current test plan — consider adding a fixture-based test in `orchestrator.test.ts`.

---

## Scaling Limits

**Single-run concurrency only (in-process event bus + synchronous SQLite):**
- Current capacity: One active run at a time is the safe operating assumption.
- Limit: Multiple concurrent runs will contend on the synchronous SQLite writes and share a single Node event loop. At hackathon scale (one technician, five VMs, sequential runs) this is fine.
- Scaling path: Not applicable given explicit non-goals (`docs/PRD.md` §11 — no queues, no background workers, no k8s).

---

## Dependencies at Risk

**`better-sqlite3` requires a native build (node-gyp):**
- Risk: Native addon compilation can fail in the Docker build if `python3`/`make`/`gcc` are not present in the `node:22-slim` base image.
- Impact: `docker compose up` fails with a cryptic build error if the image lacks build tools.
- Migration plan: Use `node:22` (not `-slim`) in the backend Dockerfile, or install `build-essential` explicitly. Alternatively fall back to the JSONL audit path if the build environment is constrained.

**`package-lock.json` instead of `pnpm-lock.yaml` in frontend:**
- Risk: Architecture docs and global conventions specify `pnpm`. The frontend was initialized with `npm` (lockfile present). Mixing package managers in a monorepo causes friction.
- Impact: Low — both work, but `npm install` and `pnpm install` produce different lockfiles and `node_modules` layouts.
- Migration plan: Either standardize on `npm` for the whole project or re-initialize with `pnpm`. Do this before the first real dependency install to avoid a messy lockfile migration.

---

## Missing Critical Features

**Entire backend implementation:**
- Problem: All of the following are specified but do not exist: Phoenix client, SSH executor, safety layer, orchestrator, run store, audit log, SSE event bus, all agent roles, all Hono routes.
- Blocks: Every rubric section (A, B, C, D, E) except the basic `/health` endpoint.

**No tests of any kind:**
- Problem: `tests/safety.test.ts`, `tests/phoenix-client.test.ts`, `tests/orchestrator.test.ts` are specified in the architecture but none exist. No test runner or test config exists in the backend.
- Blocks: Rubric E (engineering quality, 15 pts) explicitly scores runnable tests with mocks.

**No `env.ts` / validated environment config:**
- Problem: Missing required-var validation means a misconfigured `.env` will produce runtime errors rather than a clear startup failure. This is P0-2 and blocks P0-7 (SSH executor) and P0-8 (AI model).
- Files: Missing `backend/src/env.ts`

**No `REPORT.md`:**
- Problem: `docs/TASKS.md` SUB-4 requires a `REPORT.md` covering approach, agent design, safety model, and results on the 5 practice VMs. It is recommended by the brief and likely read by judges.
- Blocks: Submission completeness.

---

## Test Coverage Gaps

**Safety layer (highest risk, zero coverage):**
- What's not tested: Blocklist patterns, obfuscation bypasses, edited-command recheck, redaction.
- Files: Missing `backend/src/tests/safety.test.ts`
- Risk: A gap here is a hard-fail — blocked commands that execute or secrets that appear in logs zero the incident score.
- Priority: High

**Phoenix client (network error paths):**
- What's not tested: 401 (bad token), 404 (ticket not found), empty list, 5xx + retry, timeout.
- Files: Missing `backend/src/tests/phoenix-client.test.ts`
- Risk: Unhandled error responses crash the run or produce undefined behavior at demo time.
- Priority: High

**Orchestrator (full run loop):**
- What's not tested: Happy path (mock SSH + mock model), reject path (technician rejects → alternative proposed), abort path, max-steps cap.
- Files: Missing `backend/src/tests/orchestrator.test.ts`
- Risk: Integration bugs only surface during the live demo.
- Priority: High

**Activity generator (no hallucination guard):**
- What's not tested: That `activity_log_generator` only cites facts present in the audit trail.
- Files: Planned `backend/src/ai/agents/activity-log-generator.ts`
- Risk: Invented actions in the submitted activity are explicitly penalized by rubric B.
- Priority: Medium

---

*Concerns audit: 2026-06-06*
