# Tasks — Service Desk Autopilot

Ruthlessly prioritized for the scoring rubric. **P0 = the demo cannot happen without it.**
P1 = scoring boosters. P2 = only if ahead. Each task: owner, difficulty (S/M/L), dependencies,
acceptance criteria. Build the P0 vertical slice in **mock mode** first, then make it real.

**Code freeze: Sunday June 7, 14:00 sharp.** Team 2–4 — assign one owner per P0 lane (ERP, SSH+safety,
agent, frontend) and integrate continuously. Rubric weighting: **B (35) + C (20) = 55%**. UI (D) is
10. Engineering modularity + tests + README (E) is 15. **Status-PATCH and ticket-DONE are unscored** —
don't spend P0 time on them. **Generalise on your 5 practice VMs + reset; never hardcode an incident.**

Legend: `[ ]` todo · Owner `@___` · Diff `S<2h / M~half-day / L~day` · Dep = task IDs.

---

## P0 — Must finish for demo

- [ ] **P0-1 Repo migration to TS/Hono** — Owner `@___` · S · Dep: — 
  Replace Python backend with Node 22 + Hono; keep Docker layout + `./keys` mount.
  **Accept:** `docker compose up` serves `GET /health → {status:"ok"}`; frontend still loads at :5173.

- [ ] **P0-2 env.ts + .env.example** — Owner `@___` · S · Dep: P0-1
  Zod-validated env; add LLM/SSH/Phoenix/MOCK_MODE keys to `.env.example` (placeholders only).
  **Accept:** missing required var fails fast with a readable message; no secrets committed.

- [ ] **P0-3 Phoenix client + types + mock** — Owner `@___` · M · Dep: P0-1
  Typed wrapper (auth, 8s timeout, 1 retry on 5xx); Zod schemas from OpenAPI; `mock.ts` fixtures.
  **Accept:** `getMe`, `listTickets`, `getCustomerSystem`, `createActivity`, `setTicketStatus` work
  against real Phoenix **and** mock; 401/404/empty handled, don't crash.

- [ ] **P0-4 `GET /api/tickets` + `/:id` + `/customer-system`** — Owner `@___` · S · Dep: P0-3
  **Accept:** returns assigned tickets with title/customer/priority/status; detail + SSH target load. (Rubric A)

- [ ] **P0-5 Safety layer + tests** — Owner `@___` · M · Dep: P0-1
  `command-policy.ts`/`classifier.ts`/`redaction.ts`/`risk-levels.ts` per SAFETY_POLICY.md.
  **Accept:** `safety.test.ts` green — every blocklist pattern → `HIGH_RISK_BLOCKED`; edited-command
  recheck blocks danger; redaction strips secrets; allowlist → `SAFE_READ_ONLY`. (Rubric C — do early)

- [ ] **P0-6 Run store + audit log** — Owner `@___` · M · Dep: P0-1
  SQLite (or JSONL fallback) for runs/audit/approvals/results/observations/activity_drafts. Append-only audit.
  **Accept:** create run → `runs` row + `run.started` audit; approvals/results persist; no delete API. (Rubric C/E)

- [ ] **P0-7 SSH executor + mock** — Owner `@___` · M · Dep: P0-2, P0-5
  ssh2 single-command exec; connect+command timeout; output cap 16KB; exit code; redact; `mock.ts`.
  **Accept:** real VM `uname -a` returns output; timeout marks `timedOut`; mock drives loop offline. (Rubric B/E)

- [ ] **P0-8 `problem_analyzer` agent — ranked hypotheses + diagnostic command** — Owner `@___` · M · Dep: P0-2
  `generateObject` → `DiagnosticProposal` with **ranked root-cause hypotheses + evidence** then one
  read-only command. Prompt scoped to **local Linux services only**; enforces expected signal.
  **Accept:** given a symptom, returns typed ranked hypotheses + a sensible read-only diagnostic. (Rubric B + D explainability)

- [ ] **P0-9 Orchestrator state machine** — Owner `@___` · L · Dep: P0-5,P0-6,P0-7,P0-8
  Phases + transitions per ARCHITECTURE.md §4; `advance(runId)`; max-steps cap; block→ask-alternative.
  **Accept:** mock run goes TRIAGING→WAITING_FOR_APPROVAL→EXECUTING→OBSERVING→…→DRAFTING_ACTIVITY. (Rubric B/C)

- [ ] **P0-10 Run routes: create / get / next / abort** — Owner `@___` · M · Dep: P0-9
  **Accept:** `POST /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/next`, `/abort` behave per PRD §9.

- [ ] **P0-11 Approval routes (approve/edit/reject) + re-check + execute** — Owner `@___` · M · Dep: P0-7,P0-9
  Approve → re-validate final command → execute → feed observation back; reject → alternative.
  **Accept:** edited dangerous command blocked at approval (422 + audit BLOCKED); safe approved command executes + records result. (Rubric C)

- [ ] **P0-12 SSE run events** — Owner `@___` · M · Dep: P0-6,P0-9
  `streamSSE` + run-event-bus; every meaningful side-effect emits + audits the same event.
  **Accept:** browser sees `run.started`/`approval.required`/`command.completed` live. (Rubric D)

