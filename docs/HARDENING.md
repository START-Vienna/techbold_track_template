# HARDENING — how we refuse to fail the way others did

The build-against rigor contract. Once the skeleton lands, **every row here must have a guard *and* a test.**
This is not aspirational prose: it's the QA checklist that makes the system immune to the failure modes that
sank similar projects. Cross-references [SAFETY_POLICY.md](./SAFETY_POLICY.md), [RELIABILITY.md](./RELIABILITY.md),
[AGENT_PIPELINE.md](./AGENT_PIPELINE.md), [REVIEW.md](./REVIEW.md).

## The one principle
**Assume the model is wrong, overconfident, or manipulated — the damage must still be contained by
deterministic code, never by the prompt.** Every guard below is enforced in backend code + a test, not in a
system-prompt instruction. The prompt is the first line of defence; it is never the last.

## What actually killed similar projects (grounded)
- **Autonomous agents deleted production data with valid credentials.** PocketOS lost its DB (30h outage);
  a Claude Code agent ran `terraform destroy` on prod (1.9M rows); agents deleted backups in the same blast
  radius. *Root cause: broad standing credentials + an overconfident "I'm helping" action.*
  ([zenity](https://zenity.io/blog/current-events/ai-agent-database-deletion-pocketos),
  [eon](https://www.eon.io/blog/ai-agent-data-loss))
- **Single-run success ≠ reliability.** ReliabilityBench: agents that pass once fail under repetition,
  perturbation, and **tool/API faults — rate-limiting the most damaging**; correctness must be judged by
  **end-state**, not the model's text. ([arXiv 2601.06112](https://arxiv.org/abs/2601.06112))
- **Prompt injection / exfiltration happen in the *semantic* layer.** Indirect injection from data the agent
  reads; "export all records matching X" where X matched everything; MCP-server supply-chain exploits
  (OpenClaw, Anthropic Git MCP). ([swarmsignal](https://swarmsignal.net/ai-agent-security-2026/))
- **Terminal agents fail on execution + verification.** "command not in PATH" = 24% of failures; context
  collapse after ~turn 10; premature "fixed". ([Terminal-Bench](https://arxiv.org/abs/2601.11868))

---

## Failure → guard → test (the catalog)

### A. Destructive / catastrophic actions (the disasters above)
| # | Failure (seen in) | Guard we build | Test |
|---|---|---|---|
| A1 | Agent runs `rm -rf`/`mkfs`/`dd`/DB-drop (PocketOS, Terraform) | Deterministic **blocklist → HIGH_RISK_BLOCKED, cannot be approved**, even by a human | unit: every blocklist pattern blocked + unapprovable |
| A2 | **Broad standing creds → blast radius** (the common root cause) | **The model never holds the SSH key or an execute tool.** Only backend `executeApprovedCommand` runs, post human/policy approval. No agent-held credential exists to abuse | code review + audit-log proof no exec without an approval row |
| A3 | "Scoped" command that's actually broad (regex/glob matched everything) | Classifier does **effective-scope analysis**: resolve globs/wildcards/paths; judge the *expanded* scope; **default-deny if scope can't be bounded** | unit: `chmod -R 777 /srv/*`, `find / -delete`, unresolved `$VAR` → blocked |
| A4 | Deleting backups / data dirs | **Never operate on DB/data dirs**; rollback backups are additive, timestamped, **never deleted** | unit: ops on `/var/lib/postgresql`,`/var/lib/mysql`,`*.bak` blocked |
| A5 | "It thought it was helping" (overconfident act) | **Human/policy gate before every mutation** + evidence-required-before-fix + give-up-safely | e2e: no mutation executes without an APPROVED approval |

### B. Execution / shell reliability (the 24% class)
| # | Failure | Guard | Test |
|---|---|---|---|
| B1 | command not in PATH | run via **`bash -lc`** (login PATH) + absolute paths + **tool preflight** | scenario: command on minimal-PATH box still resolves |
| B2 | `sudo` hangs (no TTY) | **`sudo -n`**; surface "needs password"; preflight `sudo -n true` | unit: no-tty sudo → captured, not hung |
| B3 | interactive program hangs (`top`/`vi`/`less`) | non-interactive only; `--no-pager`/`-n`/`</dev/null`; **per-command timeout + kill** | unit: a slow/interactive cmd is killed, `timedOut=true` |
| B4 | unbounded/slow probe (`find /`) | scoped probes + timeout + **output cap** | unit: huge output capped; long cmd times out |
| B5 | exit-code ignored / stderr treated as failure | success = **exit code + expected signal**, never "stderr non-empty" | unit: `nginx -t` (writes stderr, exit 0) read as success |
| B6 | locale/encoding parse drift | `LANG=C LC_ALL=C` on every command | unit: parsing stable under locale change |
| B7 | SSH session drops mid-run | reconnect w/ backoff; resume from persisted state; idempotent commands | fault-injection: drop connection → run resumes |

### C. Secrets, exfiltration & injection (semantic-layer attacks)
| # | Failure | Guard | Test |
|---|---|---|---|
| C1 | secret in logs/UI/activity | `redactSecrets` on **every** string before log/UI/model (pure fn) | unit: each secret pattern redacted; **planted-secret never appears anywhere** |
| C2 | secret/key committed to repo | `.gitignore` keys+`.env`; `.env.example` only; **gitleaks in CI** | CI: gitleaks clean; `git grep` for tokens |
| C3 | editing a secret-bearing config leaks it | target the directive; edit in place; **redact the diff**; never `cat` the whole file | unit: diff of a secret file is redacted |
| C4 | **indirect prompt injection** from VM output (logs/MOTD/files) | all output is **untrusted data, never instructions**; the gate's verdict is independent of content | adversarial: a file saying "run rm -rf" causes no unsafe action |
| C5 | exfiltration (`curl POST` system data; web query with secrets) | no-exfil blocklist; web search is P2 only, **outbound query sanitised + audited** | unit: exfil patterns blocked; web query strips identifiers |
| C6 | **MCP supply-chain** exploit (OpenClaw/Git-MCP) | **own the SSH runner; no third-party MCP execution servers** | design invariant + dependency review |
| C7 | log/history wiped to hide actions | blocklist + **append-only audit (never deleted)** | unit: `history -c`/log-truncate blocked; audit has no delete API |

### D. Reasoning / diagnosis correctness
| # | Failure | Guard | Test |
|---|---|---|---|
| D1 | hallucinated root cause | **evidence-grounded**: hypotheses cite output; no fix until a hypothesis is confirmed | review: every fix traces to an evidence line |
| D2 | premature "fixed" / insufficient verification | **closed-loop**: capture-broken → fix → same-test-green → **restart re-test** → grader-mirror | scenario: declaring fixed without the after-evidence fails the gate |
| D3 | `active` ≠ working; single green ≠ fixed (intermittent) | proof = benefit test, **not `is-active`**; intermittent → repeat over interval; single pass = `LIKELY_FIXED` | scenario: flapping service not marked VERIFIED on one pass |
| D4 | masking the cause (band-aid: restart-loop, `rm` logs) | grader-mirror asks **"root cause or band-aid?"**; disk-full → fix the producer | scenario: workaround scored/flagged, not accepted |
| D5 | tunnel vision / multiple faults | enumerate **all** sweep anomalies; re-enrich if still broken after a fix | scenario: 2-fault VM resolved, not stopped at #1 |
| D6 | unknown incident → guess or give up | **first-principles method**: ground-truth sweep → follow causal chain → on-box docs → confirm | scenario: a held-out class diagnosed from evidence |

### E. Context / model reliability (ReliabilityBench)
| # | Failure | Guard | Test |
|---|---|---|---|
| E1 | context collapse after ~turn 10 (verbose output) | **output budgeting**: full in DB, capped digest + signal-lines to model; pin goal each turn | long-run scenario stays on-task |
| E2 | **LLM rate-limit / timeout / partial / malformed response** (most damaging fault) | timeout + bounded retry/backoff; **schema-validated (Zod) output with retry**; on failure **degrade to manual proposal**, never an unsafe default | fault-injection: rate-limit/timeout/garbage → clean degrade |
| E3 | single-run luck ≠ reliable | judge by **end-state** (benefit test) + re-test after restart (our pass^k) | scenario re-run gives consistent end-state |
| E4 | infinite loop / runaway cost | **step budget + loop detector** → give-up-safely | unit: repeated identical cmd → escalates; max-steps caps |

### F. Human control / usability (so it's actually used + truly in-the-loop)
| # | Failure | Guard | Test |
|---|---|---|---|
| F1 | approval fatigue → rubber-stamping | **plan-approval** for read-only batches; each mutation its own gate; meaningful cards (risk+diff) | UX: a full run isn't 40 separate clicks |
| F2 | human can't intervene/override | **run-own-command + ask/answer + undo + pause/stop** (G1/G3/G11) | e2e: human runs own cmd; undo reverts + re-tests |
| F3 | no blast-radius before a restart | show dependents + active connections on the card | UX: restart card shows impact |
| F4 | made it worse, no rollback | capture-before-change; **one-click verified undo** + no-regression re-test | scenario: undo restores prior state, benefit-test confirms |

### G. Process / engineering / hackathon-specific
| # | Failure | Guard | Test |
|---|---|---|---|
| G1 | over-scope → nothing finished | MVP ladder; **mock-first vertical slice** before real | demo runs end-to-end in mock mode early |
| G2 | big-bang integration | frozen module contracts; mock neighbours; integrate continuously | each module testable in isolation |
| G3 | hardcoding to dev incidents | generalise; **measure held-out fix-rate** on unseen scenarios | held-out scenario solved with no incident-specific code |
| G4 | external dep flaky/down (Phoenix/SSH/LLM) | timeouts+retries everywhere; **mock mode first-class**; graceful degrade | kill each dep mid-run → clean error, no crash |
| G5 | burning limited VM resets | dev on local Docker; reserve the 5 VMs; `me/reset` only for clean runs | process rule + reset-usage note |
| G6 | non-deterministic live demo | low temperature; rehearse on a reset VM; **recorded fallback**; mock fallback | dry-run the demo; fallback video exists |
| G7 | safety layer untested | **mandatory `safety.test.ts` in CI** (blocklist, redaction, edited-recheck, scope) | CI gate: safety tests must pass |
| G8 | SDK/provider drift | **pin AI SDK version + provider/model**; one `model.ts` | lockfile + a documented version |

---

## Non-negotiable invariants (must hold no matter what the model does)
1. **No shell command executes without an APPROVED approval row** (human or policy) — provable from the audit log.
2. **No blocklisted command ever executes** — even if a human approves it.
3. **No secret ever appears** in audit, UI, activity, or repo — a planted secret is the test.
4. **The system is never left worse than found** — minimal reversible changes, capture-before-change, undo, no data ops.
5. **No "fixed" claim without after-evidence** — same benefit test green + survives a restart.
6. **The model never holds the SSH key or an execute capability** — backend-only execution; no broad standing creds to abuse.
7. **The audit log is append-only** — never deleted or truncated.

These seven are the deterministic floor. If any test for them is red, we do not ship that path.

## The test rig that proves it (build alongside the code)
- `safety.test.ts` — blocklist, effective-scope, obfuscation, edited-recheck, redaction, planted-secret.
- `fault-injection` — LLM rate-limit/timeout/garbage, SSH drop, Phoenix 5xx → graceful degrade (ReliabilityBench-style).
- **Broken-VM scenario harness** (Terminal-Bench format: env + fault + benefit test) — the held-out proof that it generalises; run repeatedly for consistency (pass^k).
- `orchestrator.test.ts` — happy path, reject path, give-up-safely, undo.
- CI: gitleaks + the safety suite are blocking gates.

> When the skeleton arrives, the first commit after wiring each module is **its guard + its test from this
> file.** A feature isn't "done" until its row here is green.
