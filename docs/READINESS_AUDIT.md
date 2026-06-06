# READINESS AUDIT — are we truly ready to build, and is this the best we can do?

Final pre-build audit of the whole doc/knowledge set on this branch (PRD, ARCHITECTURE, SAFETY_POLICY,
IMPLEMENTATION_PROCEDURE, TASKS, RELIABILITY, AGENT_PIPELINE, REVIEW, RESOURCES, STACK, `knowledge/`),
from four hard-to-please perspectives. Goal: confirm we have **all the data and rigour to build this**, or
name exactly what's missing. Honest, not a rubber stamp.

## Verdict
**Planning/spec/knowledge depth: build-ready and arguably best-in-class for this task.** The architecture is
sound and convergent, safety is deterministic and provable, the diagnostic method generalises (incl. the
unknown-error path), and the human-in-the-loop design is genuinely usable. **The remaining work is not more
planning — it is (a) two external unblockers, (b) a small set of pre-build artifacts, and (c) the code
itself.** The biggest risk now is *over-planning*: the marginal value has moved from docs to **running code +
test scenarios.** Get the unblockers, build the vertical slice, prove it on scenarios.

---

## 1. Old sysadmin (does it actually work, safely, without wasting my time?)
**✅ Have:** safety gate the model can't bypass; closed-loop validation with the *same* benefit test +
restart/persistence; complete append-only audit; **human leads** (run-own-command, undo, ask/answer,
plan-approval — REVIEW G1–G12); SSH hardening that makes it work on real boxes (`bash -lc` PATH, `sudo -n`,
exit-code-is-truth, output budgeting, tool preflight); the **unknown-error first-principles method**
(ground-truth sweep → follow the causal chain); give-up-safely instead of flailing; per-domain runbooks
(systemd, networking/web/TLS, resource exhaustion, data-access/scheduling).
**⚠️ Thin / to verify on first VM:** passwordless `sudo` for `azureuser` (many fixes need it — preflight it);
runbook coverage could add a few common classes (DNS/`resolv.conf`, NTP/time skew, file-descriptor/ulimit
limits, AppArmor/SELinux denials, `fstab`/mount failures, log-rotation as the *cause* of disk-full). None are
blockers, but adding them widens generalisation.
**Sysadmin's bottom line:** "This respects me and won't nuke the box. Prove it on a few broken VMs before you
tell me it's done."

## 2. Business CTO (risk, liability, ROI, does it win the contract?)
**✅ Have:** framed as **techbold's internal copilot** (the €7k contract), not a fantasy SaaS; safety-first =
their brand; full auditability for compliance/trust; no-exfiltration + secret redaction + repo secret-scan;
reproducible (`docker compose`, README, tests, modular per rubric E); the demo story (propose→approve→execute,
blocked dangerous command, durable-proven fix, audit trail) is concrete and on-message.
**⚠️ Thin:** per-incident **LLM cost/latency** (bring-your-own key — fine for the hack, but note token cost &
the eval-time tie-breaker; cheap model for probes); **liability narrative** for an AI touching prod is
mitigated by HITL+gate+audit but should be said out loud; data-residency answered by the optional **local-LLM
(Ollama)** path (privacy story).
**CTO's bottom line:** "Low downside (human-gated, auditable, reversible), clear contract value, and a
differentiator a generic RMM vendor can't match. Approved — show me it solving a fresh VM."

## 3. Technician user (is it the easiest, best tool, with real control?)
**✅ Have:** human-leads-AI-assists reframe; terse approval cards (command + purpose + expected signal + risk +
safety notes); approve / **edit** / reject / **run-my-own** / **ask-answer** / **undo** / pause-stop;
plan-approval to avoid clicking yes 40×; blast-radius before a restart; expand-to-full (redacted) output; live
SSE timeline; auto-written activity so they never write the ticket up.
**⚠️ Thin:** the **frontend is specced but light** (intentionally — D is 10 pts). Make sure the demo path
(list → run → approve → output → fix → validate → submit) is buttery; everything else can be plain.
**Technician's bottom line:** "I can drive, override, undo, and trust the proof — and it does my paperwork.
I'd keep it open. Make the run page smooth and I'm sold."

## 4. AI developer (is the agent design sound, generalising, debuggable, testable?)
**✅ Have:** deterministic state machine + AI-in-the-seams (model never holds the execute tool); typed
structured outputs (Zod) → no free-form when the backend must act; evidence-grounded hypotheses + ranked
diagnosis; **grader-mirror** adversarial self-check; **output budgeting** vs context-collapse; **tool
preflight** vs the #1 "not-in-PATH" failure; observability (Langfuse) + an eval path; the unknown-error method
for generalisation; mock Phoenix + mock SSH so the loop runs offline.
**⚠️ Thin / the real gap:** **no test scenarios exist yet.** We cite Terminal-Bench/ITBench formats but
haven't authored our own **broken-VM scenarios** (env + fault + verification test). This is the single most
valuable pre-build artifact — it's how we *know* the agent works before the hidden grader runs, and it
de-risks B more than any further doc. Also: pin the **AI SDK version** (v5 vs v6 wording differs across docs)
and the **provider/model** once a key is in hand.
**AI dev's bottom line:** "The design is right and debuggable. Stop writing docs — build the loop and a
handful of broken-VM scenarios; the scenarios are the proof."

---

## 5. Build-readiness checklist
**Data / knowledge we HAVE (build from these):** the full spec set (5 docs), the diagnostic playbook +
4 runbooks + safety command-policy (`knowledge/`), the reliability protocol + failure-mode countermeasures,
the agent pipeline + unknown-error method, the verified ERP contract (`phoenix-openapi.yaml` + live probe),
the stack + reuse catalog.

**External unblockers (we can't resolve these ourselves — get them first):**
- [ ] **SSH `.pem` in `keys/`** (folder has only `.gitkeep`) — hard blocker for any VM work.
- [ ] **`PHOENIX_API_TOKEN`** (live mock is up; `/me`=401 without it).
- [ ] **Confirm with mentors:** R0 (does grading run the HITL flow unattended?) and **passwordless sudo** for `azureuser`.
- [ ] **One LLM key** (bring-your-own; pin provider+model).

**Pre-build artifacts to create now (raise confidence to "completely sure"):**
- [ ] **3–5 broken-VM scenarios** (Docker, Terminal-Bench format: env + fault + benefit test) — the proof harness.
- [ ] A few **extra runbook entries** for the thin classes named in §1 (DNS/NTP/ulimit/AppArmor/fstab).

**Then build (the code — specs are detailed enough):** TS/Hono skeleton → Phoenix client (+mock) → safety
layer (+tests, do early) → run store/audit → SSH executor (+mock, hardened per §RELIABILITY) → agent loop
(propose-only) → approval/manual/undo/question routes + SSE → activity gen → frontend → practice on VMs.

## 6. Honest gaps & the one steer
- **Everything material for *planning* is done and rigorous.** Further doc work now has diminishing returns.
- **The two things that would most increase certainty are not docs:** (1) the external unblockers, (2) the
  broken-VM scenario harness. Without #2 we're trusting the design; with it we'll *measure* it.
- **Minor:** pin AI SDK version + provider; widen runbook coverage; keep the frontend to the demo path only.

**Conclusion:** This is the best we can do *on paper* — the design, safety, reliability, and diagnostic
method are comprehensive and defensible from every chair above. To be *completely sure*, the next move is
**code + scenarios**, not more planning. Build the vertical slice in mock mode, author the scenarios, get the
creds, and validate end-to-end.