- [ ] **P0-13 `problem_solver` + Validator agents** — Owner `@___` · M · Dep: P0-8,P0-9
  `FixProposal` (minimal/reversible/rollback) + `ValidationResult` (VERIFIED vs LIKELY + **reboot/restart persistence check**).
  **Accept:** loop proposes a targeted fix and returns a validation verdict with evidence; persistence checked. (Rubric B — fix-works + fix-persists)

- [ ] **P0-14 `activity_log_generator` + submit** — Owner `@___` · M · Dep: P0-6,P0-13,P0-3
  `ActivityDraft` from audit trail only; `POST /activity/draft` + `/activity/submit` → Phoenix `createActivity`.
  **Accept:** all 5 graded fields populated from real observations (no invention, no secrets); submit creates a Phoenix activity. (Rubric A/B) *(Setting ticket DONE is optional/unscored — P2.)*

- [ ] **P0-18 Practice loop on 5 VMs + reset** — Owner `@___` · M · Dep: P0-11,P0-13,P0-14
  Run the full loop against all 5 of your own VMs; fix via **prompts/safety/validation**, not per-incident hacks; `reset` between runs.
  **Accept:** all 5 practice incidents solved cleanly, reboot-persistent, zero safety flags, on a generalising loop. (Rubric B — the main event)

- [ ] **P0-15 Frontend: ticket list + run page + approval card + timeline + activity editor** — Owner `@___` · L · Dep: P0-4,P0-10,P0-11,P0-12,P0-14
  Plain fetch + React state + one EventSource.
  **Accept:** a human can drive a full run in the browser: list→open→start→approve/edit/reject→see output→edit+submit activity. (Rubric A/D)

- [ ] **P0-16 README + .env.example + run instructions** — Owner `@___` · S · Dep: P0-1
  Real setup/run/env/architecture/assumptions/troubleshooting; link the docs/.
  **Accept:** a fresh clone runs via `docker compose up` following only the README. (Rubric E)

- [ ] **P0-17 Tests: phoenix-client + orchestrator** — Owner `@___` · M · Dep: P0-3,P0-9
  Mocked fetch + mocked SSH/model; happy path + reject path.
  **Accept:** `pnpm test` green. (Rubric E)

---

## P1 — Scoring boosters

- [ ] **P1-1 Robust error handling/timeouts/retries everywhere** — Owner `@___` · M · Dep: P0-3,P0-7,P0-8
  Phoenix/SSH/AI all have timeouts + sensible retries + clear messages; AI failure degrades to manual. **Accept:** kill each dep mid-run → clean error, no crash. (Rubric E)

- [ ] **P1-2 Retry + abort in UI** — Owner `@___` · S · Dep: P0-15 — retry a failed command, abort a run. (Rubric D)

