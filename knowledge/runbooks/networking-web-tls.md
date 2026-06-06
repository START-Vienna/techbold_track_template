# Runbook — networking, web & TLS

> Stock Ubuntu over SSH, no installs. **Golden rule:** read on-disk config → validate syntax → reload →
> re-test the live socket. A runtime-only change (CLI `ip`/`iptables` rule, hand-edited generated
> `resolv.conf`, a foregrounded binary) is NOT a fix.

## Universal first triage
```bash
ss -ltnp                         # what is LISTENing + which PID/program
systemctl --failed
journalctl -p err -b --no-pager | tail -n 40
ip -br a ; ip -br link           # interfaces up/down + addresses
```

## 1. Port not listening / service not reachable
**Diagnose:** `ss -ltnp 'sport = :443'` (bound? on which address?); `systemctl status <svc>`; `journalctl -u <svc> -b | tail`; `curl -v http://127.0.0.1/` (loopback bypasses firewall); `curl -v http://<host-ip>/`; `ip -br a`.
Decision tree: **nothing in `ss`** → app problem (not running/crashed/failed to bind). **Bound to `127.0.0.1:PORT`** → bind-address problem, not firewall. **Bound to `0.0.0.0` but unreachable externally** → firewall (§2) or cloud network ACL.
**Root causes:** service crashed on start (failed/activating, never LISTENed); bound loopback-only; wrong port (`:8080` vs `:80`); port collision (`EADDRINUSE`); unsatisfied `After=`/`Requires=` ordering after reboot.
**Durable fix:** fix the on-disk listen directive (nginx `listen 0.0.0.0:443 ssl;`, app `bind`/`host = 0.0.0.0`), `systemctl restart <svc>`; `systemctl enable --now <svc>`. Anti-pattern: launching the binary in a foreground shell / `nohup … &` — dies on logout/reboot, masks the real failure.
**Validate:** `ss -ltnp 'sport = :443'` shows LISTEN on intended addr; `is-enabled`+`is-active`; `curl -so /dev/null -w '%{http_code}\n' http://127.0.0.1/`; `systemctl restart <svc> && ss -ltnp`.
**Avoid:** `kill -9` + restart (loses `journalctl` evidence); changing bind to `0.0.0.0` for an admin-only service (DB/metrics) without a firewall rule (exposes it).

