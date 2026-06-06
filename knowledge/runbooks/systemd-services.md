# Runbook — systemd & service lifecycle

> Single-host Ubuntu over SSH · stock tooling only (no installs). Replace `UNIT` with the real unit
> name incl. suffix (`.service`/`.timer`/`.socket`). `sudo` for writes; reads often work unprivileged.
> **Golden rule:** a fix that only changes runtime state (`start`, `set-environment`, `/run/...` drop-in,
> `systemd-run`) does NOT survive reboot. Durable = `enable` + on-disk config in `/etc` + `daemon-reload`.

## Universal first triage
```bash
systemctl --failed                      # all failed units
systemctl status UNIT --no-pager -l     # state, PID, ExecStart, last logs
systemctl is-active UNIT; systemctl is-enabled UNIT; systemctl is-failed UNIT
journalctl -xeu UNIT --no-pager -n 100  # -x catalog hints, -e jump to end (best default)
systemctl cat UNIT                      # EFFECTIVE merged unit (vendor + drop-ins)
systemctl show UNIT -p Id,LoadState,ActiveState,SubState,Result,ExecMainStatus,ExecMainCode,NRestarts
```
Field tells: `LoadState=masked`→blocked · `Result=exit-code`→app non-zero · `Result=start-limit-hit`→restart
rate-limited (cause is upstream; limiter is just the brake) · `Result=oom-kill`→OOM · `ActiveState=activating
(auto-restart)`→crash-looping.

## 1. Service won't start / crash-loops
**Diagnose:** `systemctl status UNIT -l`; `journalctl -xeu UNIT`; `systemctl show UNIT -p Result,ExecMainStatus,ExecMainCode,Restart,RestartSec,StartLimitIntervalSec,StartLimitBurst`; `systemctl cat UNIT` (verify ExecStart path); `test -x <binary>`. Distinguish crash-loop (repeated Started/Failed) vs `start-limit-hit` (the brake, not the cause).
**Root causes:** ExecStart binary missing/not-executable/wrong absolute path (systemd needs absolute paths, no `$PATH`); app exits non-zero (bad config, missing env var, port already bound, missing data dir, perm denied); `Type=` mismatch (`forking` w/o fork or `PIDFile=`; `notify` that never calls `sd_notify`→timeout); OOM kill; `User=`/`Group=`/`WorkingDirectory=` invalid; restart limiter tripped after the real fault.
**Durable fix:** edit via drop-in, never vendor file — `sudo systemctl edit UNIT` → `/etc/systemd/system/UNIT.d/override.conf` → `sudo systemctl daemon-reload`. For races add ordering (`Wants=network-online.target`+`After=network-online.target`), not `sleep`. For crash recovery: `Restart=on-failure`, sane `RestartSec=2s`, widen `StartLimitIntervalSec`/`StartLimitBurst` only if legitimately slow. Clear sticky state: `sudo systemctl reset-failed UNIT` (also resets the start-limit counter).
**Validate:** `daemon-reload`; `reset-failed`; `restart`; `systemctl is-active UNIT`→active; watch `NRestarts` not climb; `journalctl -u UNIT -f`; persistence: `stop`→`start`→`is-active`; throwaway host: `reboot` then `is-active`+`is-enabled`.
**Avoid:** looping `restart` into the limiter (fix cause then `reset-failed`); `Restart=always` to paper over a crash; running the daemon by hand as root (bypasses User=/cgroups, proves nothing).

