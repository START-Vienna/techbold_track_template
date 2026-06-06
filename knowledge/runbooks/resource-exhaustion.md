# Runbook — resource exhaustion (disk, inodes, memory, CPU, FDs)

> Stock Ubuntu over SSH, no installs. Framework: **USE method** — for each resource check Utilization,
> Saturation, Errors. **Golden rules:** Diagnose → find the *producer* → fix the producer → validate
> persistence. Deleting the symptom (`rm` the big file, truncate the log) recurs. **Never delete logs to
> hide actions (safety hard-fail). Never delete customer/app data to free space.** Prefer `truncate` over
> `rm` for files a process holds open (rm leaves the FD allocated; space isn't reclaimed until restart).

## Cheapest-first triage (covers most incidents)
```bash
uptime; df -h; df -i; free -m
dmesg -T | tail -40        # oom? i/o errors? remount-ro? too many open files?
vmstat 1 5                 # si/so (swap), r (cpu runqueue), wa (io wait)
journalctl --disk-usage
```

## 1. Disk full / inode exhaustion
**Diagnose:** `df -h` (Use% 100%); `df -i` (IUse% 100% with Use% low = inode exhaustion); `df -hT` (fs type); `sudo du -xh --max-depth=1 / 2>/dev/null | sort -rh | head` (`-x` stays on one fs) then descend into `/var`; inode hunt `sudo find / -xdev -type d -printf '%h\n' 2>/dev/null | sort | uniq -c | sort -rh | head`; `sudo lsof -nP +L1` (DELETED-but-open files still consuming space); `journalctl --disk-usage`. **Tell:** `df` near-full but `du` sums far less ⇒ deleted-open files or files hidden under a mountpoint.
**Root causes:** unrotated/misconfigured logrotate or app at DEBUG; a process holding a deleted file open; inode exhaustion (millions of tiny files — PHP sessions, mail spool, cache, `/tmp`); journal unbounded (no `SystemMaxUse`); files written under an active mountpoint; docker/overlay layers, apt cache, core dumps.
**Durable fix:** configure rotation at the producer — logrotate drop-in `/etc/logrotate.d/<app>`:
```
/var/log/myapp/*.log { daily rotate 14 compress missingok notifempty copytruncate }
```
Test: `sudo logrotate --debug /etc/logrotate.conf` (dry-run), then `sudo logrotate --force /etc/logrotate.d/myapp`. Cap the journal (§3). For deleted-open files, **restart the owning service** (real reclaim, not `rm`). For inodes, fix the producer (session-GC cron) and lower file churn. Anti-pattern: `rm` the big log (regrows); `rm` a held-open file (no space reclaimed); `df` clean only because you deleted data.
**Validate:** `df -h /var; df -i /var` healthy; `sudo lsof -nP +L1 | wc -l` not growing; `ls -la /var/log/myapp/` shows rotated `*.gz`; `logrotate --debug` parses; `systemctl status logrotate.timer` (cron/timer-driven ⇒ persists).
**⚠ AVOID:** `rm -rf /var/log/*` or deleting the active log a daemon writes (**destroying audit trail = hard-fail**); deleting under mountpoints or `/var/lib/<db>`/app data (**data loss**); `find / -delete` sweeps.

## 2. Filesystem read-only / mount failures
**Diagnose:** `findmnt -rno SOURCE,TARGET,FSTYPE,OPTIONS` / `mount | grep ' ro,'`; `dmesg -T | grep -iE 'ext4|xfs|i/o error|remount|read-only|aborting journal'` (WHY it went ro); `journalctl -k -b | grep -iE 'error|remount-ro'`; `findmnt --verify` (fstab consistency); `lsblk -f`. Ext4 default `errors=remount-ro` flips to read-only **on corruption or I/O error** — a protection, not the disease.
**Root causes:** underlying disk/controller I/O errors (failing disk, bad cable, degraded cloud volume); filesystem corruption (unclean shutdown, journal abort); fstab error (bad UUID/option); block device itself went read-only (volume detach/quota, dm thin-pool full).
**Durable fix:** find the *cause* in `dmesg` first. Hardware I/O errors → the disk/volume is the problem; **don't just remount rw** (you'll re-corrupt). Corruption → unmount and fsck **offline**: `sudo umount /dev/sdXN` → `sudo fsck -y /dev/sdXN` (xfs: `sudo xfs_repair`) → `sudo mount -a`. Root fs → schedule fsck on next boot (`sudo touch /forcefsck`) in a maintenance window; fix fstab with `findmnt --verify` before rebooting. Anti-pattern: `mount -o remount,rw /` to "fix" it while the disk throws I/O errors; editing fstab live without `findmnt --verify` (unbootable host, no SSH recovery).
**Validate:** `mount | grep -w ' rw,'`; `dmesg -T | tail` no new I/O errors; `touch /var/tmp/.wtest && rm /var/tmp/.wtest && echo writable`; `findmnt --verify` (survives reboot).
**⚠ AVOID:** `fsck` on a mounted rw fs (guaranteed corruption); remounting rw over a failing disk; blind fstab edits; `mkfs`/repartitioning anything with data.

