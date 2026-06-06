# REVIEW — from a 50-year sysadmin's chair (+ logic-gap register)

A pragmatic critique of the design in [AGENT_PIPELINE.md](AGENT_PIPELINE.md) / [ARCHITECTURE.md](ARCHITECTURE.md)
/ [SAFETY_POLICY.md](SAFETY_POLICY.md) / [RELIABILITY.md](RELIABILITY.md), from the POV of the person who'd
actually use it at 3am. Goal: easiest, most trustworthy human-in-the-loop assistant — and find every logic gap.

## The veteran's verdict
> "Most of these AI ops toys either nag me to death or quietly do something stupid. This one's *close* —
> it proves the fix with the same test, checks it survives a restart, and can't run `rm -rf /`. Good. But
> it's built like the AI is the technician and I'm the button. **It's the other way around. I'm the
> technician; it's my fast junior.** Let me drive when I want, watch my back when I don't, and never make me
> click 'yes' forty times to read a log file. Fix the things below and I'll actually keep it open."

**What he likes:** the safety chokepoint (model can't execute), closed-loop validation with the *same* test,
the reboot/persistence check, the audit trail, evidence-before-action, give-up-safely instead of flailing.

**What makes him close the tab:** approval fatigue, being unable to just type his own command, no one-click
undo, and any hint of "trust me, it's fixed" without proof for *his* kind of symptom.

---

## Logic-gap register (prioritized)
Severity = impact on trust/usability **and** score. Each has a concrete fix.

### P0 — fix before it's a credible tool
- **G1 · No human-driven command path.** *The biggest gap.* The pipeline is strictly *AI-proposes*. A real
  HITL tool must let the technician **type and run his own command** (still through safety + audit), with the
  AI **observing, redacting, and folding the result into context**. This is how the human unsticks the agent,
  injects expertise, and stays in charge. *Fix:* add `POST /runs/:id/manual-command` → safety classify →
  execute → audit → feed back as an observation + let the AI react. Make the human a first-class actor, not
  just an approver.
- **G2 · "active" ≠ "working"; one green check ≠ fixed for intermittent faults.** The very sample ticket is
  *"Status API intermittently unavailable."* A single `curl = 200` (or `systemctl is-active = active`) does
  **not** prove an intermittent problem is fixed — and `active` never proves the customer benefit. *Fix:*
  (a) the benefit test, never `is-active`, is the proof; (b) **match the test to the symptom**: for
  intermittent/flapping symptoms, repeat N times / over a short interval and address the *cause of
  intermittency* (OOM kills, restart loops, resource pressure), not a lucky single success. Encode in
  VALIDATE + the verdict (`LIKELY_FIXED` if not repeated).
- **G3 · Rollback isn't a first-class, verified human control.** We *capture* rollback, but there's no
  always-visible **"Undo last change"** button, and we never check the rollback actually restores. A rollback
  that doesn't work is worse than none. *Fix:* surface one-click revert at any time; after capturing a
  rollback, sanity-check it; on give-up/abort, revert and **re-run the benefit test to confirm no regression**.
- **G4 · Approval fatigue vs "confirm every action."** Clicking yes on every `cat`/`systemctl status` kills
  adoption. The rubric allows *"a visible plan + confirm step."* *Fix:* present **read-only diagnostics as one
  reviewable plan approved with a single click** (each command still classified + audited individually); **every
  mutation is its own explicit gate**; a **Stop/Pause** is always visible; optional "auto-approve read-only for
  this run" toggle. Usable *and* compliant.

### P1 — correctness & trust
- **G5 · Idempotency / "is it already done?" pre-check missing.** Before a mutation, check current state; if
  already desired, skip (no "changed" when nothing needed changing). *Fix:* FixPlanner emits a precondition
  probe; skip+note if already satisfied.
- **G6 · Mutations should dry-run / diff first when the tool supports it.** Veterans never edit a config blind.
  `nginx -t`, `apt-get -s`, `--dry-run`, and a **diff of the file change** before apply. *Fix:* promote
  config-edit **diff preview** + native dry-run to standard pre-apply (not just "SHOULD").
- **G7 · sudo-limited read access not handled.** Half of real diagnosis needs root (`journalctl` for some
  units, `/var/log/...`, `/etc/...`). If `azureuser` lacks passwordless sudo, read-only diagnosis is crippled
  and the agent may wrongly conclude "looks fine." *Fix:* preflight records *what is readable*; when blocked,
  the agent **says "I need sudo to see X"** (G11 question channel) instead of guessing; degrade explicitly.
- **G8 · Editing secret-bearing config safely.** Sometimes the fix lives in a file that also holds a DB
  password/API key. Reading/diffing/echoing it risks leaking the secret to logs/UI/activity (a C hard-fail).
  *Fix:* edit in place without printing values; **redact the diff preview**; never `cat` the whole file to
  context — target the specific directive.
- **G9 · Single-root-cause tunnel vision / cascading faults.** The loop confirms one cause then fixes; real
  incidents stack (disk full *and* a bad config). *Fix:* after a fix, if the benefit test still fails, treat as
  a fresh incident (re-enrich); the ground-truth sweep already surfaces multiple lit-up layers — make the agent
  enumerate *all* anomalies before tunneling on one.
- **G10 · "Fixing" by masking the cause.** Restarting a crashing service on a loop, or `rm`-ing logs to free a
  disk that a runaway will refill — green test, fragile/regressing fix (fix-score 1, possible hard-fail). *Fix:*
  the **grader-mirror explicitly asks "did this address the root cause or mask the symptom?"**; disk-full →
  fix the *producer* (logrotate/the runaway), not just free space.
- **G11 · No agent→human question channel.** The agent can propose/abort but can't ask a targeted question
  ("need sudo?", "OK to restart X — 3 active connections?", "is a 30s blip acceptable?"). *Fix:* add an
  `agent.question` event + a human answer endpoint; HITL is a *conversation*, not just approvals.
- **G12 · Blast-radius before a restart/mutation.** A veteran wants "what depends on this, who's connected"
  before saying yes. *Fix:* before a restart/stop, show dependents (`systemctl list-dependencies --reverse`),
  active connections (`ss`), and a one-line impact note on the approval card.

### P2 — robustness & polish
- **G13 · SSH mid-run reconnect/resume.** Connection drops mid-run; run state persists but the live session
  doesn't. *Fix:* reconnect with backoff; resume from the persisted state; commands are idempotent so re-runs
  are safe.
- **G14 · Backup/temp artifacts left on the VM.** `cp x x.bak` is a filesystem footprint ("minimal changes").
  *Fix:* timestamped backups in a known path, **noted in the activity**, optionally cleaned on success.
- **G15 · Human sees digest, must be able to expand to full (redacted) output.** We budget output for the
  *model*; the *human* should one-click expand the full redacted stdout/stderr in the timeline. UI affordance.
- **G16 · Concurrent actors / second run on the same VM.** State drift if a human and the agent both act, or
  two runs target one VM. *Fix:* per-VM run lock; note out-of-band changes.
- **G17 · Slow/expensive probes.** `find /`, huge `journalctl` — scope and timeout; never unbounded.
- **G18 · Maintenance windows / change freeze.** Out of hackathon scope, but note: a real tool gates mutations
  on change-control. Document as a non-goal so judges see we know it exists.

---

## The reframe that makes it the *best* tool for him
Today the docs read **AI-leads-human-approves**. Flip the framing to **human-leads-AI-assists**:
1. The AI's default output is a **terse running narrative + the single best next step** — not a wall of text.
2. The human can at any moment: **approve · edit · reject · run his own command · ask/answer a question ·
   undo the last change · pause/stop**. (Today only approve/edit/reject/abort exist.)
3. The AI **earns trust by proof, not confidence**: same-test before/after, persistence, blast-radius,
   reversibility shown up front.
4. It **documents everything automatically** so he never writes the ticket up — that's the actual product
   value to him (and the activity score to us).

This costs little (G1, G3, G4, G11 are small backend additions) and is the difference between a demo toy and
something a veteran keeps open.

---

## Suggested priority for the build
Fold **G1, G2, G3, G4** into [AGENT_PIPELINE.md](AGENT_PIPELINE.md) + [ARCHITECTURE.md](ARCHITECTURE.md) API
now (they change the contract: `manual-command`, `question`/answer, `undo`, plan-approval, repeated/symptom-
matched validation). **G5–G12** become agent-prompt + safety rules. **G13–G18** are P2 hardening. Add the new
endpoints to [TASKS.md](TASKS.md) as P0/P1.

> Net: the engine (diagnose→fix→validate, safe, audited) is sound. The gaps are about **giving the human the
> wheel** and **not trusting a single green light** — exactly what a real sysadmin demands.