## 2. Failed or masked units
**Diagnose:** `systemctl is-enabled UNIT` (→masked/disabled/enabled/static); `systemctl status UNIT` ("Loaded: masked"); `systemctl list-unit-files --state=masked`; `readlink -f /etc/systemd/system/UNIT` (masked→symlink to /dev/null); `systemd-analyze verify /etc/systemd/system/UNIT`.
**Root causes:** explicitly masked (symlink to /dev/null); masked drop-in (zero-byte/`/dev/null` file in `UNIT.d/`); generated/aliased confusion (`static` units have no `[Install]`, can't `enable` directly); leftover failed state.
**Durable fix:** `sudo systemctl unmask UNIT`; `sudo systemctl reset-failed UNIT`; `sudo systemctl daemon-reload`. Prefer `disable` over `mask` unless you truly need a hard block.
**Validate:** `is-enabled UNIT` no longer 'masked'; `start UNIT`; `is-active UNIT`.
**Avoid:** `rm`-ing the /dev/null symlink by hand (use `unmask`); masking a unit others `Requires=` (cascades).

## 3. Dependency / ordering failures
**Diagnose:** `journalctl -u UNIT -b | grep -iE 'depend|order|required|not found|failed to'`; `systemctl show UNIT -p Requires,Wants,BindsTo,After,Before,Conflicts,WantedBy`; `systemctl list-dependencies UNIT [--reverse]`; `systemd-analyze verify /etc/systemd/system/UNIT`. Classic tell: starts before network/DB ready, or a `Requires=` target is itself failed/masked.
**Root causes:** ordering (`After=`/`Before=`) confused with pulling-in (`Requires=`/`Wants=`) — ordering alone doesn't pull a unit; requirement alone doesn't order it; depending on `network.target` (link up) when you need `network-online.target` (routable) and forgetting `Wants=` it; hard `Requires=`/`BindsTo=` on a failing unit tears yours down; typo'd dep name (implicit failing dep); missing `WantedBy=` in `[Install]`→enable is a no-op.
**Durable fix (drop-in):**
```ini
[Unit]
Wants=network-online.target
After=network-online.target postgresql.service
Requires=postgresql.service
```
then `sudo systemctl daemon-reload`. (List deps like `After=` can't be reset-to-empty in a drop-in; use `systemctl edit --full UNIT` to fully redefine.)
**Validate:** `systemctl show UNIT -p After,Wants,Requires`; `restart`+`is-active`; throwaway host `reboot`→`is-active` proves boot ordering.
**Avoid:** `ExecStartPre=/bin/sleep N` for ordering (fragile); `Requires=` where `Wants=` suffices (cascades).

## 4. Bad ExitCode / interpreting failure
**Diagnose:** `systemctl show UNIT -p ExecMainStatus,ExecMainCode,Result`; `journalctl -u UNIT -b -p err`; grep for `oom|killed|core dump|segfault|permission|No such file`.
Codes: `ExecMainCode=exited`+`status=N`→app exit N (`203/EXEC` binary not found, `200/CHDIR`, `217/USER`, `226/NAMESPACE` sandbox mis-set); `ExecMainCode=killed`+`SIGNAL`→killed (KILL=9 OOM/timeout, SEGV=11); `Result=timeout`→`notify`/`forking` readiness never signaled.
**Durable fix:** correct the underlying unit/config in a drop-in (path for 203, `User=` for 217, relax sandbox for 226, raise `TimeoutStartSec=`/`MemoryMax=` for OOM/timeout); `daemon-reload`.
**Validate:** `restart` then `systemctl show UNIT -p Result,ExecMainStatus`→`success`/`0`.
**Avoid:** blindly bumping timeouts to hide a hang; confirm the app actually reaches ready.

## 5. Config reload vs restart
- `systemctl reload UNIT` — re-reads app config without dropping the process; use when `CanReload=yes` and you changed only the app's own config files.
- `systemctl restart UNIT` — required when you changed the **unit** (`ExecStart`, `Environment=`, deps) or the app has no reload.
- `reload-or-restart` picks automatically.
- **Editing a unit/drop-in requires `systemctl daemon-reload`** to reparse — a plain reload/restart of the service does NOT pick up unit-file changes by itself.
- Persist app config to its on-disk file then `reload`; don't rely on live `systemctl set-environment` (lost on reboot).
**Validate:** `daemon-reload` (if unit edited) → `reload` → `is-active` → `journalctl -u UNIT -n 20` shows "Reloaded".

## 6. Reading journald
```bash
journalctl -u UNIT -b                 # current boot, this unit
journalctl -xeu UNIT                  # catalog hints + jump to end
journalctl -u UNIT --since "10 min ago"
journalctl -u UNIT -p warning..emerg  # priority filter (err=3, warning=4)
journalctl -u UNIT -f                  # live follow
journalctl -u UNIT -o cat             # message-only (clean copy)
journalctl --list-boots; journalctl -b -1 -u UNIT   # previous boot (post-crash)
journalctl -k                          # kernel ring (OOM, segfault, hardware)
journalctl --disk-usage
```
Surfaces: stack traces, `Permission denied`, `Address already in use` (pair with `ss -ltnp | grep :PORT`), `Out of memory: Killed process`. If logs vanish after reboot the journal is volatile: persist durably via `/var/log/journal` + `[Journal] Storage=persistent` in `/etc/systemd/journald.conf` → `systemctl restart systemd-journald`. **Avoid `journalctl --vacuum-*`/`--rotate` during an active incident — may delete needed evidence.**

## 7. Enabling at boot
**Diagnose:** `systemctl is-enabled UNIT`; `systemctl list-unit-files --state=enabled | grep UNIT`; `systemctl get-default`; `systemctl cat UNIT | grep -A3 '\[Install\]'` (needs `WantedBy=` to be enableable). Symptom: runs after manual `start` but dead after reboot → not enabled / no `[Install]`.
**Root causes:** never `enable`d (start is runtime-only); `static` unit (no `[Install]`); enabled but masked elsewhere; socket-activated unit needs the `.socket` enabled, not the `.service`.
**Durable fix:** `sudo systemctl enable UNIT` (writes WantedBy symlink on disk) or `sudo systemctl enable --now UNIT`. For a `static` unit add `[Install] WantedBy=multi-user.target` via `systemctl edit --full UNIT`, then enable.
**Validate:** `is-enabled UNIT`→enabled; `ls -l /etc/systemd/system/multi-user.target.wants/UNIT`; throwaway host `reboot`→`is-active`+`is-enabled`.
**Avoid:** editing `*.target.wants/` symlinks by hand; assuming `start` persists (it doesn't — only `enable` writes the boot symlink).

## 8. Drop-ins / overrides — precedence
**Inspect:** `systemctl cat UNIT` (vendor then drop-ins, in load order); `systemd-delta [--type=extended]`; `ls -l /etc/systemd/system/UNIT.d/ /run/systemd/system/UNIT.d/`; `systemctl show UNIT -p <Property>` (effective value).
**Precedence (dir, highest wins):** `/etc/systemd/system/UNIT.d/` (admin) > `/run/systemd/system/UNIT.d/` (runtime, volatile) > `/usr/lib|/lib/systemd/system/UNIT.d/` (vendor). Across dirs, files merge in **lexicographic filename order** (`10-`,`20-`…). Most settings last-wins; **list settings** (`After=`,`Environment=`,`ExecStartPre=`) *append* — to clear, assign empty once then re-add; `ExecStart=` must be cleared before re-setting.
**Durable fix:** `sudo systemctl edit UNIT` (admin drop-in in `/etc`, survives reboot + pkg upgrade) → `daemon-reload`. Anti-patterns: `/run/...` drop-ins are runtime-only; editing the vendor file in `/lib` is clobbered on upgrade.
**Validate:** `systemctl cat UNIT` (override appears last); `systemctl show UNIT -p <ChangedProperty>`; `restart`+`is-active`.
**Avoid:** forgetting `daemon-reload` after on-disk edits; duplicate-named drop-ins across dirs (silent shadowing — `systemd-delta` reveals it).

## 9. Timers (cron replacement)
**Diagnose:** `systemctl list-timers --all`; `systemctl status UNIT.timer`; `systemctl cat UNIT.timer` (OnCalendar=/OnBootSec=/Persistent=); `journalctl -u UNIT.service -b`; `is-enabled`/`is-active UNIT.timer`; `systemd-analyze calendar "<expr>"` (validate & show next elapse). Symptom: job never runs → timer not enabled, bad `OnCalendar=`, paired `.service` failing, or missed-while-off with `Persistent=` unset.
**Root causes:** enabled the `.service` instead of the `.timer`; malformed `OnCalendar=`; the triggered `.service` itself fails; missing `Persistent=true` so a missed wallclock run isn't caught up; monotonic `OnBootSec=` used where wallclock `OnCalendar=` was meant.
**Durable fix:** `.timer` + matching `.service` (same basename) in `/etc/systemd/system`:
```ini
# UNIT.timer
[Unit]
Description=Run UNIT daily
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
```
`sudo systemctl daemon-reload && sudo systemctl enable --now UNIT.timer` (enable the TIMER, not the service).
**Validate:** `is-enabled UNIT.timer`→enabled; `list-timers UNIT.timer` shows sane NEXT; `start UNIT.service` to dry-run; `journalctl -u UNIT.service -n 30`.
**Avoid:** testing by changing the system clock (use `systemd-analyze calendar` / manual `start`); a leftover crontab doing the same job.

## Cross-cutting "do not"
- Never edit `/lib|/usr/lib/systemd/system/` (clobbered on upgrade) — use `/etc` drop-ins.
- Always `daemon-reload` after on-disk unit changes.
- Runtime (`start`/`set-environment`/`/run`/`systemd-run`) = gone on reboot; durable (`enable`/`/etc`/on-disk) = survives.
- `reset-failed` after fixing clears failed state + start-limit counter.
- Prove persistence: `is-active`+`is-enabled`, a `stop`→`start` cycle, and on a disposable host a real `reboot`.

## Sources
systemd.unit · systemd.service · systemctl · journalctl · systemd.timer · systemd-analyze · systemd.exec ·
journald.conf (all at freedesktop.org/software/systemd/man/latest/) · Arch Wiki Systemd & Systemd/Timers ·
Ubuntu Server docs · Red Hat "Managing systemd" · systemd issue #10529 (start-limit/reset-failed).
