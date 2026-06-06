# RELIABILITY — making the technical core actually work

The B block (35 pts) is **hard**: autonomous frontier agents resolve only **~50% of Terminal-Bench** and
**~11% of ITBench SRE** tasks. This doc is the rigorous, evidence-based answer to "the technical shit
works": the *known* reasons these agents fail, how our design defeats each, the verified
diagnose→repair→validate protocol, SSH/automation hardening, and an **honest** statement of what we can
and cannot guarantee. Pairs with [SAFETY_POLICY.md](SAFETY_POLICY.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[`knowledge/`](../knowledge/).

## 0. Verified environment state (June 2026)
- ✅ **Phoenix mock LIVE** at `http://68.210.101.85:8000` (plain HTTP). `/health`=200, `/docs`=200,
  `/api/v1/me`=401 without token. Endpoints match the documented OpenAPI; there is also an **admin/judge
  console** (`/api/admin/*`) and a **mode** switch (`run-status` enum incl. `TESTING`). `/me/tickets`
  returns *the team's current-mode* tickets → **grading swaps mode to fresh hidden incidents; never hardcode.**
- ⚠️ **SSH `.pem` NOT present in `keys/`** (only `.gitkeep`). **Hard blocker** for any VM work until placed.
- ❓ **Passwordless `sudo` for `azureuser`** unknown — must be preflighted (see §4). This single fact
  decides whether many fixes are even possible.
- ❓ **R0**: whether a human approves during automated grading. Ship the policy auto-approve mode regardless.

## 1. Why these agents fail (evidence) → our countermeasure
From the Terminal-Bench failure taxonomy and SRE-agent studies, failures cluster into three classes. Each
has a *specific, designed* countermeasure in our system — this is the heart of our reliability.

| Failure class (evidence) | What goes wrong | Our countermeasure |
|---|---|---|
| **Execution — "command not found / not in PATH" = 24.1% of ALL failures** (the single biggest) | agent calls a tool that isn't installed, or a non-login shell lacks PATH | **Tool-availability preflight** (§3) + **stock-Ubuntu-only command set** in the knowledge pack + run via `bash -lc` for login PATH + absolute paths for system binaries. **Never install** to "fix" a missing tool (also a C minimal-change win). |
| **Execution — step repetition / disobeying spec** | agent re-runs the same failing command, ignores constraints | deterministic **state machine** owns flow (not the model) + **loop detector** (same cmd twice → escalate) + **one command per step** + structured output schema |
| **Coherence — context collapse after ~turn 10** from verbose output | long stdout floods context, agent loses the thread | **output budgeting** (§3): cap + line-filter + summarize before the model sees it; full output stays in the DB, only a digest enters context; **pin the ticket goal every turn** |
| **Coherence — reasoning/action mismatch** | agent's stated plan ≠ command it runs | feed the **actually-executed** command + redacted result back (never the proposed one); evidence-grounded hypotheses must cite the output line |
| **Verification — premature termination / insufficient verification** | agent declares "fixed" without proof; quits early | **closed-loop verify** (§2): capture the BROKEN signal first, prove the SAME signal green after, **re-test after restart** (persistence); `VERIFIED_FIXED` requires evidence, else `LIKELY/NOT_FIXED`; **grader-mirror** before submit |
| **No recovery from command failure / shell-state drift** | one bad command derails the run | each command is isolated + idempotent; failures are observations, not dead-ends; the human gate catches bad commands *before* they run |

**The decisive structural advantage:** the benchmark agents above are **autonomous**. Ours is
**human-in-the-loop** — the technician approves every command, catching wrong targets, bad fixes, and
hallucinated steps *before execution*. A human reviewer on top of a closed-loop verifier is materially
more reliable than the autonomous agents that score <65%. The case *mandates* HITL; we treat it as a
**reliability feature**, not just a safety one.

## 2. The verified diagnose → repair → validate protocol (run for every incident)
A closed loop with **evidence gates**. No step advances on assumption; each must produce concrete evidence
(stored in the audit log). This is standard SRE closed-loop remediation (detect → act → **verify**),
hardened for an LLM.

```
0. PREFLIGHT  connect; confirm OS (/etc/os-release); tool-availability probe; `sudo -n true` check; set clean env
1. DEFINE THE TEST   derive the customer-benefit test from the ticket (e.g. `curl -sS -m5 -I localhost:80` → expect 200)
2. CAPTURE BROKEN    run the test → RECORD the failing evidence (this is the pre-check baseline). If it already passes, stop: nothing to fix.
3. DIAGNOSE          USE-method + service triage; ranked hypotheses; read-only probes; CONFIRM one hypothesis with a concrete output line before touching anything
4. ROOT CAUSE        state the technical cause + cite the evidence line (cause ≠ symptom). Do NOT proceed on a guess.
5. PLAN FIX          minimal · idempotent · durable (config on disk + `systemctl enable`) · reversible. Capture pre-change state (backup file / record prior unit state) = rollback.
6. APPLY (gated)     one change, through the safety gate + human approval
7. POST-CHECK        re-run the SAME test from step 2 → must now be GREEN (the after-evidence)
8. PERSISTENCE       restart the unit (and where feasible reboot — the grader uses `me/reset` which reboots) → re-run the test → still GREEN; `systemctl is-enabled` = enabled
9. NO-REGRESSION     confirm the change was scoped; nothing else broke; no data touched
10. VERDICT          VERIFIED_FIXED only if 7+8 pass with evidence; else LIKELY/NOT_FIXED → iterate or give-up-safely
11. DOCUMENT         activity from the audit log: before-evidence → root cause → change → after-evidence + persistence proof
```

**Give-up-safely** (protects the score floor): if not fixed within the step budget, **revert any partial
change** (rollback), leave the system in a no-regression state, and write an honest partial activity. You
still earn root-cause (1), no-regression (1), and summary (1) points without a fragile workaround that
risks a hard-fail or a reboot-induced regression.

## 3. Two reliability mechanisms worth their own spec

**Tool-availability preflight** (defeats the #1 failure). First diagnostic step runs ONE combined probe:
```
bash -lc 'echo OS=$(. /etc/os-release; echo $VERSION_ID); for t in systemctl journalctl ss curl ps df free grep awk sed nginx psql mysql; do command -v $t >/dev/null && echo have:$t; done; sudo -n true 2>/dev/null && echo SUDO=nopasswd || echo SUDO=needs-password'
```
The result is pinned into context. The agent may then use **only** tools reported present (or absolute
paths), and knows its sudo capability up front. No "command not found" surprises mid-run.

**Output budgeting** (defeats context collapse after turn 10). The SSH executor stores full stdout/stderr
in the DB but returns to the model a **digest**: cap at ~2–4 KB (head + tail), drop noise, and for known
commands extract the signal lines (e.g. `systemctl status` → the `Active:` line + last 5 log lines). Long
observations are summarized into a one-line fact before the next turn. Context stays lean and on-goal.

## 4. SSH / automation hardening (the gotchas that silently break "it works")
These are the boring, decisive details. Bake them into `ssh/executor.ts`.
- **Non-login shell PATH:** ssh2 `exec` gives a minimal, non-interactive shell. Run commands as
  **`bash -lc '<cmd>'`** (login shell → full PATH) or use absolute paths for system binaries. This alone
  removes a large chunk of the 24% "not in PATH" failures.
- **`sudo` without a TTY:** non-interactive sudo throws *"sudo: no tty present and no askpass program"*.
  Use **`sudo -n`** (non-interactive); if it fails, surface "needs password / no passwordless sudo" to the
  technician rather than hanging. **Preflight `sudo -n true`** (§3). Prefer fixes that don't need sudo where
  the service runs as `azureuser` or the file is user-writable. *(Open item: confirm passwordless sudo.)*
- **Exit code is truth, stderr is not failure:** capture the real exit code from ssh2's `exit` event. Many
  tools write to stderr on success (`nginx -t`, `curl -v`). Judge success by **exit code + the expected
  signal**, never "stderr is non-empty."
- **No interactive programs:** append `--no-pager` (systemctl/journalctl), `-n`/`</dev/null`, avoid
  `top`/`vi`/`less`/`watch`/`python` REPL. One non-interactive command per `exec`.
- **Timeouts + kill:** every command gets a timeout (default 30s, hard cap 120s); on overrun, send signal,
  close the channel, mark `timedOut=true`. Never let a hung command stall the loop.
- **Stable parsing:** set `LANG=C LC_ALL=C` for predictable output; `DEBIAN_FRONTEND=noninteractive` for any
  apt; `TERM=dumb`.
- **Connection:** one session per run keyed by `SystemInfo{ip,port,username}` + the `.pem`; **connect
  timeout** (10s) and clear error if the VM is unreachable; key loaded only in the executor, never logged.

## 5. Per-incident verified procedures (the test = the evidence)
For each likely class, the **customer-benefit test** is the before/after evidence. Details + durable-fix
patterns are in [`knowledge/runbooks/`](../knowledge/runbooks/); the discipline is identical: capture
broken → minimal durable fix → prove green → prove persists.

| Class | Benefit test (before/after) | Durable fix pattern | Persistence proof |
|---|---|---|---|
| Service down/disabled | `systemctl is-active X`; `curl -I localhost:PORT` | fix config on disk → `systemctl enable --now X` | `is-enabled`=enabled; restart → still active |
| Config error | `nginx -t` / `X --configtest`; benefit test | edit the specific directive; keep a backup | reload → green; restart → green |
| Port not listening | `ss -ltnp \| grep :PORT` | start/enable the owner service; fix bind addr | restart → still listening |
| Disk / inode full | `df -h`, `df -i` | remove *safe* bloat (old logs via logrotate, not blind `rm`); fix the cause | usage stays down after service runs |
| Permission denied | `sudo -u svc test -r PATH`; benefit test | **targeted** `chown/chmod` on the specific path (never recursive on system dirs) | service reads it after restart |
| Failed dependency / mount | `systemctl list-dependencies`; `mount` | fix unit dep / fstab entry | reboot/restart → mounts + unit ok |
| Cron not running | inspect crontab/timer; check last-run | fix the crontab/timer + perms | timer enabled; next run scheduled |
| Cert / TLS | `openssl s_client`/`curl -I https` | replace/renew cert, fix path in config | restart → handshake ok |
| DB connection refused | app's health/`pg_isready`/socket | start/enable DB; fix listen/socket/perms (**never** drop/reinit data) | restart → app connects |

> Anti-patterns that score 0–1 or hard-fail (do NOT): blind `rm -rf`, recursive `chmod 777`, disabling the
> firewall, dropping/reinitialising a DB, running the app as root to dodge perms, deleting logs. See
> [SAFETY_POLICY.md](SAFETY_POLICY.md).

## 6. What we can and cannot guarantee (honest audit)
"Will NOT fail" is true for the things we control deterministically, and **maximized but not guaranteed**
for the open-ended part. Stating this precisely is the rigorous (non-stupid) position.

**Guaranteed (deterministic, testable):**
- We **never trip a safety hard-fail** — the classifier blocks them and they can't be approved (unit-tested).
- We **never make it worse** — minimal, reversible, scoped changes; capture-before-change; give-up-safely
  reverts partials; no data operations.
- We **never claim a fix without evidence** — closed-loop pre/post + persistence gate the `VERIFIED` verdict.
- We **degrade gracefully** — unreachable VM, missing tool, needs-sudo, or unknown incident → a clear,
  audited, no-regression partial result, not a crash or a dangerous guess.

**Maximized, not guaranteed:** *fully* fixing every one of the 5 hidden incidents. Some will be outside our
runbook coverage or genuinely hard (the benchmarks prove even frontier models miss most). We accept partial
credit by design: root-cause + no-regression + summary points are still earned, and the human + knowledge +
verification stack puts us well above the autonomous baseline.

**Is the concept sound?** Yes. It is rubric-aligned (optimizes B+C = 55%), safe by construction, and its
HITL + closed-loop + knowledge design directly attacks the three documented failure classes. The honest
risk is fix-success variance on unseen incidents — mitigated by the test-scenario harness (measure
held-out fix-rate before the grader does), broad runbook coverage, and graceful degradation. Over-promising
"100% fix" would be the unsound move; "safe, honest, no-regression, maximized fix-rate" is the rigorous one.

## 7. Pre-build reliability checklist (do these or the core silently underperforms)
- [ ] Place the `.pem` in `keys/`; confirm `ssh -i key azureuser@<ip>` connects (manual, once).
- [ ] Preflight script (§3) runs first on every VM; pin OS + tools + sudo capability.
- [ ] Executor wraps commands in `bash -lc`, sets `LANG=C`, enforces timeout + output cap.
- [ ] Every incident: capture broken evidence BEFORE fixing; prove green AFTER; re-test after restart.
- [ ] `tests/safety.test.ts` green (hard-fails blocked, redaction, edited-recheck).
- [ ] One full loop on a **fresh** broken container we didn't develop against.
- [ ] `me/reset` used before a clean grading run (it reboots the VMs → our persistence truth).

## 8. Research notes / sources
- Terminal-Bench failure taxonomy (Execution/Coherence/Verification; "not in PATH" 24.1%; context collapse
  after turn 10): https://arxiv.org/html/2601.11868v1 · https://www.tbench.ai/
- ITBench (SRE agents ~11%): https://github.com/itbench-hub/ITBench
- Closed-loop remediation (detect→act→verify, pre/post checks, idempotence, rollback):
  https://www.netbraintech.com/blog/closed-loop-automation/ ·
  https://www.dynatrace.com/news/blog/closed-loop-remediation-auto-remediation-best-practices/
- sudo no-tty in non-interactive SSH: https://www.simplified.guide/ssh/sudo-no-tty-askpass
- Evidence-grounded RCA (validate hypotheses before concluding; show proof points):
  https://www.splunk.com/en_us/blog/learn/root-cause-analysis.html
- ssh2 exec/exit-code/streams: https://github.com/mscdex/ssh2
- Live Phoenix probe (this session): `/health`=200, `/api/v1/me`=401, `/api/admin/*` + `run-status` enum `TESTING`.
