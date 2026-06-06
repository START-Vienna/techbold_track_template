# RESOURCES.md — everything we can reuse (so we build the least)

Exhaustive catalog of prebuilt components, datasets, knowledge bases, benchmarks, and tools we can copy
or use directly. Goal: **maximum reuse, minimum original work.** Pairs with [BUILD.md](BUILD.md) (the plan),
[../STACK.md](../STACK.md) (the chosen stack), and [../knowledge/](../knowledge/) (our distilled pack).

**Legend:** 🟢 copy/use directly (lift code, data, or run as-is) · 🔵 reference/inspiration (read, re-express;
e.g. GPL we don't vendor into MIT) · 🟣 data/corpus to ingest (RAG / few-shot / scenarios).

**Mental model:** our container is the **control plane** (LLM + harness + safety + knowledge); the customer
VM is the **target**, reached *out* over SSH. So our "sandbox" is the customer box, protected by the safety
gate — not container isolation.

---

## 0. Copy-directly shortlist (highest leverage — start here)
| Thing | Gives us (prebuilt) | Tier |
|---|---|---|
| **Vercel AI SDK 6** | the agent loop + `needsApproval` human gate + streaming + MCP | 🟢 |
| **assistant-ui** | the approval-gate workspace UI (tool cards, inline approve/edit/reject, live log) | 🟢 |
| **Terminal-Bench** | the container-task **format + execution harness** for our test scenarios | 🟢 |
| **our `knowledge/` pack** | diagnostic playbook + runbooks + safety DENY taxonomy & `redact()` regex | 🟢 |
| **NL2Bash + tldr-pages** | NL→command priors + 1.9k command examples for retrieval/few-shot | 🟣 |
| **bash-parser / tree-sitter-bash** | shell AST for the safety classifier | 🟢 |
| **Secretlint + gitleaks** | secret detectors for `redact()` + repo CI scan | 🟢 |
| **Langfuse + Evalite** | tracing + the grader-mirror / generalization eval harness | 🟢 |
| **ITBench-Trajectories** | real SRE incident agent trajectories as few-shot examples | 🟣 |

---

## 1. Agent framework & harness (the loop)
| Resource | License | Tier | Take |
|---|---|---|---|
| [Vercel AI SDK](https://github.com/vercel/ai) · [docs](https://ai-sdk.dev/) | Apache-2.0 | 🟢 | agent loop (`stopWhen`), tool calling, **`needsApproval` HITL**, MCP client, streaming |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT | 🟢 | React chat UI, tool-call→component rendering, inline approval widgets |
| [@ai-sdk/anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) | Apache-2.0 | 🟢 | Claude provider, tool-use, model routing, prompt caching |
| [Zod](https://github.com/colinhacks/zod) | MIT | 🟢 | tool/arg + activity schemas, validated structured output |
| *(alt, Python)* [Pydantic AI](https://github.com/pydantic/pydantic-ai) | MIT | 🔵 | type-safe agent + HITL approval + `pydantic-evals` if we ever go Python |
| *(alt)* [LangGraph](https://github.com/langchain-ai/langgraph) · [Mastra](https://github.com/mastra-ai/mastra) · [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) | MIT/Apache | 🔵 | stateful graphs / TS-first / simple loops |

## 2. Benchmarks & evaluation harnesses (copy the harness + task format)
| Resource | License | Tier | Take |
|---|---|---|---|
| [Terminal-Bench](https://github.com/laude-institute/terminal-bench) · [site](https://www.tbench.ai/) | Apache-2.0 | 🟢 | **task format** (container env + instruction + verification tests + reference solution) and the **execution harness** that wires an LLM to a terminal sandbox; the `Terminus` reference agent. This is our test-harness blueprint. |
| [IBM ITBench](https://github.com/itbench-hub/ITBench) | Apache-2.0 | 🔵 | scenario-design + **held-out grading** methodology (40 public / 19 hidden — our exact structure). K8s-centric → adapt |
| [ITBench-SRE-Agent](https://github.com/IBM/ITBench-SRE-Agent) | Apache-2.0 | 🔵 | reference SRE agent (diagnose→root-cause→remediate) built on CrewAI |
| Reality check | — | — | Frontier models resolve only ~11% (ITBench SRE) to ~50% (Terminal-Bench). **The model isn't enough — knowledge + verification is the edge.** |

## 3. Datasets & trajectories (data to ingest)
| Resource | License | Tier | Take |
|---|---|---|---|
| [ITBench-Trajectories](https://huggingface.co/datasets/ibm-research/ITBench-Trajectories) | check on HF | 🟣 | real incident-agent trajectories → few-shot examples of good diagnostic chains |
| [NL2Bash](https://github.com/TellinaTool/nl2bash) | GPL-3.0 (data reusable) | 🟣 | 12k (command ↔ English) pairs over 100+ utilities → NL→command retrieval/few-shot |
| [tldr-pages](https://github.com/tldr-pages/tldr) | MIT / CC-BY | 🟢🟣 | ~1.9k commands with practical examples → embed as command-usage KB |
| [Terminal-Bench tasks](https://github.com/laude-institute/terminal-bench/tree/main/tasks) | Apache-2.0 | 🟣 | ready sysadmin/server/security task containers to test generalization |

## 4. Command & Linux knowledge bases (embed / RAG)
| Resource | License | Tier | Take |
|---|---|---|---|
| **man pages** (on the VM) | — | 🟢 | ground truth; agent can `man`/`--help` live |
| [explainshell](https://github.com/idank/explainshell) | GPL-3.0 | 🔵 | parse a command → explain each flag (show the approver what they're OK-ing) |
| [cheat.sh](https://github.com/chubin/cheat.sh) | MIT | 🟢 | terse community command examples, queryable |
| [Ubuntu Server Guide](https://ubuntu.com/server/docs) · [ArchWiki](https://wiki.archlinux.org/) | docs | 🟣 | service-specific troubleshooting prose to distill into runbooks |
| **our [knowledge/](../knowledge/) pack** | MIT (ours) | 🟢 | playbook + per-domain runbooks + safety policy — the agent's brain |

## 5. Diagnostic methodology (embed in the system prompt)
| Resource | Tier | Take |
|---|---|---|
| [USE Method — Linux checklist](https://www.brendangregg.com/USEmethod/use-linux.html) + [60s analysis](https://www.brendangregg.com/Articles/Netflix_Linux_Perf_Analysis_60s.pdf) | 🟢 | exact Util/Saturation/Errors commands per resource; the first-60s sweep |
| [Google SRE Book — Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/) | 🔵 | the hypothesize→test→bisect loop shape |
| *(already distilled into `knowledge/diagnostic_playbook.md`)* | 🟢 | — |

## 6. Runbook / procedure sources (service-specific steps)
| Resource | License | Tier | Take |
|---|---|---|---|
| [HolmesGPT runbooks](https://github.com/robusta-dev/holmesgpt/blob/master/examples/custom_runbooks.yaml) | Apache-2.0 | 🟢 | runbook **format** + "runbooks > model" pattern; some content adaptable |
| [OpenRunbook](https://github.com/openrunbook/openrunbook) | check | 🔵 | nginx/postgres/redis service procedures as raw material |
| [awesome-runbook](https://github.com/runbear-io/awesome-runbook) | MIT (list) | 🔵 | curated index of Linux runbooks |

## 7. Diagnostic & validation tools (probes — dev harness; avoid installing on customer VMs)
| Resource | License | Tier | Take |
|---|---|---|---|
| [monitoring-plugins](https://github.com/monitoring-plugins/monitoring-plugins) | GPL-3.0 | 🔵 | `check_disk/procs/http/load/tcp/pgsql…` **check logic** → re-express as built-in shell; doubles as "fix works" tests |
| [osquery](https://github.com/osquery/osquery) | Apache-2.0 | 🔵 | SQL over OS state (processes, ports, mounts) — structured diagnosis (dev only) |
| [Lynis](https://github.com/CISOfy/lynis) | GPL-3.0 | 🔵 | hundreds of misconfig/hardening checks → "no-regression / didn't weaken security" ideas |
| [sos](https://github.com/sosreport/sos) | GPL-2.0 | 🔵 | comprehensive diagnostic data collection (dev only; output too big for live ctx) |
| **systemd built-ins** | — | 🟢 | `systemctl status/is-enabled/--failed`, `journalctl -u -p err`, `systemd-analyze` — zero-install |

## 8. Safety layer (we own the policy, but reuse the parsers & detectors)
| Resource | License | Tier | Take |
|---|---|---|---|
| [bash-parser](https://github.com/vorpaljs/bash-parser) (TS) · [tree-sitter-bash](https://github.com/tree-sitter/tree-sitter-bash) | MIT | 🟢 | shell **AST** so `classify()` matches normalized tokens, not brittle regex |
| [mvdan/sh](https://github.com/mvdan/sh) (Go) · [bashlex](https://github.com/idank/bashlex) (Py) | BSD/GPL | 🔵 | alt parsers if not TS |
| [OPA / Rego](https://github.com/open-policy-agent/opa) | Apache-2.0 | 🔵 | versioned, testable default-deny policy (`opa test`) |
| [Secretlint](https://github.com/secretlint/secretlint) | MIT | 🟢 | Node-native secret detectors → `redact()` over command output |
| [gitleaks](https://github.com/gitleaks/gitleaks) | MIT | 🟢 | repo secret-scan CI gate (the exact scan judges run) |
| [detect-secrets](https://github.com/Yelp/detect-secrets) · [trufflehog](https://github.com/trufflesecurity/trufflehog) | Apache/AGPL | 🔵 | additional secret regex patterns to lift |
| **our `knowledge/safety/command-policy.md`** | MIT | 🟢 | the DENY taxonomy + 3-tier classify + ready `redact()` regex — the spec |

## 9. SSH runner
| Resource | License | Tier | Take |
|---|---|---|---|
| [ssh2](https://github.com/mscdex/ssh2) · [node-ssh](https://github.com/steelbrain/node-ssh) | MIT | 🟢 | TS SSH transport (key auth, exec, timeouts) |
| [paramiko](https://github.com/paramiko/paramiko) · [asyncssh](https://github.com/ronf/asyncssh) | LGPL/EPL | 🔵 | Python SSH (template default) if we go Python |
| [ssh-mcp](https://github.com/tufantunc/ssh-mcp) | MIT | 🔵 | SSH-over-MCP reference — **no approval/allowlist**, so we keep our own gate |

## 10. Frontend / UI
| Resource | License | Tier | Take |
|---|---|---|---|
| [shadcn/ui](https://ui.shadcn.com/) + [Tailwind](https://tailwindcss.com/) | MIT | 🟢 | tables/cards/badges/dialogs for ticket list/detail/audit |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT | 🟢 | (see §1) the approval workspace |

## 11. Observability & eval
| Resource | License | Tier | Take |
|---|---|---|---|
| [Langfuse](https://github.com/langfuse/langfuse) | MIT (OSS) | 🟢 | trace tree, token/cost, LLM-as-judge eval runner, datasets |
| [Evalite](https://github.com/mattpocock/evalite) | MIT | 🟢 | Vitest-style eval harness → the **grader-mirror** + generalization scoring |
| [Logfire](https://github.com/pydantic/logfire) | MIT | 🔵 | OTel tracing (native if Python/Pydantic AI) |
| [pydantic-evals](https://ai.pydantic.dev/evals/) · Braintrust | MIT/commercial | 🔵 | alt eval harnesses |

## 12. Local LLM serving & models (provider-agnostic / privacy story)
| Resource | License | Tier | Take |
|---|---|---|---|
| [Ollama](https://github.com/ollama/ollama) | MIT | 🟢 | one-command local model serving in a container |
| [vLLM](https://github.com/vllm-project/vllm) | Apache-2.0 | 🟢 | high-throughput GPU serving |
| [LM Studio](https://lmstudio.ai/) | free | 🔵 | desktop local serving/testing |
| Open-weight agentic/coding models — **Qwen-Coder, DeepSeek, GLM, Kimi-K2, Devstral, MiniMax** families ([overview](https://kilo.ai/open-source-models)) | open weights | 🔵 | optional local model for air-gapped/privacy customers |
| **Call:** Claude (cloud) for performance in the demo; local is the **privacy differentiator** ("secrets never leave the box"). The AI SDK is provider-agnostic — swap in one line. |

## 13. Runbook-automation platforms (landscape we improve on — reference, not deps)
| Resource | License | Tier | Take |
|---|---|---|---|
| [Rundeck](https://github.com/rundeck/rundeck) | Apache-2.0 | 🔵 | the "governed job runner" status quo — our pitch: the LLM *writes/adapts* the runbook live |
| [StackStorm](https://github.com/StackStorm/st2) | Apache-2.0 | 🔵 | event-driven ops automation; action packs as recipe inspiration |

## 14. ITSM / process frameworks (domain knowledge — pitch & phase structure)
| Resource | Tier | Take |
|---|---|---|
| **ITIL Incident Management** ([Atlassian](https://www.atlassian.com/incident-management), [ManageEngine](https://www.manageengine.com/products/service-desk/it-incident-management/what-is-it-incident-management.html)) | 🔵 | the 5-step manual workflow we automate → maps to our agent phases (see BUILD.md) |
| **KEDB — Known Error Database** ([CIO Wiki](https://cio-wiki.org/wiki/Known_Error_Database_(KEDB)), [InvGate](https://blog.invgate.com/kedb)) | 🔵 | our activity log *is* a known-error record; "seen this before" = auto-built KEDB |
| [PagerDuty](https://response.pagerduty.com/) · [Atlassian](https://www.atlassian.com/incident-management/handbook) incident handbooks | 🔵 | free incident-response process docs |

## 15. Dev sandboxes (for the test harness)
| Resource | License | Tier | Take |
|---|---|---|---|
| **Docker** Ubuntu images | — | 🟢 | broken-VM scenario containers (primary; offline, no reset-burn) |
| [e2b](https://github.com/e2b-dev/e2b) | Apache-2.0 | 🔵 | TS-native ephemeral cloud sandboxes |
| [Daytona](https://github.com/daytonaio/daytona) | Apache-2.0 | 🔵 | ephemeral dev environments |

---

## License hygiene (repo is MIT — judges scan it)
- **🟢 lift directly:** MIT/Apache/BSD code, CC/MIT data (AI SDK, assistant-ui, Zod, Secretlint, gitleaks, Terminal-Bench, tldr, Langfuse, Evalite, shadcn, Ollama…).
- **🔵 don't vendor — invoke or re-express:** GPL/AGPL tools (monitoring-plugins, Lynis, sos, explainshell, NL2Bash code, trufflehog). Call them as external binaries or re-author the logic in our own words; never paste their source into the repo.
- **Never commit:** the SSH key, real tokens, or any captured secret output (gitleaks CI enforces this).
