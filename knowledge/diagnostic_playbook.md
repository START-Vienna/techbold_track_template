# Diagnostic Playbook — the agent's procedure

> The master loop the agent follows for any single-host Ubuntu incident over SSH. Methodology from
> Brendan Gregg (USE method, 60-second checklist), the Google SRE book (Effective Troubleshooting),
> and Ansible idempotency. Per-symptom detail lives in [`runbooks/`](runbooks/). **Diagnose before you
> fix; a runtime change is not a fix; prove persistence before you submit.**

## The loop
```
TRIAGE  →  ISOLATE  →  IDENTIFY ROOT CAUSE  →  FIX (durable)  →  VALIDATE  →  DOCUMENT
  |          |              |                     |               |            |
stabilise  narrow to    5-Whys to the      idempotent,     prove benefit  honest,
+ assess   one resource technical cause    reboot-safe     + persistence  reusable,
severity   /component                       on disk                       no secrets
```
Maps to the SRE model: **Problem report → Triage → Examine → Diagnose → Test & Treat → Cure.** The engine
inside Diagnose is **hypothesize → test (cheap, non-destructive) → bisect**: form a hypothesis, test it,
use the result to halve the search space.

### Diagnostic tactics
- **Recent changes first.** A working system that just broke usually broke because *something changed*
  (deploy, config edit, package update, cert rotation, disk filling). Check `journalctl`, timestamps,
  package history before theorizing exotic causes.
- **Divide and conquer.** Split the request path/stack in half, find the faulty half, recurse.
- **Simplify and reduce.** Test one component with a known input (`curl localhost:PORT/health` instead of
  going through the proxy).
- **Triage before root-cause.** If the customer is down it's fine to mitigate first (e.g. restart) — but
  for a *durable* fix you must still find the technical cause afterward.
- **What it doesn't find matters** — a clean check rules out a branch and directs the next step.

## Step 1 — TRIAGE: the first-60-seconds sweep (Gregg / Netflix)
Run top-to-bottom to get system health before going deep:
```bash
uptime               # load averages (1/5/15m) — trend
dmesg -T | tail      # OOM kills, I/O errors, remount-ro, segfaults  ← disproportionately valuable
vmstat 1 5           # r (runqueue vs CPU), si/so (swap), wa (io wait), b (blocked)
mpstat -P ALL 1 3    # per-CPU balance — one hot CPU = single-threaded bottleneck (if sysstat present)
pidstat 1 3          # per-process CPU over time (if present)
iostat -xz 1 3       # per-disk %util, await, avgqu-sz (if present)
free -m              # available memory; tiny "available" = pressure
sar -n DEV 1 3       # network throughput per interface (if present)
top -b -n1 | head    # cross-check processes/memory/load
```
Then the install-free service + capacity sweep that catches the most common single-host faults:
```bash
df -h; df -i                          # disk + INODES (either at 100% breaks services)
systemctl --failed                    # any failed unit
ss -ltnp                              # what's actually listening
journalctl -p err -b --no-pager | tail -40
```

## Step 2 — ISOLATE with the USE method
For **every** resource check **U**tilization, **S**aturation, **E**rrors. The first error found is often the
answer; saturation usually hurts before utilization hits 100%.

| Resource | Utilization | Saturation | Errors |
|---|---|---|---|
| **CPU** | `vmstat 1` (us+sy+st); `mpstat -P ALL 1`; `pidstat 1` | `vmstat` → `r` > #CPUs; `sar -q` | `dmesg` |
| **Memory** | `free -m`; `vmstat 1`; `sar -r` | `vmstat` → `si`/`so`; `dmesg \| grep -i kill` (OOM) | `dmesg` |
| **Disk I/O** | `iostat -xz 1` (%util); `pidstat -d 1` | `iostat` → `avgqu-sz`>1, high `await` | `dmesg`; `smartctl` |
| **Network** | `sar -n DEV 1`; `ip -s link` | `netstat -s`/`nstat` (drops, listen overflow) | `ip -s link`; `netstat -i` |
| **Disk capacity** | `df -h` (% full); `df -i` (inodes!) | 100% = hard fail | `dmesg` "read-only filesystem" |
| **File descriptors** | `/proc/sys/fs/file-nr`; `lsof -p PID \| wc -l` | near `ulimit -n`/`LimitNOFILE` | logs "Too many open files" |

Service triage (systemd): `systemctl status NAME -l` · `systemctl is-active/is-enabled NAME` ·
`journalctl -u NAME -n 100` / `-p err -b` · `ss -tlnp | grep :PORT` · `systemd-analyze verify NAME.service`.
Then jump to the matching [runbook](runbooks/).