## 3. Runaway log growth
**Diagnose:** `sudo du -xh --max-depth=1 /var/log | sort -rh | head`; `sudo ls -lhS /var/log /var/log/*/`; `journalctl --disk-usage`; `sudo lsof -nP /var/log/*.log` (which process writes the offender); `sudo find /var/log -type f -size +500M -exec ls -lh {} +`.
**Root causes:** app stuck logging an error in a hot loop (DEBUG left on); no logrotate rule for a custom app, or rule present but app doesn't reopen post-rotate (keeps writing the renamed inode → rotation a no-op); journald with no cap; syslog + journald double-writing the flood.
**Durable fix:** (1) fix the producer — silence the error loop / set log level to INFO/WARN and restart. (2) logrotate rule (§1) with `postrotate ... systemctl reload <svc>` (or `copytruncate` if no reload hook) so the app reopens its file. (3) cap journald in `/etc/systemd/journald.conf`: `[Journal] SystemMaxUse=500M / SystemKeepFree=1G / MaxRetentionSec=2week` → `sudo systemctl restart systemd-journald`. One-shot reclaim of archived logs: `sudo journalctl --vacuum-size=500M`. Anti-pattern: `> /var/log/app.log` / `truncate -s0` on a loop; deleting the journal dir; rotating without making the app reopen.
**Validate:** `journalctl --disk-usage` below cap; `du -sh /var/log/myapp`; after `logrotate --force`, `lsof -nP -p $(pidof myapp) | grep myapp.log` matches the current (non-deleted) file; `grep SystemMaxUse /etc/systemd/journald.conf` (persisted).
**⚠ AVOID:** **deleting logs to conceal actions = hard-fail**; truncating logs another team needs for the same RCA; disabling logging entirely.

## 4. Memory pressure / OOM killer
**Diagnose:** `free -m` (low available + swap churn = pressure); `vmstat 1 5` (sustained si/so >0 = thrashing); `dmesg -T | grep -iE 'killed process|oom|out of memory'` (victim + why); `journalctl -k -b | grep -i oom`; `ps -eo pid,ppid,rss,pmem,comm --sort=-rss | head`; `cat /proc/meminfo` (MemAvailable, Committed_AS, Slab). The OOM block in `dmesg` prints the task list, chosen victim, `oom_score_adj`, totals.
**Root causes:** leaking/oversized process (heap leak, unbounded cache, JVM/Node with no heap cap, Postgres `work_mem`×connections); overcommit (`vm.overcommit_memory=0`) granting more than RAM+swap; no/exhausted swap (§5); tmpfs/`/dev/shm`/`/tmp` filling RAM; rare kernel slab leak.
**Durable fix:** cap the offending app at the app layer (JVM `-Xmx`, Node `--max-old-space-size`, Postgres `work_mem`/`max_connections`, PHP-FPM `pm.max_children`). Bound it with systemd so a leak can't take the host — drop-in `/etc/systemd/system/<svc>.service.d/mem.conf`: `[Service] MemoryMax=2G / MemoryHigh=1800M` → `daemon-reload && restart` (cgroup-v2, reboot-safe). Protect critical procs: `OOMScoreAdjust=-900` (range **-1000 immune … +1000 first to die**). Add/right-size swap (§5). Anti-pattern: `vm.overcommit_memory=1` without bounding the leak; killing the victim repeatedly; `echo 3 > drop_caches` as a "fix" (page cache is reclaimable).
**Validate:** `free -m` recovered, swap stable; `vmstat 1 5` si/so ~0; `systemctl show <svc> -p MemoryMax -p MemoryCurrent`; `cat /sys/fs/cgroup/system.slice/<svc>.service/memory.max`; `dmesg | grep oom | tail` no NEW events.
**⚠ AVOID:** `kill -9` the DB/critical service (data loss); `oom_score_adj=-1000` on a leaking process (kernel kills something essential like sshd → lockout); disabling the OOM killer globally (`panic_on_oom`); deleting app data to relieve memory.

## 5. Swap issues
**Diagnose:** `free -m` (Swap total 0 = none); `swapon --show`; `cat /proc/swaps`; `vmstat 1 5` (sustained si/so = thrash, not just usage); `cat /proc/sys/vm/swappiness`. Distinguish swap **used** (fine, cold pages parked) from **thrashing** (si/so continuously nonzero, high load).
**Root causes:** no swap → spikes go straight to OOM; real memory shortage (swap is a symptom of §4); swap on slow storage; swappiness mis-tuned.
**Durable fix:** persistent swapfile —
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
Tune swappiness persistently in `/etc/sysctl.d/99-swap.conf` (`vm.swappiness=10` → `sudo sysctl --system`). If thrashing, the real fix is reducing memory demand (§4), not more swap. Anti-pattern: `swapoff -a` under pressure (instant OOM cascade); swapon a temp file without the fstab entry; piling on huge swap to mask a leak.
**Validate:** `swapon --show`; `free -m` cushion; `vmstat 1 5` si/so near 0; `grep swap /etc/fstab` (survives reboot).
**⚠ AVOID:** `swapoff -a` under pressure; swapfile with wrong perms (must be `600`); swap on a near-full root fs that's also the disk incident (§1).

