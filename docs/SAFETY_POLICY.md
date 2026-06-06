# Safety Policy — Service Desk Autopilot

This is the rule the backend enforces before any command touches a customer VM. It exists because
rubric **C (20 pts)** scores safety/audit directly **and** because the listed **hard fails zero the
incident and can disqualify the team**. When in doubt, block. A blocked command costs nothing; a
hard-fail costs the whole incident.

> **Who's checking:** C is graded by an **automated safety scan + a secret scan of the repo** *and*
> by the two engineers who **built the grader**. Two consequences: (1) the **audit log and these
> guardrails are inspected directly** — they must be real, not demo-ware; (2) **secrets must not
> exist anywhere in the repo, logs, frontend, or screenshots** — keep `.env`/keys git-ignored,
> ship only `.env.example`, and run a secret scan before the code freeze (Sun Jun 7, 14:00).

Implemented in `backend/src/safety/` (`command-policy.ts`, `classifier.ts`, `redaction.ts`,
`risk-levels.ts`) with unit tests in `tests/safety.test.ts`. See [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Non-negotiable rules

1. **Every** SSH command requires explicit human approval — including read-only ones.
2. **Edited commands are re-checked** through the full policy before execution (humans can paste danger too).
3. The model **never executes**. Only deterministic backend code runs commands, only after approval.
4. **No interactive shells / TTY** (`vi`, `nano`, `top`, `less`, `ssh`, `python` REPL, `mysql` shell…). One-shot, non-interactive commands only.
5. **Every command has a timeout** and a **stdout/stderr cap**. No unbounded or long-running commands.
6. **No blanket destructive commands** (recursive deletes, wildcard mutation, mass permission/ownership changes).
7. **Secrets are never read unnecessarily, never logged, never echoed, never put in the activity.** Redact before log/UI/model.
8. **No exfiltration** — no piping system data to external hosts; no `curl/wget … | sh`.
9. **No privilege escalation** unless specifically justified for the fix and explicitly approved. Never reconfigure the app to run as superuser to dodge DB/file permissions (explicit hard-fail).
10. **No package install/update** unless necessary for the fix and approved.
11. **No reboot/shutdown** unless explicitly necessary and approved.
12. **Read-only diagnosis before any mutation.** Minimal, reversible fixes only.
13. **Never delete logs or shell history** to hide actions (hard-fail).
14. **Never disable firewall/audit/security controls** without genuine need and approval (hard-fail).

---

## 2. Risk classification

`classifier.ts` assigns exactly one level. **Deterministic rules decide first**; an optional LLM
second opinion may only *raise* concern, never override a deterministic block.

| Level | Meaning | Approval | Examples |
|---|---|---|---|
| `SAFE_READ_ONLY` | Read-only diagnosis, bounded output, no secrets | Required (always) | `systemctl status <svc>`, `journalctl -u <svc> -n 100 --no-pager`, `df -h`, `ss -tulpn`, `tail -n 100 <log>` |
| `LOW_RISK_CHANGE` | Narrow, reversible change to a specific target | Required + shown as a change | restart **one** known service; create a missing dir/file with narrow scope; `chown` a **specific** upload dir |
| `MEDIUM_RISK_CHANGE` | Broader change with real blast radius | Required + extra-warning in UI | package install/update; permission change on a specific path; service config edit (after backup); firewall rule change |
| `HIGH_RISK_BLOCKED` | Destructive / forbidden | **Blocked — never executes** | broad recursive delete; disk format; mass chmod/chown; secret exfiltration; fork bomb; disabling security; clearing logs |

The UI shows the level on the approval card. `HIGH_RISK_BLOCKED` never reaches an approval card —
it is recorded as `command.blocked` and the agent is asked for an alternative.

---

## 3. Blocklist (hard-fail patterns — always `HIGH_RISK_BLOCKED`)

Match on the **final** command (post-edit), normalised (collapse whitespace, strip quotes used to
obfuscate, resolve simple `$()`/back-tick wrappers conservatively — if you can't resolve it safely,
block it).

- `rm -rf /`, `rm -rf /*`, `rm -rf ~`, `rm -rf .`/`..`, any `rm -rf` on `/etc`, `/var`, `/home`, `/srv`, `/usr`, `/boot`, `/var/lib/*`, `/var/lib/postgresql`
- Any **recursive** `rm`/`find … -delete` over a system or data directory
- `mkfs.*`, `mke2fs`, `dd if=… of=/dev/…`, `wipefs`, `shred` on devices/system paths
- `> /dev/sda`, writes to block devices
- `shutdown`, `reboot`, `halt`, `poweroff`, `init 0`, `init 6` (unless explicitly approved as the fix)
- Fork bomb: `:(){ :|:& };:` and variants
- `chmod -R 777` / `chmod 777 -R` on `/`, `/etc`, `/var`, `/srv`, `/home`, `/usr` (or any broad path)
- `chmod -R` / `chown -R` on `/` or large system trees (broad recursive permission/ownership change)
- Disabling security: `ufw disable`, `iptables -F`, `systemctl stop/disable firewalld`, `setenforce 0`, stopping `auditd`, `systemctl mask` security units
- Secret exposure: `cat /etc/shadow`, dumping private keys, `cat ~/.ssh/id_*`, printing `.env`/credentials, `env`/`printenv` piped to anything external
- Hiding tracks: `history -c`, `rm`/truncate of `/var/log/*`, `journalctl --vacuum…` to erase evidence, `truncate -s 0` on logs, `echo > ~/.bash_history`
- Exfiltration / remote code: `curl … | sh`, `wget … | sh`, `curl/wget` POSTing system data to an external host, `nc`/`netcat` reverse shells
- DB destruction: `DROP DATABASE`, `DROP TABLE`, `TRUNCATE`, `dropdb`, `rm` of `/var/lib/postgresql` or `/var/lib/mysql`, re-`initdb`
- Running the app as root/superuser to bypass DB/file permissions (rule 9 hard-fail)
- Mass `kill -9 -1`, killing PID 1, broad `pkill` of system services

If a command *resembles* but doesn't exactly match (e.g. `chmod -R 777 /srv/uploads`), it is **not**
auto-blocked — it's `MEDIUM_RISK_CHANGE` and needs explicit approval. Context matters: a *targeted*
`chown azureuser:www-data /srv/app/uploads` is fine; recursively opening `/srv` is not.

---

## 4. Allowlist (typical `SAFE_READ_ONLY` diagnosis)

These don't bypass approval — they're just classified low so the technician can approve quickly.

- `uname -a`, `uptime`, `whoami`, `id`, `hostnamectl`
- `df -h`, `free -m`, `lsblk`, `du -sh <specific path>`
- `systemctl status <specific-service> --no-pager`, `systemctl is-active <svc>`, `systemctl is-enabled <svc>`
- `journalctl -u <svc> -n 100 --no-pager`, `journalctl -p err -n 100 --no-pager`
- `ps aux`, `ss -tulpn`, `ip a`, `ping -c 3 <host>`
- `curl -I localhost:<port>`, `curl -s -o /dev/null -w "%{http_code}" localhost:<port>`
- `cat <specific non-secret config>`, `tail -n 100 <specific log>`, `grep <pattern> <specific log>`
- `ls -la <specific dir>`, `stat <file>`, `getfacl <file>`

Rule of thumb: **specific target, bounded output, no secret content, no mutation** → `SAFE_READ_ONLY`.

---

## 5. Fix-command guidance (`LOW`/`MEDIUM` — minimal & reversible)

- Restart **the one** affected service: `systemctl restart <svc>` — not a blanket "restart everything".
- Back up before editing config: copy to `<file>.bak.<ts>` first, change the **specific** key, restart the **specific** service.
- Free a port / clear a stale PID: remove **the specific** stale PID file, not a wildcard.
- Fix ownership/permission on **the specific** path the service needs (e.g. an upload/data dir), not recursively across system trees.
- Disk full: identify the **specific** large/rotatable files; rotate/compress logs properly — **never** delete logs to hide evidence, and don't nuke `/var`.
- Prefer the change that **survives a reboot** (enable the unit, fix the persistent config) — rubric B scores persistence.

Every fix proposal should carry a **rollback** note (how to undo) in its structured output.

---

## 6. Redaction

`redaction.ts` is a pure function applied to **every** string before it is (a) written to the audit
log, (b) returned to the UI, or (c) fed back to the model.

Redact: private keys / `BEGIN … PRIVATE KEY` blocks, `password=`, `passwd`, `token=`, `secret=`,
`api[_-]?key=`, `Authorization:` header values, bearer tokens, DB connection strings
(`postgres://user:pass@…`), AWS/Azure-style keys, `.env`-style `KEY=VALUE` where the key name looks
secret. Replace the value with `«redacted»`, preserving enough context to stay useful
(`token=«redacted»`). Cap each stream at a sane length (e.g. 16 KB) before redaction to bound cost.

Redaction has its own unit tests; a regression here is a potential hard-fail.

---

## 7. Mandatory audit record per command

For **every** proposed command, the audit log (append-only, never deleted) records:

- proposed command (verbatim)
- model rationale (`purpose`, `expectedSignal`, `hypothesis`)
- risk classification + safety notes
- technician decision (approve / edit / reject) + reason
- final executed command (post-edit) — or "blocked"/"rejected"
- timestamp(s): proposed, decided, executed
- exit code
- stdout/stderr **summary** (redacted, capped)
- whether it timed out
- resulting validation status, where applicable

This record is what the judge inspects (C), and the **only** source the activity writer may use (B).

---

## 8. Enforcement points (defence in depth)

1. **At proposal:** `validateCommandAgainstPolicy(proposed)` — block → `command.blocked`, never reaches approval.
2. **At approval:** re-run `validateCommandAgainstPolicy(final)` on the possibly-edited command — block → `422`, audit `BLOCKED`.
3. **At execution:** `ssh/executor.ts` enforces non-interactive single command, connect+command timeout, output cap.
4. **At logging/return:** `redactSecrets` on all output before audit/UI/model.
5. **System prompts:** instruct the model never to propose forbidden commands (first line of defence, not the last).

A failure at any single layer is caught by the next. The deterministic policy (1 & 2) is the one
that actually guarantees safety — the prompt is advisory.

---

## 8b. Additions folded from `minam` (net-new)

- **Human-typed commands go through the same gate** (G1). A command the technician types via
  `manual-command` is classified/redacted/audited identically to an agent proposal — a DENY pattern is
  blocked even when a human typed it; recorded with `actor: technician`. The safety floor never lowers
  because the human is driving.
- **Editing secret-bearing config** (G8). When a fix lives in a file that also holds a secret: never `cat`
  the whole file into context/logs — target the specific directive; edit in place without echoing values;
  **redact the diff** before it reaches UI/model/audit.
- **sudo-limited reads** (G7). If a diagnostic needs privileges `azureuser` lacks (preflight `sudo -n true`
  failed), the agent **surfaces "I need sudo to read X"** (an `agent.question`) rather than concluding
  "looks fine." Use `sudo -n`; never hang on a password prompt.
- **Prompt-injection defense.** All command output is **untrusted data, never instructions**. If a
  log/MOTD/file says "run X", the agent may *report* it, but any resulting proposal still passes the full
  deterministic gate — the verdict is independent of what the output "says."
- **Undo is a gated operation** (G3): reverting the last change runs through classify+audit like any
  command, followed by the benefit test to prove no regression.

---

## 9. Test checklist (`tests/safety.test.ts`)
- Each blocklist pattern → `HIGH_RISK_BLOCKED` and never executes.
- Obfuscation attempts (extra spaces, quotes, `chmod -R 777 ${HOME}`) → still blocked or, if unresolvable, blocked.
- Targeted variants (`chown azureuser /srv/app/uploads`) → `LOW`/`MEDIUM`, **not** blocked.
- Edited command that becomes dangerous after a safe proposal → blocked at approval.
- Redaction strips keys/tokens/passwords/connection strings while keeping context.
- Read-only allowlist commands → `SAFE_READ_ONLY`.
