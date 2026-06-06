# Knowledge Pack

Install-free Linux troubleshooting knowledge that gives the agent a **method + runbooks + a safety
ruleset**, so it generalizes to *unseen* incidents instead of guessing or hard-coding. Built from a
deep research pass over authoritative sources (Brendan Gregg / USE method, Google SRE book, systemd &
Ubuntu docs, PostgreSQL/MySQL/nginx docs, OWASP/CIS/NIST, gitleaks/detect-secrets/trufflehog).

> Real-world finding that motivates this pack: *"the runbooks mattered more than the model — without
> runbooks the model just guesses."* The method + runbooks are the agent's edge on hidden VMs (scoring B).

## Contents
```
knowledge/
├─ diagnostic_playbook.md     # THE master procedure: triage → isolate (USE) → root cause (5 Whys)
│                             #   → durable fix → validate (incl. persistence) → document
├─ runbooks/
│  ├─ systemd-services.md         # won't start / crash-loop, masked, deps, exit codes, reload, timers, drop-ins
│  ├─ networking-web-tls.md       # ports/bind, firewall, DNS/resolved, connectivity, nginx/apache, 502/504, TLS certs
│  ├─ resource-exhaustion.md      # disk/inodes, ro-fs, log growth, OOM/memory, swap, CPU/load, FD limits
│  └─ data-access-scheduling.md   # postgres/mysql, file perms (targeted), sudo, cron/timers, app config, AppArmor/SELinux
└─ safety/
   └─ command-policy.md       # DENY taxonomy (maps to the hard-fails), 3-tier classify, secret redaction, audit/least-priv
```
Every runbook section follows the same shape: **Diagnose (exact stock-Ubuntu commands) → Root causes
(technical, not symptom) → Durable fix vs fragile anti-pattern → Validate (proves fix + persistence) →
⚠ Avoid (dangerous actions / safety hard-fails)**.

## How the agent uses it (wiring guide for Fathy & Khaled)
- **System prompt / ANALYZE phase:** embed `diagnostic_playbook.md` (the loop, the 60s sweep, the USE
  table, the root-cause-vs-symptom rule, the FIX persistence rules, the VALIDATE checklist).
- **Per-ticket context (DIAGNOSE/FIX phases):** classify the symptom from the ticket + first probes, then
  inject the **one or two relevant runbook files** as context (cheap routing by keyword/symptom — e.g.
  "502"/"nginx" → networking-web-tls; "disk full"/"won't start" → resource-exhaustion + systemd). Don't
  dump all four every turn — retrieve the relevant slice.
- **Safety layer (independent of the agent):** `safety/command-policy.md` is the spec for
  `safety/policy.py` (the DENY/CONFIRM/ALLOW classifier + rules) and `safety/redact.py` (the `redact()`
  function — the regex set is ready to lift). The deny taxonomy maps 1:1 to the rubric's hard-fail list.
- **VALIDATE/grader-mirror phase:** the validation checklists are what the agent (and the grader-mirror)
  re-run to prove the fix works *and persists* — including the restart-and-retest that mirrors the
  grader's `POST /me/reset` reboot.
- **DOCUMENT phase:** the activity-field guidance in the playbook (root_cause phrasing, no secrets) drives
  the activity generator.

## Hard constraints baked into every file (techbold scoring)
- **Persistence:** a runtime-only change is NOT a fix — config on disk + `systemctl enable` + restart-retest.
  (Caps fix-score otherwise.)
- **Minimal changes:** prefer tools already on stock Ubuntu; no unnecessary installs on customer VMs;
  targeted `chown`/`chmod`/one config line, never blanket/recursive on system roots.
- **No hard-fails:** never delete DBs/customer data, `chmod -R 777` system dirs, disable firewall/audit,
  expose secrets, or wipe logs/history. Each runbook calls out the safe **targeted** alternative.
- **No secrets:** redact before logging/showing/submitting; the SSH key never leaves the SSH runner.

## License hygiene
This pack is **original prose** summarizing public methodology and docs — no GPL source is copied. Heavy
GPL tools (monitoring-plugins, Lynis, osquery, sosreport) are referenced as inspiration and used only in
our **dev test harness**, never installed on customer VMs. Safe to ship in an MIT repo.
