# Tech Stack — AI Service Desk Autopilot

TypeScript-first. One unified app: the agent, the streaming, and the human-approval UI all speak the
same protocol. Reuse the plumbing; build only the graded differentiators ourselves.

## Stack

| Layer | Choice | Why |
|---|---|---|
| **Language / runtime** | **TypeScript + Node 20** (or Bun) | One language across agent + API + UI |
| **App framework** | **Next.js 15 (App Router)** | Hosts the UI **and** the agent API routes **and** streaming in one app (alt: Vite React + **Hono** backend if split) |
| **Agent framework** | **Vercel AI SDK 6** | Agent loop (`stopWhen`), tool calling, **`needsApproval` HITL**, native **MCP** |
| **LLM** | **Anthropic Claude** via `@ai-sdk/anthropic` | Opus (plan) + Haiku (cheap probes); bring-your-own key |
| **Tool schemas / structured output** | **Zod** | Type-safe tool args + validated activity object |
| **Approval-gate UI** | **assistant-ui** | Tool calls → cards with inline approve/edit/reject; native AI SDK integration |
| **UI components** | **React + Tailwind + shadcn/ui** | Ticket list/detail/log, fast and clean |
| **Streaming / realtime** | **AI SDK data-stream** (`useChat`/`useAssistant`) | No custom WebSocket needed |
| **SSH runner** | **ssh2** (or `node-ssh` wrapper) | Key auth, timeouts, exec |
| **Command parsing (safety)** | **tree-sitter-bash** or **bash-parser** | AST parse → defeats obfuscation before matching the deny-list |
| **Secret detection / redaction** | **Secretlint** + ported gitleaks regex | Node-native secret linter; redact output before log/UI |
| **Observability** | **Langfuse** (JS SDK) via AI SDK OpenTelemetry | Trace every run, token/cost, tool calls |
| **Eval / grader-mirror + harness** | **Evalite** (or Braintrust) + Langfuse LLM-as-judge | Score held-out scenarios = the grader-mirror |
| **Secret-scan CI** | **gitleaks** GitHub Action | Repo stays secret-clean (C + E) |
| **Tests** | **Vitest** | Safety unit tests + module tests |
| **Run** | **docker-compose** | One-command reproducible run (E) |

## What's prebuilt in each (so we don't build it)

- **Vercel AI SDK 6** — *for the agent loop + human approval gate.* Prebuilt: the multi-step tool-calling loop (`stopWhen: stepCountIs`), the `needsApproval` flag that **pauses a tool before execution and resumes on approve/deny** (the entire approve/edit/reject mechanic), streaming, retries, and MCP client. We write the tools, not the loop.
- **assistant-ui** — *for the technician workspace UI.* Prebuilt: chat/thread UI, **tool calls rendered as React components**, **inline human-in-the-loop approval widgets**, generative UI, streaming message state. We skin it; we don't build the approval cards or the live log.
- **`@ai-sdk/anthropic`** — *for talking to Claude.* Prebuilt: Anthropic provider, tool-use wiring, model routing (swap Opus↔Haiku in one line), caching.
- **Zod** — *for tool/IO schemas.* Prebuilt: runtime validation + TS types for every tool argument and the final activity object — the model is forced to emit valid structured output.
- **ssh2** — *for reaching the VM.* Prebuilt: SSH transport, key-based auth, `exec` with streams, timeouts. We add the output cap + safety gate around it.
- **tree-sitter-bash / bash-parser** — *for the safety layer's parser.* Prebuilt: a real shell AST (pipelines, redirects, command substitution) so we match on normalized tokens, not brittle raw regex.
- **Secretlint** — *for secret protection.* Prebuilt: a library of secret detectors (keys, tokens, PEM) we run over command output before it hits the log/UI/activity — plus a CI mode.
- **Langfuse** — *for observability + eval.* Prebuilt: full trace tree (prompts, tool calls, costs), an LLM-as-judge eval runner, and datasets — debug the agent and score it.
- **Evalite** — *for the grader-mirror + generalization tests.* Prebuilt: a Vitest-style eval harness (datasets, scorers, watch mode) to run the agent against scenarios and score fix/persistence/safety — run the rubric against ourselves.
- **gitleaks** — *for the repo secret scan.* Prebuilt: the exact scan the judges run, as a pre-commit/CI gate so nothing leaks.
- **shadcn/ui + Tailwind** — *for the rest of the UI.* Prebuilt: accessible components (tables, cards, badges, dialogs) for the ticket list/detail/audit views.

## What we build ourselves (the graded differentiators)

1. **Safety layer** — `classify()` (DENY/CONFIRM/ALLOW) + `redact()`. *(20 pts + hard-fail immunity.)*
2. **The troubleshooting loop + prompts**, wired to our diagnostic knowledge. *(35 pts.)*
3. **Activity generator** → the full graded ERP schema, sanitized.
4. **ERP client** → the `/api/v1` contract.