## 6. High CPU / load average
**Diagnose:** `uptime` (1/5/15 load) vs `nproc`; `top -b -n1 | head -20` (%CPU, %wa); `ps -eo pid,ppid,pcpu,pmem,stat,comm --sort=-pcpu | head`; `vmstat 1 5` (r vs cores; high wa = I/O-bound); `ps -eo state,comm | grep -c '^D'` (uninterruptible-sleep = I/O load). **Critical USE distinction:** high load + high `%wa`/many `D`-state = I/O saturation (or NFS hang), **not CPU** — don't chase CPU if I/O-blocked.
**Root causes:** runaway process / infinite loop; I/O-bound work inflating load (failing disk, slow NFS, swap thrash); too many workers > cores (context-switch thrash); cron storm / runaway batch; fork bomb; cryptominer (security); high `%sy` (syscall/interrupt storm).
**Durable fix:** identify the process, fix its config/code — right-size worker counts to cores, fix the loop, throttle the cron. Bound with systemd: `[Service] CPUQuota=150% / CPUWeight=50` in a drop-in → `daemon-reload` + restart (cgroup-v2, reboot-safe). If I/O-bound, fix the storage root cause (§1/§2). Anti-pattern: `renice`/`kill` the symptom while a cron respawns it; rebooting to "clear load" without finding the producer; killing a `D`-state process.
**Validate:** `uptime` load trending ≤ nproc; `top` offender normalized, %wa low; `systemctl show <svc> -p CPUQuota`; `grep -r CPUQuota /etc/systemd/system/<svc>.service.d/`.
**⚠ AVOID:** `kill -9` a stateful service to drop load; mass-killing `D`-state procs; if unknown miner — **capture evidence (`ps`, `ls -la /proc/<pid>/exe`, `ss -tnp`) and report; deleting it to hide an intrusion is a safety failure.**

## 7. File-descriptor / ulimit exhaustion
**Diagnose:** `cat /proc/sys/fs/file-nr` (allocated unused max, system-wide); `ulimit -n` (shell soft limit); per-process `cat /proc/$(pidof myapp)/limits | grep -i 'open files'` and `sudo ls /proc/$(pidof myapp)/fd | wc -l`; `dmesg -T | grep -iE 'too many open files|VFS: file-max'`; `sudo ss -s`. App log `Too many open files`/`EMFILE` = per-process limit; `ENFILE`/`file-max` = system-wide.
**Root causes:** FD leak (sockets/files opened never closed — `/proc/<pid>/fd` climbs); limit too low for legit concurrency (default soft `nofile` 1024); **systemd services ignore limits.conf** — need `LimitNOFILE` in the unit (frequent gotcha); connection pile-up (CLOSE_WAIT/TIME_WAIT).
**Durable fix — match the mechanism to how the process starts:**
- **systemd service** → drop-in `/etc/systemd/system/<svc>.service.d/limits.conf`: `[Service] LimitNOFILE=65536` → `daemon-reload && restart`. (limits.conf does NOT apply to systemd units.)
- **Login/PAM sessions** → `/etc/security/limits.d/90-nofile.conf`: `* soft nofile 65536` / `* hard nofile 65536` (re-login; `pam_limits.so` is default on Ubuntu).
- **System-wide ceiling** (only if `file-nr` max is the wall) → `/etc/sysctl.d/99-fs.conf`: `fs.file-max = 2097152` → `sudo sysctl --system`.
- **And fix the leak** — raising limits only buys time. Anti-pattern: `ulimit -n` in the SSH shell (dies with the session, never reaches the daemon); editing limits.conf expecting a systemd service to pick it up.
**Validate:** `cat /proc/$(pidof myapp)/limits | grep 'open files'` now 65536; `cat /proc/sys/fs/file-nr` well below max; `ls /proc/$(pidof myapp)/fd | wc -l` stable (not climbing); `systemctl show <svc> -p LimitNOFILE` (survives reboot); re-check the count after a few minutes (leak fixed, not just raised).
**⚠ AVOID:** absurd `nofile` (`unlimited`/billions — wedges kernel/huge FD tables); lowering a hard limit below current usage; "fixing" by killing connections.

## Sources
USE Method (Brendan Gregg) · kernel.org admin-guide/sysctl (vm overcommit/oom, fs file-max) · systemd journald.conf / journalctl / systemd.exec / systemd.resource-control · Ubuntu man: logrotate, limits.conf, fstab · util-linux: lsblk, findmnt, swapon, fsck · coreutils/procps: df, du, truncate, free, vmstat, lsof, ss.