## Step 3 — IDENTIFY ROOT CAUSE (not the symptom)
A **symptom** is the observable failure; a **root cause** is the underlying technical condition that, if
corrected, prevents recurrence. Test: *"If I fix this and reboot, does the symptom come back?"* If yes, you
fixed a symptom. Use **5 Whys** to drill to the deepest *technically-fixable* cause:
```
Symptom: API returns 502s.
1. nginx can't reach the backend.          (symptom)
2. app.service is not running.             (symptom)
3. it crashed at 03:14 and didn't restart. (closer)
4. it hit "Too many open files", unit had Restart=no.   (mechanism)
5. LimitNOFILE was the 1024 default, too low for its connection count.   ← ROOT CAUSE
```
Write the chain: `low LimitNOFILE → FD exhaustion → accept() fails → crash → Restart=no → stayed down →
nginx upstream down → 502`. The durable fix targets the **head** of the chain (raise `LimitNOFILE`, set
`Restart=on-failure`), not the tail (don't just restart nginx).

**Phrasing for `root_cause`:** `<component>` failed because `<technical condition>`, which caused
`<mechanism>`, observed as `<symptom>`. (Past tense, names component + mechanism + why. Not the symptom,
not the action you took.)

## Step 4 — FIX (durable) — rules
**A runtime change is not a fix.** A durable fix changes config-on-disk and is idempotent.

| Concern | Runtime-only (evaporates) | Durable (on disk) |
|---|---|---|
| Service running | `systemctl start NAME` | `systemctl enable --now NAME` |
| Autostart | (manual start) | `systemctl enable NAME` → WantedBy symlink |
| sysctl | `sysctl -w …` | `/etc/sysctl.d/90-fix.conf` → `sysctl --system` |
| FD/proc limits | `ulimit -n …` (shell only) | unit `LimitNOFILE=` / `/etc/security/limits.d/` |
| Firewall | `iptables -A …` | `ufw` rule / `/etc/nftables.conf` |
| Mount | `mount …` | `/etc/fstab` (+ `mount -a` to test) |
| Service config | edit, no reload | edit `/etc/…` → `daemon-reload` + reload/restart |
| Log growth | `truncate`/`rm` a log | `journald.conf SystemMaxUse=` / logrotate config |

Edit units via drop-in, not in place: `systemctl edit NAME` → `/etc/systemd/system/NAME.service.d/override.conf`
→ `systemctl daemon-reload` → `restart`.

**FIX rules:** (1) no runtime-only fixes — every change lands in a file read on boot. (2) persist state
explicitly: `enable --now` (boot + now). (3) idempotent edits only — guard appends (`grep -q || >>`),
prefer in-place key replacement / drop-ins; never blind-append config. (4) order: **unmask → enable →
start**. (5) reload after editing config (`daemon-reload` for units). (6) survive `daemon-reload` + restart,
not just "looks fine now". (7) pass the **run-it-twice test** (second run = no changes). (8) fix the head
of the causal chain. (9) minimal blast radius — touch one thing, re-verify. (10) back up before editing
(`cp file file.bak.$(date +%s)`).

## Step 5 — VALIDATE (prove it works AND persists)
Both halves required: benefit restored **and** it will stay restored.
- **A. Functional** — re-run the customer's test: `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost/health` (or the exact reported symptom, now passing).
- **B. Service state** — `systemctl is-active NAME` → active **and** `systemctl is-enabled NAME` → enabled (both; active-but-disabled fails on reboot); `ss -tlnp | grep :PORT`.
- **C. Persistence** — `systemctl restart NAME; sleep 2; systemctl is-active NAME && curl …/health` (still works after a clean restart).
- **D. Config on disk** — `systemctl cat NAME | grep -E '<changed>'`; `grep -r <key> /etc/sysctl.d/` (value on disk, not just in RAM).
- **E. (Strongest) reboot** if the window allows — then re-run A+B. (This is what the grader does via `POST /me/reset`.) If no real reboot, `systemd-analyze verify` + C + D are the proxy.
- **F. Regression** — `systemctl --failed` (no new failed units); `journalctl -p err -b --since "-5 min"` (no fresh errors); `df -h; free -m; uptime` (no new pressure).

A fix is "validated" only when **A passes after C**, **B shows active+enabled**, **D confirms on-disk**, and
**F shows no regressions**. Record the exact commands + outputs — they become the activity's evidence.

## Step 6 — DOCUMENT (the ERP activity)
Blameless, system-focused, reusable by the next technician, **no secrets**. Map to the ERP fields:
- **summary** — 1 sentence: what broke, impact, resolved.
- **root_cause** — the technical cause from Step 3 (component + mechanism + why), not the symptom; include the causal chain.
- **actions_taken** — numbered, chronological: each step = what + why; distinguish diagnosis from the fix; name the on-disk file changed (proves durability).
- **commands_summary** — the literal commands (diagnosis + fix + validation), sanitized, so the next tech can replay them.
- **validation_result** — the Step-5 proof: benefit test passing, is-active+is-enabled, restart-retest, on-disk confirmation, regression check — with outputs.
- **description** — narrative tying it together; note anything not verified (e.g. "real reboot not performed; restart-retest used as proxy").

**Secrets (hard rules):** never paste passwords, keys, tokens, connection strings, or full auth headers;
redact (`Authorization: Bearer ***`, `PGPASSWORD=***`); refer to credentials by name/location, not value;
sanitize pasted logs (URLs/query strings may echo tokens). See [`safety/command-policy.md`](safety/command-policy.md).

## Idempotency (Ansible model, apply even without Ansible)
Declare desired end-state, not steps. Use native idempotent operations (in-place key replacement / drop-ins
/ guarded appends, not blind `>>`). Gate non-idempotent actions on a marker (`creates`/`removes` analogue).
Order `enable → (unmask) → set state`. Check first, then mutate only what's wrong. The second run must
report **no changes** — if it does work, rewrite it.

## Sources
Gregg: *Linux Performance Analysis in 60,000 ms* (Netflix), *USE Method* + Linux checklist, *Linux Performance*.
Google SRE book *Effective Troubleshooting* + *Postmortem Culture*; SRE Workbook postmortem templates.
Ansible *playbooks_intro* (desired state/idempotency), *check mode*, *systemd_service module*.
Atlassian Incident Handbook; PagerDuty postmortem docs.
