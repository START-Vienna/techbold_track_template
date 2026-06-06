# PRD — Service Desk Autopilot

> **AI Service Desk Autopilot** — a technician-controlled AI troubleshooting copilot for the
> techbold START Hack Vienna '26 track. Built to **win the scoring rubric**, not to be a
> beautiful long-term platform. Backend + agent pipeline + safety are the priority; the UI is
> the minimum that lets a technician drive and a judge see control.

- **Status:** planning doc, pre-implementation
- **Audience:** the hackathon team (tired, time-boxed) + the judges reading the repo
- **Companion docs:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [SAFETY_POLICY.md](./SAFETY_POLICY.md) · [IMPLEMENTATION_PROCEDURE.md](./IMPLEMENTATION_PROCEDURE.md) · [TASKS.md](./TASKS.md)
- **Authoritative inputs:** the official **techbold case brief** (now incorporated), [`README.md`](../README.md), [`docs/scoring.md`](./scoring.md), [`docs/phoenix-openapi.yaml`](./phoenix-openapi.yaml). These override anything below if they disagree.

---

## 0. Hard facts & logistics (from the official brief)

- **Code freeze: Sunday, June 7, 14:00 sharp.** Late submissions are not accepted. Today is June 6 → ~24h.
- **Team: 2–4 people. Prize: €10,000** (€3k hardware + €7k paid contract + winner story).
- **Two separate evaluations — design for both:**
  1. **Automated grading** on **fresh hidden VMs you've never seen**: VM state checks, a **persistence test after reboot/restart**, ERP request logs, and **safety/secret scans of the repo**.
  2. **Live jury demo** (~4-min pitch, run the full loop live on a scenario *they* provide) + a **3-min demo video** in the submission.
- **The jury (Christopher Chellakudam & Benedikt Fritzenwallner) built the case *and* the automated grader.** They judge correctness, safety and engineering **directly** — no hand-waving survives. Mentors reachable on Discord for ERP/VM/safety questions.
- **You get your own 5 Ubuntu VMs** (one fault each) **+ a reset endpoint** that restores all VMs and clears your activities. → **Practice loop:** load tickets → solve on your VMs → `reset` → repeat. Grading uses *different* fresh VMs, so **generalise, never hardcode**.
- **Incident scope:** every incident is a **local-service Linux problem solvable over the shell** (systemd units, ports, configs, disk, permissions, logs, cron, dependencies). Explicitly **out of scope:** kernel, bootloader, hardware, cloud-networking. Aim OS-agnostic in principle; VMs are Ubuntu.
- **ERP core = three endpoints** the brief calls out: *list my open tickets*, *get a ticket's customer-system*, *create an activity* (+ the separate *reset*). The repo OpenAPI also exposes `/me`, ticket-detail, `/customers/{id}`, and status-PATCH — treat those as **best-effort** and degrade gracefully if the live mock omits them. **Setting ticket status is NOT scored** (see §2) — do it if cheap, never gate the demo on it.
- **Submission:** public **MIT-licensed** repo in the START Hack Vienna '26 org → `techbold/<team>/`, real README, `.env.example` (no secrets), recommended **REPORT.md**, 3-min demo video, Tally form.

---

## 1. The one-paragraph pitch

Technicians get vague service tickets ("the status API is sometimes down"). They SSH into a
customer's Linux VM, poke around, fix it, and — if they remember — write it up in the ERP.
That's slow, inconsistent, risky, and badly documented. **Service Desk Autopilot** turns that
into a controlled loop: it loads the ticket and SSH target from Phoenix ERP, an AI proposes
**one diagnostic command at a time**, the technician **approves/edits/rejects every command**,
the backend runs only approved commands through a **safety layer**, observes the output, and
iterates to a root cause. It proposes a **minimal reversible fix**, validates it, then drafts a
**complete, accurate ERP activity report built only from the audit trail** for the technician to
edit and submit. Every proposed/approved/rejected/executed command is logged. The AI never acts
on its own.

---

## 2. Why this design wins the rubric

The rubric (`docs/scoring.md`) is 100 points. **55 of them are B (troubleshooting, 35) + C
(safety/audit, 20).** UI is only 10 (D). Engineering quality is 15 (E) and explicitly rewards
*separated modules + tests + README + sane secrets*. So the entire product is shaped around:

