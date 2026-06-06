# Implementation Procedure — Service Desk Autopilot

A step-by-step build guide for a tired team. Follow it top to bottom. Each phase ends with a
**checkpoint** you can verify before moving on. Companion: [ARCHITECTURE.md](./ARCHITECTURE.md),
[SAFETY_POLICY.md](./SAFETY_POLICY.md), [TASKS.md](./TASKS.md).

**Golden rule:** get a *thin vertical slice* working end-to-end in **mock mode** first
(tickets → run → propose → approve → fake SSH result → activity), then make it real. A demo that
runs in mock mode can never hard-fail live.

---

## 0. Prerequisites

- Node 22, `pnpm`, Docker Desktop.
- Phoenix base URL + team bearer token (Builder Base).
- SSH `.pem` in `keys/` (git-ignored), public key already on the VMs.
- Your own LLM key (none provided). One provider is enough.

---

## 1. Environment variables

Create `.env` from `.env.example` (do **not** commit). Required:

```bash
# Phoenix ERP
PHOENIX_API_BASE_URL=http://68.210.101.85:8000   # use the URL given on Builder Base
PHOENIX_API_TOKEN=__your_team_token__

# SSH
SSH_PRIVATE_KEY_PATH=/keys/your-key.pem          # path inside the container (./keys mounted ro)
SSH_USERNAME=azureuser

# LLM (bring your own — pick ONE provider)
AI_PROVIDER=openai                               # openai | anthropic | azure
OPENAI_API_KEY=__your_key__
AI_MODEL=gpt-4o                                  # or claude-3-7-sonnet, etc.

# App
PORT=8000
MOCK_MODE=false                                  # true = mock Phoenix + mock SSH (offline demo)
VITE_API_BASE=http://localhost:8000              # frontend → our backend
```

Add the new keys to `.env.example` (placeholders only — no secrets). `env.ts` parses these through
Zod and fails fast with a clear message if one is missing.

### 1b. Verified env + reliability hardening (folded from `minam` — see [RELIABILITY.md](./RELIABILITY.md))

- **Phoenix is LIVE & verified** at `http://68.210.101.85:8000` (already set above; plain HTTP, **not https**).
  `/health`=200; `/api/v1/me`=401 without the token. The live mock exposes the **full** endpoint set + an
  admin/judge console with a **mode** switch — `/me/tickets` returns current-mode tickets, so **never hardcode**.
- ⚠️ Put the **SSH `.pem` in `keys/`** before any VM work (the folder ships with only `.gitkeep`).
- Add a **policy auto-approve mode** (e.g. `AUTO_APPROVE=safe`): auto-confirms `SAFE_READ_ONLY`, still
  hard-blocks DENY — so the platform can run **unattended during automated grading** (risk R0; confirm the
  grading flow with mentors) while the live demo shows full manual control.