## 2. Firewall blocking (ufw / iptables / nftables)
**Diagnose:** `sudo ufw status verbose`; `sudo iptables -S` and `-L -n -v --line-numbers`; `sudo nft list ruleset`. Local? `curl -v http://127.0.0.1/` ok but external times out → packet filter or cloud security group. **REJECT** = instant "connection refused"; **DROP** = hanging/timeout — tells you the rule type.
**Root causes:** default inbound `deny`/`DROP` with no allow rule; rule ordering (broad DROP above the specific allow — first-match wins); wrong protocol (`tcp` vs `udp`)/interface; mixed managers (hand-written rules vs ufw chains); IPv6 path blocked while IPv4 works.
**Durable fix:** ufw `sudo ufw allow 443/tcp` (writes `/etc/ufw/*.rules`, persistent). Raw nftables: edit `/etc/nftables.conf` → `sudo systemctl enable --now nftables`. Raw iptables is durable **only** if `iptables-persistent`/`netfilter-persistent` is already installed (writes `/etc/iptables/rules.v4`); if not (and you can't install), prefer ufw or `/etc/nftables.conf` — runtime `iptables` rules vanish on reboot. Anti-pattern: `iptables -I INPUT -j ACCEPT` with no persistence layer.
**Validate:** `ufw status verbose | grep 443`; `iptables -S | grep -- '--dport 443'`; `curl -so /dev/null -w '%{http_code}\n' http://<host-ip>/`; reload and re-check.
**⚠ AVOID — SAFETY HARD-FAIL:** **NEVER `ufw disable` / `iptables -F` / `nft flush ruleset`** to make one port work — removes all protection from an internet-facing host. Add the **single specific allow rule** instead. **NEVER enable a default-deny firewall before allowing SSH** — sequence is always defaults → `ufw allow OpenSSH`/`22/tcp` → `ufw enable` (else you drop your own session). Prefer `ufw limit ssh`.

## 3. DNS / resolv.conf / systemd-resolved
**Diagnose:** `getent hosts example.com` (full nsswitch path); `resolvectl status`; `resolvectl query example.com`; `dig example.com +short`; `dig @1.1.1.1 example.com +short` (bypass local resolver); `cat /etc/resolv.conf` + `readlink -f /etc/resolv.conf`; `systemctl status systemd-resolved`.
Logic: `dig @1.1.1.1` works but `getent`/`dig` fails → **local resolver/resolv.conf broken**. Both fail → upstream/network. `dig` works but `getent` fails → nsswitch/`/etc/hosts`.
**Root causes:** `/etc/resolv.conf` is a stale regular file (or wrong symlink target) instead of `-> ../run/systemd/resolve/stub-resolv.conf`; dead nameservers; `systemd-resolved` not running (stub `127.0.0.53` doesn't answer); wrong/empty upstream in `/etc/systemd/resolved.conf` or no per-link DNS; DNSSEC validation failing (SERVFAIL); poisoned cache.
**Durable fix:** restore symlink `sudo ln -sf ../run/systemd/resolve/stub-resolv.conf /etc/resolv.conf` + `sudo systemctl enable --now systemd-resolved`. Set upstream durably via netplan (`/etc/netplan/*.yaml` → `nameservers:` → `netplan apply`) or `/etc/systemd/resolved.conf` (`DNS=1.1.1.1 8.8.8.8` → restart resolved). If DNSSEC is the culprit and zone is genuinely broken: `DNSSEC=allow-downgrade`. Flush: `sudo resolvectl flush-caches`. Anti-pattern: hand-editing `/etc/resolv.conf` — regenerated and lost on a resolved-managed host.
**Validate:** `readlink -f /etc/resolv.conf` → stub; `resolvectl status | grep 'DNS Servers'`; `getent hosts example.com`; `dig example.com +short` (no SERVFAIL); restart resolved and re-check.
**Avoid:** permanently replacing `/etc/resolv.conf` with a static file (breaks per-link/VPN split DNS, fights resolved every boot); disabling resolved without a full replacement resolver.

## 4. Local connectivity
**Diagnose:** `ip -br a`/`ip -br link`; `ip route` (default route via correct gateway?); `ping -c2 <gateway>`; `ping -c2 1.1.1.1` (raw internet, no DNS); `curl -v --connect-timeout 5 http://127.0.0.1/`; `ss -s`.
**Root causes:** missing/duplicate default route or wrong gateway after a netplan change; interface DOWN/no address (DHCP lease lost, MTU mismatch); reachable on loopback but firewall/bind blocks external iface; AAAA resolves but no working IPv6 route → app "hangs".
**Durable fix:** edit `/etc/netplan/*.yaml` → `sudo netplan apply` (test risky changes with `sudo netplan try` — auto-reverts after 120s if not confirmed, so you can't lock yourself out). Anti-pattern: `ip addr add`/`ip route add` at the CLI (runtime-only, wiped on reboot/`netplan apply`).
**Validate:** `ip route | grep '^default'` (exactly one correct default); `ping -c2 1.1.1.1` 0% loss; `curl` loopback; `sudo netplan try` proves durability via auto-revert.
**Avoid:** `ip link set <iface> down` on the SSH-carrying interface; `netplan apply` of an untested config remotely (use `netplan try`).

## 5. Web server failing / misconfigured (nginx, apache2)
**Diagnose — nginx:** `sudo nginx -t` (syntax + load test, prints file:line); `systemctl status nginx`; `journalctl -u nginx -b | tail`; `tail -n 50 /var/log/nginx/error.log`; `ss -ltnp | grep -E ':(80|443)\b'`; `curl -v http://127.0.0.1/`. **apache2:** `sudo apache2ctl configtest` (expect "Syntax OK"); `sudo apachectl -S` (vhost map); `systemctl status apache2`; `tail -n 50 /var/log/apache2/error.log`.
**Root causes:** syntax error / dangling `include` / missing `;` (service refuses to (re)start — `nginx -t` pinpoints); referenced file missing (cert, key, docroot, included snippet); vhost enabled but dependency missing (`sites-enabled` symlink to deleted file; apache site not `a2ensite`d or module not `a2enmod`); two vhosts claim same `listen`/`ServerName`; perms — worker (`www-data`) can't read root/cert (§7); config edited but never reloaded.
**Durable fix:** nginx config under `/etc/nginx/` (`sites-available/` symlinked into `sites-enabled/`): edit on disk → `nginx -t` → `systemctl reload nginx` → `systemctl enable nginx`. apache: vhosts in `sites-available/`, `a2ensite`/`a2enmod` (create durable symlinks) → `apache2ctl configtest` → `reload` → `enable`. **`reload` (graceful) preferred over `restart` when only config changed.** Anti-pattern: editing files directly in `sites-enabled/`; changing the running config without reload.
**Validate:** `nginx -t` "successful" / `apache2ctl configtest` "Syntax OK"; `reload`; `ss -ltnp | grep -E ':(80|443)'`; `curl -so /dev/null -w '%{http_code}\n' http://127.0.0.1/`; `systemctl restart nginx && curl -sI http://127.0.0.1/ | head -1`.
**Avoid:** `restart` without `nginx -t`/`configtest` first (a syntax error then leaves it DOWN instead of running the old good config); `chmod -R 777` the docroot to fix a 403 (§7).

## 6. Reverse-proxy / upstream errors (502 / 504 / 503)
**Diagnose:** `tail -n 50 /var/log/nginx/error.log` (read the errno); `nginx -t`; `ss -ltnp | grep -E ':(3000|8080|9000)'` (backend listening?); `curl -v http://127.0.0.1:3000/` (hit upstream directly); `systemctl status <backend>`; `grep -R proxy_pass /etc/nginx/`.
Errno: **111 connection refused** = backend down/wrong port (502); **upstream timed out (110)** = backend slow → 504; **no live upstreams** = all backends down.
**Root causes:** backend not running/crashed; `proxy_pass` wrong host/port/socket; backend bound `127.0.0.1` but nginx dials a different addr (or PHP FastCGI socket mismatch); upstream too slow > `proxy_read_timeout`; SELinux/AppArmor/firewall blocking the loopback upstream; stale DNS-resolved upstream.
**Durable fix:** `systemctl enable --now <backend>` (up after reboot before nginx needs it); correct `proxy_pass` in the on-disk vhost → `nginx -t` → reload; for genuinely slow upstreams raise `proxy_read_timeout`/`proxy_connect_timeout` (don't paper over a crash with a huge timeout). Anti-pattern: restarting nginx repeatedly — the fault is the upstream.
**Validate:** `curl ... http://127.0.0.1:3000/` backend 200; `ss -ltnp | grep :3000`; `curl ... http://127.0.0.1/` now 200 not 502; restart backend + nginx, re-check.
**Avoid:** bumping timeouts to hours to hide a crashing backend; exposing the backend on `0.0.0.0` to "make nginx reach it" (keep loopback).

## 7. TLS / SSL certificate problems (expired, wrong path, permissions)
**Diagnose:**
```bash
sudo nginx -t                                   # wrong path/missing key (NOT permission errors)
sudo tail -n 30 /var/log/nginx/error.log        # "Permission denied" / "No such file" / PEM errors
openssl x509 -enddate -noout -in /etc/letsencrypt/live/<domain>/fullchain.pem
openssl x509 -checkend 604800 -noout -in <fullchain>   # exit!=0 ⇒ expires within 7 days
echo | openssl s_client -connect 127.0.0.1:443 -servername <domain> 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer        # what the server ACTUALLY presents
openssl x509 -noout -modulus -in fullchain.pem | openssl md5   # must equal:
openssl rsa  -noout -modulus -in privkey.pem   | openssl md5   # key/cert match check
```
**Root causes:** expired leaf (or expired intermediate — file dates look fine but `s_client` says expired); `ssl_certificate` points at cert-only instead of **fullchain** (missing intermediates), or a stale path; cert/key mismatch (moduli differ); **permissions** — `www-data` can't read the key or traverse a parent dir (`/etc/letsencrypt/{live,archive}` often `0700 root`). Note: `nginx -t` runs as root and **passes**, but workers fail at runtime — diagnose via error.log, not just `nginx -t`.
**Durable fix:** point `ssl_certificate`→fullchain.pem, `ssl_certificate_key`→privkey.pem in the on-disk vhost → `nginx -t` → `reload`. Renew/replace the expired cert (re-run your ACME process) then reload. Permissions: ensure the worker can read the key AND traverse every parent dir (`sudo -u www-data test -r <key> && echo OK`); keep keys `0600`/`0640`. Anti-pattern: `chmod 644 privkey.pem` (world-readable private key = security incident); copying certs to a random dir.
**Validate:** `openssl x509 -checkend 0 -noout -in <fullchain> && echo VALID`; `s_client` live socket dates in-window; `sudo -u www-data test -r <key>`; `curl -sI https://<domain>/ --resolve <domain>:443:127.0.0.1 | head -1`; reload + re-verify.
**Avoid:** making a private key world-readable to dodge a permission error (key-disclosure incident — fix group ownership + dir traversal instead); `curl -k` "fix" (hides the real fault); hand-editing `/etc/letsencrypt/archive/`.

## Validation one-liners
| Goal | Command | Pass |
|---|---|---|
| Port bound | `ss -ltnp 'sport = :443'` | LISTEN row |
| Service durable | `systemctl is-enabled <svc> && systemctl is-active <svc>` | enabled + active |
| HTTP healthy | `curl -so /dev/null -w '%{http_code}\n' http://127.0.0.1/` | 200/301 |
| DNS works | `getent hosts example.com` | returns IP |
| nginx config | `sudo nginx -t` | "test is successful" |
| Cert not expired | `openssl x509 -checkend 0 -noout -in cert.pem` | exit 0 |

**Cross-cutting:** change config on disk → validate (`nginx -t`/`configtest`/`netplan try`) → reload/restart → `enable` → re-run the validation command after a restart to prove it survives reboot.

## Sources
nginx docs & trac #2372 (`nginx -t` misses cert permission errors) · Apache httpd apachectl/SSL how-to · Ubuntu Server Guide (netplan, ufw, nftables, systemd-resolved) · man: resolvectl, ufw, nft, ss, iptables · OpenSSL x509/s_client · "don't lock yourself out enabling ufw over SSH".