| Rubric block | Pts | What it actually checks | Our design response |
|---|--:|---|---|
| **A** Functional MVP & ERP | 20 | Load tickets(5), usable list title/customer/priority/status(3), sort/filter by status\|priority\|date(2), load customer-system(4), **complete** activity(4), survive auth/404/empty(2) | Typed Phoenix client + mock mode; ticket list with sort/filter (default date); always fill all 5 graded activity fields; explicit empty/401/404 states. **No A points for status-PATCH** — it's optional. |
| **B** Troubleshooting | 35 | 5 **hidden** incidents × 7 on **fresh VMs**: root cause(1), fix works(0–3), persists(1), no regression(1), summary(1) | Generalising diagnostic agent (no hardcoded fixes), persistence check via reboot-safe fixes, minimal-change bias, validation step that distinguishes *verified* vs *likely* fixed |
| **C** Safety & audit | 20 | Full audit trail, no blanket commands, secret protection, minimal changes, human control. **Hard fails zero the incident.** | Deterministic blocklist *before* any execution, mandatory approval on **every** command, secret redaction in logs/UI/activities, complete append-only audit log |
| **D** Technician UX | 10 | Overview, detail+system, visible progress, followable logs, review/retry/abort | One ticket list + one run page with live SSE timeline, approval card, retry/abort |
| **E** Engineering | 15 | Clean separated modules, real README, runnable tests/mocks, error handling+timeouts+retries, sane `.env` | Hono modules mirror rubric's named parts; Vitest tests for safety/Phoenix/orchestrator; mock Phoenix + mock SSH |

**Tie-breakers** (in order): higher B → higher C → more incidents fully solved → fewer safety
flags → fewer unnecessary commands → shorter eval time. **Implication: never run an
unnecessary command, never trip a safety flag, keep the loop tight.** Minimal-command-count is
literally a tie-breaker, so the agent must prefer one good diagnostic over five scattershot ones.

---

## 3. Users

- **Technician / service-desk worker** (primary). Drives the run, approves commands, edits and
  submits the activity. Wants to move fast but stay in control and not get fired for `rm -rf`.
- **Hackathon judge / evaluator** (decisive). Watches a live demo *and* reads the repo + audit
  log + ERP activities. Needs to **see** human control and safety, not take it on faith.
- **System administrator persona** (indirect). The customer whose VM must come back healthy and
  stay healthy after reboot, with nothing deleted.

---

## 4. Problem statement

1. Ticket descriptions are **symptoms only** ("API intermittently unavailable") — the root cause
   is hidden on the VM.
2. Manual SSH troubleshooting is slow, error-prone, and easy to do unsafely under time pressure.
3. Documentation (the ERP activity) is an afterthought, yet it's **graded** and is the artefact
   the business actually keeps.
4. There is no audit trail of what was run on a customer system — a compliance and trust problem.

---

## 5. Solution — the human-in-the-loop run

```
load ticket → load customer system → open run → triage
  → agent proposes ONE command (with purpose + expected signal + risk)
  → safety layer classifies/blocks
  → technician approves / edits / rejects
  → backend executes approved command over SSH (timeout, output cap, redaction)
  → observe output → repeat until root cause
  → propose minimal fix → approve → execute → validate (reboot-safe — persistence is graded)
  → draft activity FROM the audit trail → technician edits → submit to ERP [→ optionally set ticket DONE]
```

> **Diagnosis-first is a judge-favored pattern.** The brief's "What great looks like" highlights an
> AI that proposes a **ranked list of root-cause hypotheses with the evidence for each**, and only
> acts once the technician picks one. We surface this explicitly (see §12) — it optimises for trust
> and explainability, which the human jury rewards.

The backend owns **state, safety, approval gating, execution, audit, and ERP writes**. The AI
owns **proposing commands, interpreting output, and drafting prose**. That separation is the
whole product.

---

## 6. Scope