**SSH executor must (Phase E hardening — this is what makes it actually work on fresh VMs):**
- run commands as **`bash -lc '<cmd>'`** (login PATH; defeats the #1 "command not in PATH" failure); set `LANG=C`.
- use **`sudo -n`** (non-interactive) and surface "needs password" instead of hanging on a TTY prompt.
- judge success by **exit code + expected signal**, not by stderr being non-empty.
- store full output in the DB but return a **capped digest** to the model (avoids context collapse after ~turn 10).
- run a **tool-availability + sudo preflight** as the very first read-only step on each VM.

See the pre-build reliability checklist in [RELIABILITY.md](./RELIABILITY.md) §7, and the full agent behavior
(incl. the unknown-error first-principles method) in [AGENT_PIPELINE.md](./AGENT_PIPELINE.md).

---

## 2. Migration: Python/FastAPI backend → TypeScript/Hono

We replace the contents of `backend/` but **keep the repo and Docker layout** so
`docker compose up` still works and the frontend keeps talking to `:8000`.

**Phase A — repo setup**
1. Keep `backend/` as the backend dir. Remove `backend/app/` (Python), `backend/requirements.txt`.
   Keep a copy of `main.py`'s CORS+`/health` behaviour — we reproduce it in Hono.
2. Replace `backend/Dockerfile` with a Node image (see §3).
3. Leave `frontend/` unchanged for now except adding fetch calls later. `VITE_API_BASE` already
   points at `:8000`, so the frontend doesn't care that the backend language changed.
4. `docker-compose.yml` needs **no change** to the service graph — same ports, same `./keys:/keys:ro`
   mount, same `host.docker.internal`. Only the backend image changes.

**Install (run in `backend/`):**
```bash
cd backend
pnpm init
pnpm add hono @hono/node-server @hono/zod-validator zod ai @ai-sdk/openai ssh2 better-sqlite3 ulid
pnpm add -D typescript tsx vitest @types/node @types/ssh2 @types/better-sqlite3
# optional ORM (only if it doesn't cost time):
# pnpm add drizzle-orm && pnpm add -D drizzle-kit
```

`package.json` scripts:
```jsonc
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`: `"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,
"esModuleInterop":true,"skipLibCheck":true,"types":["node"]`. Mark the package `"type":"module"`.

**Checkpoint A:** `pnpm dev` serves `GET /health → {status:"ok"}`.

---

## 3. Backend Dockerfile (replaces the Python one)

```dockerfile
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
EXPOSE 8000
CMD ["pnpm", "start"]
```

`docker-compose.yml` stays as-is. (If `better-sqlite3` native build is slow in the slim image, add
`RUN apt-get update && apt-get install -y python3 make g++` before install, or fall back to the
JSONL store — see §6.)

---

## 4. App skeleton (`src/index.ts`, `src/app.ts`, `src/env.ts`)

```ts
// env.ts
import { z } from 'zod';
const Env = z.object({
  PHOENIX_API_BASE_URL: z.string().url(),
  PHOENIX_API_TOKEN: z.string().min(1),
  SSH_PRIVATE_KEY_PATH: z.string(),
  SSH_USERNAME: z.string().default('azureuser'),
  AI_PROVIDER: z.enum(['openai','anthropic','azure']).default('openai'),
  AI_MODEL: z.string().default('gpt-4o'),
  PORT: z.coerce.number().default(8000),
  MOCK_MODE: z.coerce.boolean().default(false),
}).passthrough();
export const env = Env.parse(process.env);
```

```ts
// app.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import health from './routes/health';
import tickets from './routes/tickets';
import runs from './routes/runs';
// ...
export const app = new Hono();
app.use('*', cors());                 // open CORS for local dev
app.route('/', health);
app.route('/api', tickets);
app.route('/api', runs);
app.onError((err, c) => { console.error(err); return c.json({ error: String(err) }, 500); });
```

```ts
// index.ts
import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';
serve({ fetch: app.fetch, port: env.PORT });
console.log(`backend on :${env.PORT} (mock=${env.MOCK_MODE})`);
```

**Checkpoint:** `docker compose up --build` → `:8000/health` and `:5173` both load.

---

## 5. Phase B — Phoenix client (`phoenix/`)

1. `types.ts`: Zod schemas mirroring `phoenix-openapi.yaml` — `Ticket`, `CustomerSystem`,
   `SystemInfo`, `Employee`, `ActivityCreate`, `TicketStatus = OPEN|PENDING|DONE`.
2. `client.ts`: one `phoenixFetch(path, init)` helper that injects
   `Authorization: Bearer ${env.PHOENIX_API_TOKEN}`, sets an AbortController timeout (~8s), retries
   **once** on 5xx/network (never on 4xx), and parses+validates the response with the Zod schema.
   Methods: `getMe()`, `listTickets(q)`, `getTicket(id)`, `getCustomerSystem(ticketId)`,
   `getCustomer(id)`, `createActivity(body)`, `setTicketStatus(id, status)`.
3. `mock.ts`: in-memory fixtures (2–3 tickets, a customer system, a fake activity create) used when
   `MOCK_MODE=true` or in tests. **Same interface as `client.ts`** so routes don't branch.
4. Map errors: 401 → `PhoenixAuthError`, 404 → `PhoenixNotFound`, 422 → `PhoenixValidation`. Routes
   translate these to clean JSON + status for the UI (don't crash on empty list / 404).

**Endpoints — core three are load-bearing** (the brief documents these): `/api/v1/me/tickets?status=&priority=&sort=`
(list), `/api/v1/tickets/{id}/customer-system` (SSH target), `/api/v1/activities/create` (POST).
**Best-effort/unscored** (use if the live mock has them, else degrade): `/api/v1/me`, ticket-detail
(**derive from the list response** — it already carries title/description/priority/status/customer),
`/api/v1/customers/{id}`, `/api/v1/tickets/{id}/status` (PATCH). Activity create requires
`ticket_id`, `start_datetime`, `end_datetime`; **we always also send the 5 graded fields**.

**Test (`phoenix-client.test.ts`):** mock `fetch` → tickets parse; 401/404/empty handled; activity
create posts the full body. **Checkpoint B:** `GET /api/tickets` returns real (or mock) tickets.

---

## 6. Phase C — Run store + audit log (`store/`)

1. `db.ts`: open `better-sqlite3` at `./data/app.db`; `CREATE TABLE IF NOT EXISTS` for the 6 tables
   in [ARCHITECTURE.md §6]. If SQLite native build fights you, set `STORE=jsonl` and append rows to
   `./data/*.jsonl` with the same row shapes + an in-memory `Map` for run state.
2. `runs.ts`: `createRun`, `getRun`, `setPhase`, `completeRun`, `failRun`, `abortRun`.
3. `audit.ts`: `appendAudit(event)` (append-only), `createApproval`, `decideApproval`,
   `recordResult`, `addObservation`, `listObservations`, `listAuditForRun`. **Never** expose a delete.

**Checkpoint C:** creating a run writes a `runs` row + a `run.started` audit event; both readable.

---

## 7. Phase D — Safety layer (`safety/`) — **do this before SSH**

Implement per [SAFETY_POLICY.md]:
- `risk-levels.ts`: `RiskLevel` enum.
- `command-policy.ts`: `validateCommandAgainstPolicy(cmd)` — normalise, match blocklist → block;
  else classify; return `{ allowed, riskLevel, reason?, safetyNotes }`.
- `classifier.ts`: deterministic rules → `RiskLevel`; allowlist → `SAFE_READ_ONLY`.
- `redaction.ts`: `redactSecrets(text)` pure function.

**Test FIRST (`safety.test.ts`)** — this is the cheapest big rubric win (C) and protects against
hard-fails. Cover every blocklist pattern + edited-command recheck + redaction. **Checkpoint D:**
`safety.test.ts` green.

---

## 8. Phase E — SSH execution (`ssh/`)

1. `client.ts`: connect with `ssh2` using `{ host, port, username: env.SSH_USERNAME,
   privateKey: fs.readFileSync(env.SSH_PRIVATE_KEY_PATH), readyTimeout: 10000 }`.
2. `executor.ts`: `executeApprovedCommand(approvalId)`:
   - load the approval, **re-validate the final command** (defence in depth),
   - `conn.exec(cmd)` with a per-command timeout (e.g. 20s) — on overrun, close the channel, mark
     `timedOut`,
   - collect stdout/stderr capped (16 KB), capture exit code,
   - `redactSecrets` both streams, `recordResult`, `addObservation`, emit `command.completed`.
   - **No shell, no PTY, one command.** New connection per command is fine (simpler); reuse if time.
3. `mock.ts`: a scripted map from command-substring → fake `{stdout, exitCode}` so the whole loop
   runs offline. Used when `MOCK_MODE=true`.

**Checkpoint E:** with a real VM, an approved `uname -a` returns real output; in mock mode it returns
the scripted output.

---

## 9. Phase F — Agent loop (`ai/`)

1. `model.ts`: build the AI SDK model from `AI_PROVIDER`/`AI_MODEL` (`openai(env.AI_MODEL)` etc.).
2. `prompts.ts`: the shared rules + role prompts from [ARCHITECTURE.md §9].
3. `agents/*.ts` (names mirror the brief: `problem-analyzer.ts`, `customer-system-analyzer.ts`,
   `problem-solver.ts`, `validator.ts`, `activity-log-generator.ts`): each calls
   `generateObject({ model, schema, system, prompt })` returning its structured output. The
   analyzer returns **ranked hypotheses + evidence** plus one next command (diagnosis-first — a
   judge-favored pattern). Agents may use `proposeSshCommand` (tool **without** execute) or simply
   return a `DiagnosticProposal` — returning the structured object is simpler and enough. **Scope
   prompts to local Linux services only** (no kernel/network/hardware).
4. `orchestrator.ts`: the state machine driver.
   - `advance(runId)`: read phase + observations → call the right agent → on a proposed command,
     run `validateCommandAgainstPolicy`; if blocked, audit `command.blocked` + ask for an
     alternative (bounded retries); else `createPendingApproval`, set `WAITING_FOR_APPROVAL`, emit
     `approval.required`, return.
   - On approval (called from the approvals route after execution): feed the redacted result back
     as an observation, decide next phase (`OBSERVING → TRIAGING|PLANNING_FIX|VALIDATING`).
   - Enforce **max steps** (e.g. 12) → jump to `WAITING_FOR_ACTIVITY_REVIEW` with honest findings.
   - Wrap model calls in a timeout + single retry; on model failure, degrade to "propose manually".

**Checkpoint F (mock):** `POST /api/runs` then repeated `POST /api/runs/:id/next` +
approve loops to a drafted activity, fully offline.

---

## 10. Phase G — API routes + SSE (`routes/`, `events/`)

Implement the endpoints in [PRD.md §9]. SSE with Hono:

```ts
// events.ts
import { streamSSE } from 'hono/streaming';
export default app.get('/runs/:runId/events', (c) => {
  const runId = c.req.param('runId');
  return streamSSE(c, async (stream) => {
    const unsub = bus.subscribe(runId, (ev) =>
      stream.writeSSE({ event: ev.type, data: JSON.stringify(ev), id: ev.id }));
    stream.onAbort(() => unsub());
    while (!stream.aborted) await stream.sleep(15000); // keep-alive
  });
});
```

`run-event-bus.ts`: a `Map<runId, Set<listener>>` over a Node `EventEmitter`; every orchestrator/
route side-effect that matters also `appendAudit`s and `bus.emit`s the same event. Validate request
bodies with `@hono/zod-validator`.

**Checkpoint G:** the browser can open the SSE stream and see `run.started`/`approval.required`/
`command.completed` events live.

---

## 11. Phase H — Frontend integration (`frontend/`)

Keep it minimal (rubric D is only 10 pts; correctness + visible control beat polish). Plain fetch +
React state + one `EventSource` for the run stream.

Screens/components:
- **TicketListPage** — `GET /api/tickets`, columns: title, customer, priority, status; sort/filter
  by status/priority (rubric A). "Start / Continue" button.
- **TicketRunPage** — ticket + customer-system; live **AuditTimeline** (EventSource); **CommandApprovalCard**;
  command output panels; **ActivityDraftEditor**.
- **CommandApprovalCard** — command, purpose, expected signal, **risk level**, safety notes;
  Approve / Edit-then-approve / Reject-with-reason. Editing re-POSTs and shows the safety re-check.
- **ActivityDraftEditor** — the 5 fields, all editable; Submit; "Set DONE".
- **AuditTimeline** — chronological events with redacted stdout/stderr summaries + validation result.

Add `@ai-sdk/react` `useChat` only if P0 is fully green (see TASKS.md). **Checkpoint H:** a human
can drive a whole run in the browser.

---

## 12. Phase I — Practice loop, testing & demo prep

**The practice loop (use it — this is how you win B).** You get **5 of your own Ubuntu VMs**, one
fault each. The grader runs on *different* fresh VMs, so the goal is a **generalising** loop, not 5
hardcoded fixes.

1. Load your tickets → run the full agent loop on each of your 5 VMs.
2. Note where the agent gets stuck, proposes the wrong command, or mis-summarises.
3. Improve **prompts and the safety/validation logic** (never add per-incident special-casing).
4. **`reset`** (restores all VMs + clears your activities) → run the cases again from a clean slate.
5. Repeat until all 5 are solved cleanly with zero safety flags and a reboot-persistent fix.

- `pnpm test` green: `safety.test.ts`, `phoenix-client.test.ts`, `orchestrator.test.ts` (mocked SSH+model).
- Dry-run the **5 paths**: happy path, rejected-command path, blocked-dangerous-command path,
  SSH-timeout/failure path, Phoenix-submit path.
- Use the **reset** endpoint between dry runs — **never mid-graded-run**. Confirm its exact path/auth on Discord first.
- Pre-stage **mock mode** as the live fallback (`MOCK_MODE=true`).
- **Run a secret scan of the repo before code freeze** (e.g. `git grep -iE 'token|secret|password|BEGIN .*PRIVATE KEY'`); ensure `.env`/`keys/` are git-ignored and only `.env.example` is committed.

---

## 13. Running

```bash
# Docker (matches judging)
docker compose up --build           # backend :8000, frontend :5173

# Local dev
cd backend && pnpm install && pnpm dev          # :8000
cd frontend && pnpm install && pnpm dev         # :5173 (or npm)
```

From Docker, reach a locally-run mock via `host.docker.internal`, not `localhost`. The real Phoenix
is the Builder-Base URL in `.env`.

---

## 14. Testing with mocks vs real credentials

- **Mock mode (`MOCK_MODE=true`):** `phoenix/mock.ts` + `ssh/mock.ts` serve fixtures; no network,
  no VM, no LLM cost if you also stub the model. Use for unit tests, offline dev, and the live
  fallback.
- **Real mode:** set the Phoenix URL/token, `.pem` path, and LLM key. Verify `GET /api/me` returns
  your technician, then `GET /api/tickets`, then a real `uname -a` over SSH before trusting the loop.

---

## 15. Demo script (for judges)

Two deliverables: a **~4-minute live pitch** (run the full loop live on a scenario the jury
provides — *not slides*) and a **3-minute demo video** in the submission showing the same loop with
human confirmations + the audit log visible. The steps below fit either. **Lead with the
diagnosis-first ranked hypotheses** — it's the brief's "what great looks like". See also [PRD.md §12].

1. `docker compose up` — show `:8000/health` and the workspace at `:5173`.
2. **Ticket list** — sorted/filtered; point out title/customer/priority/status (rubric A).
3. Open a ticket — show the **customer system** (SSH target) detail (rubric A/D).
4. **Start run** — timeline shows `run.started`; agent posts a `thought_summary`.
5. Agent shows a **ranked list of root-cause hypotheses with evidence**, then **proposes a
   diagnostic command** for the top one — read the purpose + expected signal + **risk level**.
6. **Approve** — show the safety re-check, then real SSH output appears in the timeline.
7. Agent narrows to a **root cause** from the observation.
8. Agent **proposes a minimal fix** — note the rollback and that it's the *specific* service.
9. **Edit then approve** one command — show the safety layer re-validating the edited command (differentiator).
10. **Reject** a command with a reason — show the agent proposing an alternative (human control, rubric D).
11. **Try a dangerous command** (e.g. paste `rm -rf /` into the edit box) — show it **blocked** before execution (rubric C, hard-fail avoidance).
12. Agent **validates** — `VERIFIED_FIXED` with concrete evidence (rubric B persistence).
13. **Activity draft** appears — all 5 fields, built from the audit trail. Trace one claim back to a real command result (no hallucination).
14. Technician edits + **submits**; ticket set **DONE** (rubric A/B).
15. **Open the audit trail** — every proposed/approved/rejected/executed command with rationale,
    risk, decision, exit code, redacted output, timestamps (rubric C). Point out a **redacted secret**.

**What to say:** "The model never touches the VM — it proposes, a human approves, and a
deterministic backend executes through a safety gate. Every action is audited and redacted, and the
activity is generated from that audit log, not invented."

---

## 16. Known risks & fallbacks

| Risk | Fallback |
|---|---|
| Live SSH fails / VM unreachable | Flip `MOCK_MODE=true`; scripted SSH drives the same loop. Say so honestly. |
| Phoenix down / token issue | Mock Phoenix fixtures; demo the loop + activity locally. |
| LLM rate-limit / outage | Stub model returns a canned `DiagnosticProposal`; manual command entry still works (human-in-the-loop is the point). |
| `better-sqlite3` native build slow | `STORE=jsonl` append-only files + in-memory run map. |
| Agent loops / over-commands (tie-breaker risk) | Max-steps cap → honest activity; bias prompts to one strong read-only command. |
| Edited command sneaks danger | Mandatory safety re-check at approval; covered by `safety.test.ts`. |
| Secret leaks into logs/activity (hard-fail) | `redactSecrets` on every output before audit/UI/model; unit-tested. |
| Running out of time | Ship P0 only (TASKS.md). Mock-mode happy path + safety blocking + audit trail + one real incident solved beats a half-built chat UI. |

---

## 17. Submission checklist (code freeze: Sun Jun 7, 14:00 sharp)

- [ ] Public GitHub repo in the **START Hack Vienna '26** org → `techbold/<team>/`.
- [ ] **MIT `LICENSE`** at repo root (already present — keep it).
- [ ] **Real README**: setup, run, environment, architecture, assumptions, troubleshooting.
- [ ] **`.env.example` present, no secrets committed**; `.env` and `keys/` git-ignored; secret scan clean.
- [ ] **Modular code** visible: ERP client, SSH runner, agent, safety layer, activity generator kept separate.
- [ ] **Tests/mocks runnable** (`pnpm test` green; mock mode works offline).
- [ ] **`REPORT.md`** (recommended) — technical write-up: approach, agent design, safety model, results on your 5 VMs.
- [ ] **3-minute demo video** running the full loop live: load ticket → analyse → approved SSH actions → fix → validate → submit activity, with human confirmations + audit log visible.
- [ ] **Tally form** submitted: title, one-line pitch, team & members, problem, solution, tech stack, links.
- [ ] Optional: live demo link, pitch deck PDF.
- [ ] Final `reset` so graders start clean (confirm timing with mentors).