- [ ] **P1-3 Ranked-hypotheses + evidence panel in UI** — Owner `@___` · M · Dep: P0-8,P0-15 — surface the ranked root-cause hypotheses with evidence and let the technician pick which to pursue; show purpose/expectedSignal on the command card. **Lead the pitch with this** (brief's "what great looks like"). (Rubric D + trust)

- [ ] **P1-4 Persistence/reboot validation step** — Owner `@___` · M · Dep: P0-13 — validator proposes a reboot-safe check; fixes prefer enable+persistent config. (Rubric B — fix persists point)

- [ ] **P1-5 Redaction preview in UI** — Owner `@___` · S · Dep: P0-12 — show that output was redacted before display. (Rubric C)

- [ ] **P1-6 Sort/filter polish on ticket list** — Owner `@___` · S · Dep: P0-4 — status + priority + date sort/filter via Phoenix query params. (Rubric A)

- [ ] **P1-7 Optional LLM safety second-opinion** — Owner `@___` · M · Dep: P0-5 — LLM classifier that can only *raise* concern, never override a deterministic block. (Rubric C)

- [ ] **P1-8 More orchestrator/safety test coverage** — Owner `@___` · M · Dep: P0-17 — blocked path, SSH-timeout path, Phoenix-submit path. (Rubric E)

---

## P2 — Nice if ahead

- [ ] **P2-1 AI SDK UI `useChat` chat interface** — Owner `@___` · L · Dep: P0-15 — tool parts + `addToolApprovalResponse` approvals. (Rubric D flair)
- [ ] **P2-2 Named multi-agent display** — Owner `@___` · M · Dep: P0-15 — show Diagnostics/Fix/Validator/Writer as distinct actors in the timeline. (Rubric D)
- [ ] **P2-3 Run replay from audit log** — Owner `@___` · M · Dep: P0-6 — step through a completed run. (Rubric C/D)
- [ ] **P2-4 Confidence scores on hypotheses** — Owner `@___` · S · Dep: P0-8.
- [ ] **P2-5 Incident timeline visual** — Owner `@___` · M · Dep: P0-12.
- [ ] **P2-6 Drizzle migration** — Owner `@___` · M · Dep: P0-6 — only if SQLite-raw becomes painful.
- [ ] **P2-7 Set ticket status DONE on submit** — Owner `@___` · S · Dep: P0-14 — unscored courtesy; nice in the demo. Do not prioritize.

---

## P0/P1 — human-control & reliability gaps (folded from `minam` — see REVIEW.md, RELIABILITY.md, AGENT_PIPELINE.md)

P0 — make it the tool a sysadmin actually trusts:
- [ ] **P0-G1 Human-driven command path** — Owner `@___` · M · Dep: P0-7,P0-11 — `POST /runs/:id/manual-command`: human types own command → safety classify → execute → audit (`actor:technician`) → fed to agent as observation; UI "run my own command" box. (Human leads; AI observes.)
- [ ] **P0-G2 Symptom-matched validation** — Owner `@___` · S · Dep: P0-13 — proof = benefit test (never `is-active`); intermittent symptoms repeat over an interval; single success → `LIKELY_FIXED`. (Rubric B — fix-works/persists)
- [ ] **P0-G3 One-click verified Undo** — Owner `@___` · M · Dep: P0-13 — `POST /runs/:id/undo` reverts last change via rollback, re-tests no-regression; always-visible Undo. (Rubric C/D)
- [ ] **P0-G4 Plan-approval for read-only batches** — Owner `@___` · S · Dep: P0-11 — one-click approve a read-only plan (each still audited); every mutation individually gated; Stop always visible. (Rubric C/D, anti-fatigue)
- [ ] **P0-G5 SSH executor hardening + tool preflight** — Owner `@___` · S · Dep: P0-7 — `bash -lc` PATH, `sudo -n`, exit-code-truth, `LANG=C`, output digest; first-step OS/tools/sudo preflight. (Rubric B reliability — see RELIABILITY.md)
- [ ] **P0-G6 Policy auto-approve mode (R0)** — Owner `@___` · S · Dep: P0-11 — auto-confirm SAFE_READ_ONLY, hard-block DENY; platform completes a run unattended (confirm grading flow with mentors).

P1:
- [ ] **P1-G7 Agent→human question channel** — `agent.question` event + answer endpoint (agent asks vs guesses, e.g. needs sudo).
- [ ] **P1-G8 Dry-run + redacted diff before mutate** — `nginx -t`/`apt-get -s` + redacted config diff on the approval card.
- [ ] **P1-G9 Blast-radius on approval card** — dependents + active connections before a restart/stop.
- [ ] **P1-G10 `read_local_docs` tool** — on-box man/--help/config (zero egress) for unfamiliar services.
- [ ] **P1-G11 Ground-truth enrichment sweep + unknown-error method** — per AGENT_PIPELINE.md (broad read-only sweep → follow the causal chain inward). (Rubric B — generalization)
- [ ] **P1-G12 Idempotency pre-check + cause-not-mask + multi-fault** — skip if already-desired; grader-mirror asks "cause or band-aid?"; re-enrich if still broken. (Rubric B)

---

## Submission (do NOT skip — hard deadline Sun Jun 7, 14:00)

- [ ] **SUB-1 README** — Owner `@___` · S · Dep: P0-16 — setup/run/env/architecture/assumptions/troubleshooting (Rubric E, 3 pts).
- [ ] **SUB-2 MIT LICENSE present + repo public in `START Hack Vienna '26 / techbold / <team>`** — Owner `@___` · S.
- [ ] **SUB-3 Secret scan + `.env.example` only** — Owner `@___` · S · Dep: P0-2 — `git grep` for tokens/keys; `.env`/`keys/` git-ignored. (Rubric C/E — a secret in the repo is a hard-fail.)
- [ ] **SUB-4 `REPORT.md`** — Owner `@___` · M — approach, agent design, safety model, results on the 5 practice VMs. (Recommended by brief.)
- [ ] **SUB-5 3-min demo video** — Owner `@___` · M · Dep: P0-15,P0-18 — full loop live with human confirmations + audit log visible.
- [ ] **SUB-6 Tally form** — Owner `@___` · S — title, pitch, team, problem, solution, stack, links.

---

## Build order (critical path)

```
P0-1 → P0-2 → P0-3 → P0-4            (ERP slice: tickets visible)
P0-1 → P0-5 (safety, parallel, early)
P0-1 → P0-6 (store, parallel)
P0-2,P0-5 → P0-7 (SSH)
P0-2 → P0-8 (diagnostics)
P0-5,6,7,8 → P0-9 → P0-10 → P0-11 → P0-12   (run loop + approvals + SSE)
P0-8,9 → P0-13 → P0-14                       (fix/validate/activity)
P0-4,10,11,12,14 → P0-15                     (frontend)
always: P0-16 (README), P0-17 (tests)
```

**If time is short, ship in this order of value:** Phoenix tickets (A) → SSH + safety + approval
(B/C) → diagnostic proposal loop (B) → execution-result loop (B) → activity generate+submit (A/B) →
audit timeline (C) → basic frontend (A/D) → tests + README (E). One fully-solved real incident with
a clean audit trail and zero safety flags beats a half-built chat UI.