### 6.1 Must-have MVP (maps to A/B/C/D)
- Ticket list (title, customer, priority, status) with **sort/filter** — *A*
- Ticket detail + customer-system (SSH target) view — *A/D*
- Start a run for a ticket — *B*
- Live agent progress log / timeline (SSE) — *D*
- "Proposed next command" card: command, purpose, expected signal, **risk level**, safety notes — *C/D*
- **Approve / edit-then-approve / reject-with-reason** on every command — *C/D*
- SSH command execution through the backend safety layer (timeout, output cap) — *B/C*
- **Audit log** of every proposed/approved/rejected/executed command + key actions — *C*
- Deterministic safety blocking of dangerous commands **before** execution — *C*
- Validation step that confirms the customer benefit is restored — *B*
- Activity draft (all 5 graded fields) generated **only from the audit trail** — *A/B*
- Submit activity to Phoenix + set ticket status `DONE` — *A/B*
- Retry and abort controls — *D*

### 6.2 Nice-to-have (only if P0 is green — see TASKS.md)
- **Ranked hypotheses + evidence panel** (diagnosis-first) — judge-favored; promote to P1, not P2.
- Chat-style interface (AI SDK UI `useChat` with tool parts)
- Multiple named agents surfaced in the UI (`problem_analyzer`, `customer_system_analyzer`, `problem_solver`, `activity_log_generator` — the brief's own names)
- Confidence scores on each hypothesis
- "Why this command?" rationale expander
- Run replay from the audit log
- Redaction preview before output is shown

### 6.3 Non-goals (we will **not** build these — see §11)
- Fully autonomous remediation (explicitly against the rules — a human confirms every action)
- Multi-tenant auth / user management / RBAC
- Analytics dashboards, charts, animations
- Production deployment hardening, HA, queues, k8s
- A generic Linux admin assistant beyond the incident scope
- RAG over arbitrary documents (nothing in the case requires it)

---

## 7. Success metrics (what "done" means)

- **Solves hidden incidents:** ≥3/5 incidents at fix-score ≥2, target 5/5 at 3. (B)
- **Correct activities:** all 5 graded fields populated from real observations, no invented facts. (A/B)
- **Zero hard-fails:** never executes a blocklisted command; never leaks a secret. (C)
- **Complete audit trail:** every command + decision is in the log and viewable. (C)
- **Visible human control:** judge can see approve/edit/reject/abort working live. (D)
- **Reproducible:** `docker compose up` works; tests run; README is real. (E)
- **Fast, debuggable demo path:** deterministic enough to recover live if something breaks.

---

## 8. Product principles (decision rules under time pressure)

1. **Safety beats cleverness.** A blocked dangerous command is a win; a clever risky one is a hard-fail.
2. **One command at a time.** Easier to approve, audit, and debug. Also helps the command-count tie-breaker.
3. **Read before you write.** Always exhaust read-only diagnosis before any mutation.
4. **Minimal, reversible fixes.** Restart the one service; don't reinstall the world.
5. **Never invent.** Activity prose comes only from the audit trail and command output.
6. **Deterministic backbone, AI in the seams.** The state machine, not the model, owns truth.
7. **Mock everything.** Every external dep (Phoenix, SSH, LLM) has a mock so the demo can't hard-fail.

---

## 9. API contract (our backend → frontend)

Base URL: `VITE_API_BASE` (default `http://localhost:8000`). All responses JSON. Our backend
holds the Phoenix token and SSH key — **never the browser**. Internal run statuses map to Phoenix
ticket statuses only at submit time (Phoenix knows only `OPEN`/`PENDING`/`DONE`).

> ⚠️ **Status enum:** Phoenix supports only `TicketStatus = OPEN | PENDING | DONE`
> (`docs/phoenix-openapi.yaml`). We keep rich *run* phases internally and only ever PATCH Phoenix
> with those three. **Status-PATCH earns no rubric points** — it's an optional courtesy at the end.
>
> ⚠️ **ERP reality:** the official brief documents **three core endpoints** — *list my open tickets*,
> *get customer-system*, *create activity* — plus the separate *reset*. The repo OpenAPI also lists
> `/me`, ticket-detail, `/customers/{id}` and status-PATCH. Our backend exposes the richer set for
> the UI, but only the **three core Phoenix calls are load-bearing**; everything else degrades
> gracefully (e.g. ticket detail is derived from the list response, which already carries
> title/description/priority/status/customer). Confirm the live endpoint set with mentors on Discord.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness `{status:"ok"}` |
| GET | `/api/me` | Technician identity (proxies Phoenix `/me`) |
| GET | `/api/tickets` | Assigned tickets (proxies `/me/tickets`, supports `?status=&priority=&sort=`) |
| GET | `/api/tickets/:ticketId` | One ticket |
| GET | `/api/tickets/:ticketId/customer-system` | SSH target metadata |
| POST | `/api/runs` | Create a troubleshooting run for a ticket |
| GET | `/api/runs/:runId` | Run state, ticket, timeline, pending approval, activity draft |
| GET | `/api/runs/:runId/events` | **SSE** stream of run events |
| POST | `/api/runs/:runId/next` | Advance the agent until it needs approval / completes / fails / hits max steps |
| POST | `/api/runs/:runId/approvals/:approvalId/approve` | Approve (optionally edited) command → safety re-check → execute |
| POST | `/api/runs/:runId/approvals/:approvalId/reject` | Reject with reason → agent proposes an alternative |
| POST | `/api/runs/:runId/abort` | Abort the run |
| POST | `/api/runs/:runId/activity/draft` | (Re)generate the structured activity draft |
| POST | `/api/runs/:runId/activity/submit` | Submit activity to Phoenix (then set ticket `DONE`) |
| PATCH | `/api/tickets/:ticketId/status` | Set Phoenix status `OPEN`/`PENDING`/`DONE` |

### Request/response examples

**POST `/api/runs`**
```jsonc
// request
{ "ticketId": 7001 }
// 201 response
{
  "runId": "run_01H... ",
  "status": "LOADED_CONTEXT",
  "ticket": { "id": 7001, "title": "Status API intermittently unavailable", "priority": "high", "status": "OPEN", "customer_name": "Nordlicht Logistik GmbH" },
  "customerSystem": { "ip": "10.0.0.5", "port": 22, "username": "azureuser", "os": "Ubuntu 22.04 LTS" }
}
```

**POST `/api/runs/:runId/next`** → pauses on an approval
```jsonc
// 200 response (state machine stopped at WAITING_FOR_APPROVAL)
{
  "status": "WAITING_FOR_APPROVAL",
  "pendingApproval": {
    "id": "appr_01H...",
    "proposedCommand": "systemctl status status-api --no-pager",
    "purpose": "Check whether the status-api service is running and why it last failed.",
    "expectedSignal": "active (running) = healthy; failed/inactive = service down → inspect logs next.",
    "riskLevel": "SAFE_READ_ONLY",
    "safetyNotes": "Read-only systemd query, bounded output, no secrets.",
    "isReadOnly": true
  }
}
```

**POST `/api/runs/:runId/approvals/:approvalId/approve`**
```jsonc
// request (editedCommand optional)
{ "editedCommand": "systemctl status status-api --no-pager -l", "reason": "want full lines" }
// 200 response
{
  "status": "EXECUTING_COMMAND",
  "approvalId": "appr_01H...",
  "safetyRecheck": { "riskLevel": "SAFE_READ_ONLY", "allowed": true },
  "result": {
    "command": "systemctl status status-api --no-pager -l",
    "exitCode": 3,
    "stdoutRedacted": "● status-api.service - Status API\n   Loaded: loaded ...\n   Active: failed (Result: exit-code) ...",
    "stderrRedacted": "",
    "durationMs": 412,
    "timedOut": false
  }
}
```

**POST `/api/runs/:runId/approvals/:approvalId/reject`**
```jsonc
{ "reason": "Don't touch systemd yet — check the port first." }
// → 200 { "status": "TRIAGING" }  (agent will propose an alternative on next /next)
```

**POST `/api/runs/:runId/activity/submit`**
```jsonc
// request — all 5 graded fields required by us even though Phoenix only requires datetimes
{
  "summary": "Restored the status API by fixing a stale systemd unit and freeing the bound port.",
  "root_cause": "status-api.service crashed on a stale PID file and failed to rebind to :8080.",
  "actions_taken": "Inspected service status and journal; identified stale /run/status-api.pid; removed it; restarted the unit; verified rebind.",
  "commands_summary": "systemctl status/journalctl (read-only); rm of a single stale PID file; systemctl restart; curl -I localhost:8080 (validation).",
  "validation_result": "curl -I localhost:8080 returns 200; service stays active after `systemctl restart` and a reboot smoke check."
}
// 201 response → Phoenix Activity object; backend then PATCHes ticket → DONE
```

### SSE event types (`GET /api/runs/:runId/events`)
`run.started` · `agent.thought_summary` · `command.proposed` · `command.blocked` ·
`approval.required` · `command.executing` · `command.completed` · `observation.added` ·
`fix.proposed` · `validation.completed` · `activity.drafted` · `activity.submitted` ·
`run.completed` · `run.failed`

Each event: `{ "type": string, "runId": string, "ts": ISO8601, "payload": object }`.

---

## 10. 24-hour hackathon compromise decisions

- **No suspended agent loop.** Each `/next` is a single LLM planning turn that yields one
  proposed command; the state machine persists context between turns. Easier to debug than a
  long-running `ToolLoopAgent.generate()` that has to be paused mid-flight for human approval.
- **SQLite (better-sqlite3), JSONL fallback.** If Drizzle/SQLite eats >30 min, switch to an
  append-only JSONL audit file + in-memory run map. Audit durability is the only hard requirement.
- **SSE, not WebSockets.** One-directional run events; commands go over plain POST. No socket lifecycle to babysit.
- **One LLM provider behind one `model.ts`.** Bring-your-own key. Swappable, but we don't build a provider abstraction layer.
- **Mock mode is first-class**, not an afterthought — the demo must survive flaky Wi-Fi / VM reboots.
- **No auth on our backend.** Single-team local tool; the Phoenix token is the only secret and it stays server-side.

## 11. What we intentionally will NOT build

- Autonomous execution without approval (rules + safety forbid it).
- A provider-agnostic LLM gateway, prompt-tuning UI, or eval harness beyond Vitest.
- WebSockets, message queues, Redis, background workers, k8s, microservices, MCP servers.
- Multi-tenant auth, org/role management, SSO.
- Analytics, charts, theming, animations, design-system polish.
- RAG / vector DB (nothing in the case needs document retrieval).
- A generic shell assistant — the agent is scoped to *diagnose-and-fix-this-ticket*.
- "Run everything in parallel" multi-agent theatre. Agents are roles in one controlled loop.

## 12. Judge-facing differentiators (say these out loud in the demo)

1. **The model can't touch the VM.** It only *proposes*; a deterministic backend executes after
   human approval and a safety re-check. Show the propose→approve→execute split.
2. **Hard-fail commands are blocked before they run** — demo a blocked `rm -rf /` or `chmod -R 777 /`.
3. **Edited commands are re-validated.** Edit a command in the approval card; show the safety re-check fire.
4. **Complete audit trail** — every proposed/approved/rejected/executed command with rationale,
   risk level, decision, exit code, redacted output, timestamp. Open it live.
5. **Secrets are redacted** everywhere — logs, UI, and the submitted activity.
6. **The activity is built from the audit log, not hallucinated.** Point at a claim in the
   activity and trace it back to a real command result.
7. **It generalises** — no incident is hardcoded; the same loop solves a VM we've never seen.
   (We tuned it against our 5 practice VMs via the reset endpoint, but nothing is keyed to them.)
8. **Diagnosis-first with ranked hypotheses + evidence** — the agent shows a ranked list of
   root-cause hypotheses, each with the observed evidence, and only acts on the one the technician
   picks. This is the brief's own "what great looks like" — lead the pitch with it.

---

## 13. Verified facts vs. still-to-confirm

The official techbold case brief is now incorporated (see §0). **Verified from the brief + repo:**

- **5 hidden incidents**, 7 pts each (35 total), graded by an automated VM grader **+ activity review**,
  on **fresh VMs**, with a **persistence test after reboot/restart**. We also get **our own 5 Ubuntu VMs**
  (one fault each) to practise on, plus a **reset endpoint** (restores VMs + clears activities).
- **Every incident is a local-service Linux problem over the shell** — systemd/ports/configs/disk/
  permissions/logs/cron/deps. **Not** kernel/bootloader/hardware/cloud-networking. **Generalise, don't hardcode.**
- SSH: private key provided as a file, matching public key pre-installed; user `azureuser` (repo README).
- **ERP core = 3 endpoints** (list tickets, customer-system, create activity) + reset; status-PATCH unscored.
- Phoenix base URL + token, SSH key, and reset credentials come **via Discord/email**, not the brief.
  Read the base URL from `.env` (`PHOENIX_API_BASE_URL`); never commit secrets.
- No LLM provided — bring your own key/endpoint in `.env`.

**Still to confirm with mentors on Discord (cheap questions, high value):**

- Does the **live** mock expose `/me`, ticket-detail, `/customers/{id}`, and status-PATCH, or only the
  documented three? (We degrade gracefully either way.)
- Exact **reset** endpoint path/auth (brief describes it; confirm before relying on it mid-event).
- Whether the grader expects the ticket moved to `DONE`, or only an activity created (we'll create the
  activity regardless; DONE is a cheap courtesy).
- Output/format expectations for `commands_summary` (command classes vs. literal commands — we redact either way).

---

## 13b. Additions folded from the `minam` branch (net-new — see RELIABILITY.md, AGENT_PIPELINE.md)

**Verified live this session** (resolves several §13 "still-to-confirm" items with hard data):
- **Phoenix is LIVE** at `http://68.210.101.85:8000` (plain HTTP) — `/health`=200, `/api/v1/me`=401 without a token.
- The live mock **does expose the full endpoint set** (`/me`, ticket-detail, `/customers/{id}`, status-PATCH, `/activities/create`, `/me/reset`) — not just the core three. It also has an **admin/judge console** (`/api/admin/*`) and a **mode** switch (`run-status` enum incl. `TESTING`): `/me/tickets` returns *the team's current-mode* tickets, so grading swaps mode to fresh hidden incidents → **consume `/me/tickets`, never hardcode.**
- ⚠️ **SSH `.pem` is not yet in `keys/`** (only `.gitkeep`) — a hard blocker for VM work until placed.
- ❓ **Passwordless sudo for `azureuser`** is still unconfirmed — preflight `sudo -n true` on first VM access (many fixes depend on it).

**Human-control surface (the human leads, the AI assists).** Beyond approve/edit/reject/abort, add to §9:
- `POST /api/runs/:id/manual-command {command}` — technician runs their **own** command (same safety + audit path; the AI observes) — unsticks/overrides the agent (G1).
- `POST /api/runs/:id/undo` — one-click revert of the last change via the captured rollback, re-tests no-regression (G3).
- `POST /api/runs/:id/questions/:qid/answer {answer}` + an `agent.question` SSE event — the agent asks instead of guessing ("need sudo?") (G11).
- **Plan-approval for read-only batches** — show diagnostics as one reviewable plan (each still audited); every mutation individually gated; Stop always visible (G4). Satisfies "visible plan + confirm" without approval fatigue.

**Validation honesty (G2):** proof is the customer-benefit test, never `systemctl is-active`; for **intermittent** symptoms (this PRD's own "API intermittently unavailable" example) repeat the test over an interval and fix the *cause of intermittency* — a single green → `LIKELY_FIXED`, not `VERIFIED_FIXED`.

Full failure-mode analysis + the verified diagnose→repair→validate protocol are in **[RELIABILITY.md](./RELIABILITY.md)**; the phase-by-phase agent behavior incl. the **unknown-error first-principles method** is in **[AGENT_PIPELINE.md](./AGENT_PIPELINE.md)**.

---

## 14. Research notes / sources

- **Official techbold case brief** (START Hack Vienna '26) — incorporated throughout (§0, §2, §13).
- Repo: README.md, docs/scoring.md, docs/phoenix-openapi.yaml (this repository).
- Vercel AI SDK (Context7 `/vercel/ai`, v5): `tool({ inputSchema, execute })`,
  `stopWhen: stepCountIs(n)`, `Output.object({ schema })`, `ToolLoopAgent`, human-in-the-loop
  `needsApproval` / `toolApproval` + `addToolApprovalResponse`. https://ai-sdk.dev/docs
- Hono (Context7 `/websites/hono_dev`): `@hono/node-server`, `streamSSE`, `@hono/zod-validator`,
  `app.onError`, timeout middleware. https://hono.dev/docs
- ssh2 (Node SSH client): single-command exec, timeouts, key auth. https://github.com/mscdex/ssh2
- OpenClaude (https://github.com/Gitlawb/openclaude): pattern extracted — tool-driven agent loop
  that **pauses on sensitive commands and emits an approval event** before execution; provider
  abstraction; bash/file/grep tools. We reuse the *propose→approve→execute* pattern, not the code.
