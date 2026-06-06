# Safety Policy Reference — command gating & secret redaction

> Source material for the **safety layer** (the module between the agent and the shell). The agent's
> proposed command is **untrusted input** — the LLM proposing it is NOT approval. Architecture:
> **never a single regex blocklist.** Layer: (a) tokenize/parse → (b) hard-block deny patterns →
> (c) allowlist of known-safe verbs → (d) everything else → human approval → (e) sandboxed/least-priv
> execution → (f) secret-redacted append-only audit log. **Fail closed:** if a command can't be parsed
> into known tokens (or contains `eval`/encoded blobs), it goes to human approval, never auto-run.

These map directly to techbold's scoring hard-fails (each can zero an incident or disqualify): deleting/
reinitialising a DB or customer data · blanket `chmod -R 777` on system dirs · deleting critical dirs ·
disabling firewall/audit/security · reading/logging/exposing secrets · wiping logs/history · running as
superuser to bypass DB perms.

## Normalize before matching
Match against the **parsed/normalized** command, not the raw string (raw regex is bypassed by `r""m`,
`rm${IFS}-rf`, base64-decode-pipe, aliases, symlinks). Expand quotes, strip comments, resolve `$IFS`/`\`
escapes, **resolve `..` and symlinks to absolute paths**, split compound commands on `;` `&&` `||` `|`
`$(...)` backticks, and evaluate **each** sub-command. Patterns are case-insensitive, whitespace-tolerant
(`\s+`), flag-order-insensitive (`-rf`/`-fr`/`-r -f`/`--recursive --force`).

## DENY taxonomy (hard-block + escalate)

### 1. Recursive deletion of system/data paths
- `\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive\b.*--force)\b` targeting `/`, `/*`, `/etc`, `/var`, `/var/lib`, `/var/lib/postgresql`, `/var/lib/mysql`, `/home`, `/boot`, `/srv`, `/usr`, `/lib`, `/bin`, `/opt`, `/root`, `~` — irreversible mass deletion / OS or DB destruction / unbootable host.
- `rm -rf --no-preserve-root /` — deliberately defeats coreutils' `/` guard.
- `\brm\s+-[rf]+\s+\$\{?\w+\}?/` — variable-rooted recursive rm where `$DIR` may be empty → `rm -rf /` (the classic empty-variable footgun). Block any recursive rm whose path root is an unbounded variable.
- `\bfind\s+/.*-delete\b` / `find / ... -exec rm` — aliased mass-delete that evades naive `rm` rules.
- **Context:** `rm -rf /app/tmp/build-cache`, `rm -rf ./node_modules` are FINE. Discriminator = the *resolved absolute target root*: block when it's a system root / top-level data dir; allow under an app/work dir with no `..` escape.

### 2. Fork bombs / resource exhaustion
- `:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:` (`:(){ :|:& };:`) and any `f(){ f|f& }` — exponential spawn → DoS.
- `\bwhile\s+true\s*;\s*do\b` with `&` and no bound; `\byes\b.*>` to a file/device; `cat /dev/zero >` — unbounded CPU/disk fill.

### 3. Disk / filesystem destruction
- `\bdd\b.*\bof=/dev/(sd[a-z]|nvme\d+n\d+|vd[a-z]|mapper/)` — raw block-device overwrite.
- `\bmkfs(\.\w+)?\s+.*/dev/` — reformat → total data loss.
- `\bwipefs\b`, `\bsgdisk\s+(-Z|--zap-all)`, `\bparted\b.*\b(rm|mklabel)`, destructive `\bfdisk\b`, `\bshred\b.*/dev/`, `\bblkdiscard\b` — destroy partition tables/signatures.
- **Context:** `dd if=image.iso of=/tmp/x.img` (file target) is benign. Block only when `of=`/target is a **block device** (`/dev/sd*`,`/dev/nvme*`,`/dev/vd*`,`/dev/mapper/*`,`/dev/disk/*`).

### 4. Blanket permission/ownership on system dirs
- `\bchmod\s+(-[a-z]*R[a-z]*\s+)?0?777\b` on `/`,`/etc`,`/usr`,`/var`,`/bin`,`/lib`,`/boot`,`/home`, or recursive on system roots — world-writable → privilege escalation; breaks sshd/sudo (refuse loose perms).
- `\bchmod\s+-[a-z]*R.*\s+/(etc|usr|var|bin|lib|boot)\b` and `\bchown\s+-[a-z]*R.*\s+/(etc|usr|var|bin|lib|boot|$)` — mass perm/owner change corrupts the system model, breaks setuid binaries.
- **Context:** `chown -R appuser:appgroup /var/www/uploads`, `chmod 750 /opt/myapp/uploads` are FINE. Discriminator: mode `777`/world-writable on a sensitive dir? OR recursive AND rooted at a system path? A targeted, non-777 chown/chmod on an explicit app sub-dir → normal approval, not hard-block.

### 5. Disabling security controls (hard-block even if targeted)
- `\bufw\s+disable\b`, `\bsystemctl\s+(stop|disable|mask)\s+(firewalld|ufw|nftables|iptables)`, `\biptables\s+-F\b`, `\bnft\s+flush\s+ruleset` — drops the firewall.
- `\bsystemctl\s+(stop|disable|mask)\s+auditd`, `\bauditctl\s+-D\b` — disables audit logging (blinds detection + your own trail).
- `\bsetenforce\s+0\b`, `SELINUX=disabled`, `\bsystemctl\s+(stop|disable)\s+apparmor`, `\baa-disable\b`, `\baa-teardown\b` — disables MAC confinement.
- `\bsystemctl\s+(stop|disable)\s+(fail2ban|clamav|sshd)` — disables IPS/AV; stopping `sshd` can lock you out.
- `\bchattr\s+-i\b` on protected files — removes immutability before tampering.

### 6. Database destruction
- `(?i)\bDROP\s+DATABASE\b`, `(?i)\bDROP\s+SCHEMA\b`, `\bdropdb\b`, `\bmysqladmin\s+drop\b` — deletes a DB/schema.
- `(?i)\bTRUNCATE\s+(TABLE\s+)?\w+`, `(?i)\bDELETE\s+FROM\s+\w+\s*(;|$)` (DELETE with no WHERE) — wipes rows.
- `\binitdb\b`, `\bpg_resetwal\b`, `(?i)DROP\s+(TABLE|USER|ROLE)` — `initdb`/`pg_resetwal` over an existing cluster can corrupt.
- `\bredis-cli\s+(FLUSHALL|FLUSHDB)`, `\bmongo.*\.(drop|dropDatabase)\(\)` — NoSQL wipe.
- **Context:** `DROP TABLE tmp_import_staging` in a window may be legitimate → "requires explicit human approval naming the exact target" tier; `DROP DATABASE`/`TRUNCATE` on production names → hard-block.

### 7. History / log wiping (anti-forensics — hard-block + alert)
- `\brm\b.*\s/var/log(/|\b)`, `>\s*/var/log/\w+`, `\btruncate\s+-s\s*0\s+/var/log/` — destroys system logs (and your evidence).
- `\bhistory\s+-c\b`, `>\s*~?/\.bash_history`, `\bunset\s+HISTFILE`, `export\s+HISTSIZE=0` — shell-history wiping.
- `\bjournalctl\s+--vacuum-(time|size)`, `\bjournalctl\s+--rotate`, `\brm\b.*/var/log/journal`, journal truncation.
- `>\s*/var/log/(wtmp|btmp|lastlog|auth\.log|secure)` — removes login records.
- There is essentially no legitimate autopilot reason to erase audit history.

### 8. Remote-code / pipe-to-shell
- `\b(curl|wget|fetch)\b[^|]*\|\s*(sudo\s+)?(bash|sh|zsh|python[23]?|perl|ruby|node)\b` — `curl … | bash` runs unaudited remote code.
- `\bbash\s+<\(\s*curl`, `\bsource\s+<\(curl`, `\beval\b.*\$\(.*\b(curl|wget)` — process-sub / eval variants.
- `\bbase64\s+-d.*\|\s*(bash|sh)`, `echo\s+[A-Za-z0-9+/=]{40,}\s*\|\s*base64\s+-d\s*\|\s*sh` — obfuscated payload.
- `\bnc\b.*-e\b`, `bash -i >& /dev/tcp/`, `mkfifo … | nc …` — reverse shells.

### 9. Overwriting critical files
- `>\s*/etc/(passwd|shadow|group|gshadow|sudoers|fstab|hosts|resolv\.conf|ssh/sshd_config|crontab)` (truncating `>`) — destroys identity/auth/mount/DNS/sudo config; can lock out all users / break boot.
- `\btee\s+/etc/(passwd|shadow|sudoers)` — `tee` as a redirect bypass; non-interactive `visudo`/writes to `/etc/sudoers.d/*` granting NOPASSWD.
- `>\s*~/.ssh/authorized_keys`, `>\s*/etc/(profile|environment|ld\.so\.conf)` — persistence/hijack.
- **Context:** distinguish truncating `>` (dangerous) from appending `>>` (often fine, e.g. a line to `/etc/hosts`). Any write to `/etc/{passwd,shadow,sudoers}` → hard-block; appends to `/etc/hosts` → approval.

### 10. Privilege-bypass / persistence
- `\bchmod\s+(u\+s|4[0-7]{3}|g\+s)\b` on a binary — setuid-root backdoor.
- `\bsudo\b.*\bsu\s*-`, `sudo -i`, `sudo bash` proposed by the agent — escapes the gated-command model into an interactive root shell.
- `\buseradd\b.*-o.*-u\s*0` (UID-0 user), `usermod -aG sudo`, editing `/etc/sudoers` — backdoor/priv grant.
- `cron`/`at`/`systemd-run` installing a job re-exec'ing untrusted code — persistence.
- `\bexport\s+LD_PRELOAD=`, `LD_LIBRARY_PATH=` injection, writing `/etc/ld.so.preload` — library-injection backdoor.

## Three-tier classification
- **DENY** — matches §1–10 → block + escalate; cannot be approved (or requires a typed override not exposed in the demo).
- **CONFIRM** — `systemctl restart`, package installs, edits under `/etc`, `kill`, `sudo` writing outside the app's own dirs, targeted `DROP TABLE` → human approval naming the exact target.
- **ALLOW** — non-escaping read/diagnostic verbs (`systemctl status/cat/show`, `journalctl`, `ss`, `ls`, `stat`, `df`, `free`, `cat` of non-secret config, `nginx -t`, `getfacl`, `namei`) → may auto-pass / batch-approve. Even ALLOW still passes through the gate and is logged.

## Prior art (compose, don't pick one)
- **sudoers `Cmnd_Alias`** — exact-command allowlist; weakness: an allowlisted binary that can shell out or take a file-write arg reintroduces risk.
- **OPA / Rego** — policy-as-code, `default allow := false`, deny-overrides; versionable + testable (`opa test`). You must tokenize the command before sending it the structured input.
- **Shell AST parsers** — `bashlex` (Python), `mvdan/sh` (Go, most production-grade), `tree-sitter-bash` — reason over real tokens/redirections/pipelines; defeats obfuscation. **Recommended for our parse step.**
- **explainshell** — token→man-page meaning; great to *show the approver* what `-rf`/`--no-preserve-root`/`of=` mean (UX/explainability, not enforcement).
- **Sandboxing** — `bubblewrap`/`firejail`/seccomp/namespaces/gVisor, read-only bind mounts, low-priv account, drop capabilities.
- **Agent tool-approval** — Anthropic/OpenAI human-in-the-loop permission patterns; NeMo Guardrails, Guardrails AI, Llama Guard.

| Approach | Strengths | Weaknesses |
|---|---|---|
| Regex blocklist | fast, catches obvious cases | trivially bypassed by obfuscation; fails **open** |
| AST/tokenize | robust to obfuscation, sees structure | dynamic `eval`/runtime vars unresolvable → fail closed |
| Allowlist (default-deny) | strongest; fails **closed** | higher friction; curate; escaping binaries reintroduce risk |

**Recommended composition:** AST-parse → run §1–10 deny per normalized sub-command (fail closed if unparseable) → check `argv[0]` against the curated non-escaping allowlist → else human approval → execute sandboxed + least-priv → redact → append-only audit.

## Secret detection & redaction
Run **before** any output reaches the model or the log. Regex detectors **+** entropy gate (base64 ≥4.5,
hex ≥3.0) **+** keyword detector near `=`/`:`. Replace with `«REDACTED:<type>»`. **Fail safe: when in doubt,
redact. Never "verify" a found secret (that would transmit it).** Distilled from gitleaks / Yelp
detect-secrets / trufflehog (summarized, not copied).

```python
import re
REDACTION_RULES = [
    ("aws_access_key_id", r"(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"),
    ("aws_secret_access_key", r"(?i)aws_secret_access_key\s*[=:]\s*[\"']?[A-Za-z0-9/+=]{40}[\"']?"),
    ("private_key_pem",
     r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"
     r"[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    ("jwt", r"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    ("auth_header", r"(?i)authorization\s*:\s*(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}"),
    ("bearer_token", r"(?i)bearer\s+[A-Za-z0-9._~+/=-]{20,}"),
    ("connstring_password",
     r"(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?|ftp)://[^:@/\s]+:([^@/\s]+)@"),
    ("pgpassword_env", r"(?i)\bPGPASSWORD\s*=\s*\S+"),
    ("generic_secret",
     r"(?i)(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|"
     r"client[_-]?secret|private[_-]?token)\s*[=:]\s*[\"']?([^\s\"']{6,})[\"']?"),
    ("dotenv_secret", r"(?im)^\s*[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*\s*=\s*\S+"),
    ("github_token", r"(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}"),
    ("gitlab_pat", r"glpat-[A-Za-z0-9_-]{20,}"),
    ("slack_token", r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    ("google_api", r"AIza[0-9A-Za-z_-]{35}"),
    ("stripe_live", r"sk_live_[0-9a-zA-Z]{16,}"),
    ("openai_key", r"sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
    ("anthropic_key", r"sk-ant-[A-Za-z0-9_-]{20,}"),
    ("hex_secret_32", r"\b[0-9a-fA-F]{32,}\b"),     # gate with hex-entropy >= 3.0
]
_COMPILED = [(n, re.compile(p)) for n, p in REDACTION_RULES]

def redact(text: str) -> str:
    for name, rx in _COMPILED:
        if name in ("connstring_password", "generic_secret") and rx.groups:
            text = rx.sub(lambda m: m.group(0).replace(m.group(1), f"«REDACTED:{name}»"), text)
        else:
            text = rx.sub(f"«REDACTED:{name}»", text)
    return text
```
- **Entropy-gate** the broad rules (`generic_secret`, `hex_secret_32`, base64 blobs) to cut false positives.
- The **SSH private key** is loaded only inside the SSH runner and is never logged or sent to the model.

## Audit log & least-privilege execution
- **Append-only, tamper-evident:** `chattr +a` the log file and/or ship to a write-once store; hash-chain records (`hash_n = H(record_n || hash_{n-1})`); forward off-host so a compromised target can't erase its trail. The agent's own account must not have delete/rotate rights on the audit log.
- **Per command, one structured JSON record:** UTC timestamp + session/correlation id + target host; the exact executed (normalized) command + argv + cwd; approver identity + approval time + decision (allowlist-auto / human-approved / denied) + which rule matched; agent/model id + the original NL request; exit code + duration + **redacted** stdout/stderr; effective uid/gid + sandbox profile.
- **Least privilege:** run as a dedicated low-priv account, not root; elevate only via tightly scoped `sudoers` `Cmnd_Alias` (no shell-out wildcards); drop capabilities + seccomp + sandbox with read-only mounts; prefer argv-exec (`execve`/`ProcessBuilder`) over `system()` — no shell interpolation (kills `;`/`&&`/`$()` injection).
- **Execution hygiene:** **timeout every command** (`timeout 60s …`, kill the process group); **non-interactive flags only** (`apt-get -y`, `DEBIAN_FRONTEND=noninteractive`, `psql -v ON_ERROR_STOP=1 --no-password`, `ssh -o BatchMode=yes`) — a command that *would* prompt is rejected, not auto-answered; **never pass secrets in argv** (visible via `/proc/<pid>/cmdline`) — use credential files / scoped env / stdin; apply `ulimit`/cgroup caps so a missed fork-bomb/disk-fill is still contained.

## Implementation checklist
1. **Parse** to AST (`bashlex`/`mvdan-sh`), split sub-commands, normalize; **fail closed** on unparseable / `eval` / encoded blobs.
2. **Hard-block** any sub-command matching the DENY taxonomy; show an explainshell-style breakdown to the approver.
3. **Allowlist auto-pass** only non-escaping read/diagnostic verbs; everything else → human approval (OPA default-deny, versioned + `opa test`).
4. **Execute** sandboxed, low-priv, timeout + non-interactive + ulimits + capability drops.
5. **Redact** stdout/stderr before model/log.
6. **Log** append-only, tamper-evident, off-host, with approver + decision + rule provenance.

## Sources
OWASP OS Command Injection Defense / Injection Prevention / Logging cheat sheets; OWASP Top 10:2025 A05 ·
CIS Benchmarks (filesystem perms, auditd, firewall) · NIST SP 800-53 (AU, AC-6) & SP 800-92 (log mgmt) ·
OPA docs/repo · bashlex, mvdan/sh, tree-sitter-bash, explainshell · gitleaks, Yelp/detect-secrets,
trufflehog · bubblewrap, gVisor · NeMo Guardrails, Guardrails AI, Llama Guard.
