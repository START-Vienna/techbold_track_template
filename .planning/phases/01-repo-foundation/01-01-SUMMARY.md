---
phase: 01-repo-foundation
plan: "01"
subsystem: scaffold
tags: [scaffold, node, pnpm, hono, typescript, dockerfile]
dependency_graph:
  requires: []
  provides:
    - pnpm workspace root (backend + frontend)
    - backend/src/ full directory tree stubs
    - node:22-slim Dockerfile with corepack + pnpm
    - RiskLevel enum
  affects:
    - All subsequent plans (import paths established here)
tech_stack:
  added:
    - Node 22 + pnpm (replaces Python/pip)
    - Hono + @hono/node-server
    - Vercel AI SDK v5 (ai package)
    - tsx (zero-build dev runner)
    - better-sqlite3, ssh2, zod, vitest
  patterns:
    - pnpm workspace monorepo
    - NodeNext module resolution
    - Stub-first scaffold (export {} + comment per module)
key_files:
  created:
    - pnpm-workspace.yaml
    - backend/package.json
    - backend/tsconfig.json
    - backend/Dockerfile
    - backend/.dockerignore
    - backend/src/env.ts
    - backend/src/app.ts
    - backend/src/index.ts
    - backend/src/routes/health.ts
    - backend/src/routes/tickets.ts
    - backend/src/routes/runs.ts
    - backend/src/routes/approvals.ts
    - backend/src/routes/activity.ts
    - backend/src/routes/events.ts
    - backend/src/phoenix/client.ts
    - backend/src/phoenix/mock.ts
    - backend/src/phoenix/types.ts
    - backend/src/ssh/client.ts
    - backend/src/ssh/executor.ts
    - backend/src/ssh/mock.ts
    - backend/src/ssh/types.ts
    - backend/src/safety/command-policy.ts
    - backend/src/safety/classifier.ts
    - backend/src/safety/redaction.ts
    - backend/src/safety/risk-levels.ts
    - backend/src/store/db.ts
    - backend/src/store/schema.ts
    - backend/src/store/runs.ts
    - backend/src/store/audit.ts
    - backend/src/events/run-event-bus.ts
    - backend/src/events/sse.ts
    - backend/src/tests/safety.test.ts
    - backend/src/tests/phoenix-client.test.ts
    - backend/src/tests/orchestrator.test.ts
    - backend/src/ai/model.ts
    - backend/src/ai/prompts.ts
    - backend/src/ai/orchestrator.ts
    - backend/src/ai/agents/problem-analyzer.ts
    - backend/src/ai/agents/customer-system-analyzer.ts
    - backend/src/ai/agents/problem-solver.ts
    - backend/src/ai/agents/validator.ts
    - backend/src/ai/agents/activity-log-generator.ts
    - backend/src/ai/tools/phoenix-tools.ts
    - backend/src/ai/tools/ssh-tools.ts
    - backend/src/ai/tools/audit-tools.ts
    - backend/src/ai/tools/safety-tools.ts
  modified:
    - docker-compose.yml (backend build context → repo root)
    - .env.example (added 10 placeholder keys)
    - .gitignore (added backend/dist/)
  deleted:
    - backend/app/__init__.py
    - backend/app/main.py
    - backend/requirements.txt
    - frontend/package-lock.json
decisions:
  - "Node 22 + pnpm replaces Python/FastAPI per ARCHITECTURE.md §1 — one language across backend, agent, and frontend"
  - "pnpm workspace at repo root; Docker build context is repo root so Dockerfile can COPY both backend/ and frontend/package.json"
  - "RiskLevel enum implemented for real in Plan 01 — all other stubs are export {} placeholders"
  - "ssh-tools.ts stub carries an explicit anti-pattern comment: executeApprovedCommand must never be a model tool"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-06"
  tasks_completed: 4
  files_created: 46
  files_modified: 3
  files_deleted: 4
---

# Phase 01 Plan 01: Node Scaffold and Stub Tree Summary

Replaced the dead Python/FastAPI skeleton with the locked Node 22 + Hono + TypeScript scaffold. pnpm workspace established at repo root; backend Dockerfile rewritten to node:22-slim with corepack + pnpm; full backend/src/ directory tree (41 TypeScript files) created as typed stubs per ARCHITECTURE.md §2.

## What Was Built

- pnpm-workspace.yaml listing backend and frontend packages
- backend/package.json with hono, @hono/node-server, @hono/zod-validator, zod, tsx, vitest, ai (Vercel AI SDK v5), @ai-sdk/openai, better-sqlite3, ssh2
- backend/tsconfig.json with NodeNext module resolution, ES2022 target, strict mode
- backend/Dockerfile: node:22-slim → corepack enable → pnpm install --frozen-lockfile → tsx runner
- backend/.dockerignore excluding node_modules, dist, .env, test files
- docker-compose.yml updated: backend build context changed from ./backend to . (repo root) so the Dockerfile can COPY pnpm-workspace.yaml and frontend/package.json
- All 41 backend/src/ TypeScript stubs: routes, phoenix, ssh, safety, store, events, ai (agents + tools), plus 3 Vitest test stubs
- backend/src/safety/risk-levels.ts: real RiskLevel enum (SAFE_READ_ONLY | LOW_RISK_CHANGE | MEDIUM_RISK_CHANGE | HIGH_RISK_BLOCKED) — only non-stub file in this plan
- .env.example updated with all 10 required placeholder keys; no real credentials
- Python skeleton (backend/app/, backend/requirements.txt) deleted; frontend/package-lock.json deleted

## Verification Results

| Check | Result |
|-------|--------|
| Python artifacts gone | PASS |
| pnpm-workspace.yaml lists backend + frontend | PASS |
| Dockerfile FROM node:22-slim | PASS |
| docker-compose.yml context: . | PASS |
| .env and keys/ git-ignored | PASS |
| backend/src TypeScript file count ≥ 38 | PASS (41) |
| RiskLevel HIGH_RISK_BLOCKED exported | PASS |
| ai/ subtree count = 12 | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

All backend/src/ files except risk-levels.ts are intentional stubs (`export {}` with a phase comment). These are tracked per-plan:

| File | Stub type | Resolved in |
|------|-----------|-------------|
| backend/src/env.ts | `export const env = {} as Record<string, string>` | Plan 02 |
| backend/src/app.ts | Hono instance, no routes | Plan 03 |
| backend/src/index.ts | serve() call only | Plan 03 |
| backend/src/routes/health.ts | GET / → {status:ok} only | Plan 03 |
| All other routes/, phoenix/, ssh/, store/, events/, ai/ | `export {}` | Plans 02–07 |

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Only file/package structure — no executable logic committed. Threat mitigations T-01-01 through T-01-04 confirmed:
- .env.example contains only placeholder strings
- backend/dist/ added to .gitignore
- backend/.dockerignore excludes .env and node_modules
- No package installs ran in this plan (deferred to Plan 03 verification)

## Self-Check: PASSED

All 4 task commits present:
- ce0239c: chore(01-01): establish pnpm workspace and backend Node package
- 62f2740: chore(01-01): rewrite Dockerfile to node:22-slim, delete Python skeleton
- 7cb0d5a: chore(01-01): scaffold backend/src/ routes, phoenix, ssh, store, events, safety stubs
- bc7f2e9: chore(01-01): scaffold backend/src/ai/ subtree stubs (agents, tools, orchestrator)

All 41 backend/src/*.ts files verified present. RiskLevel enum verified. ai/ subtree count = 12 verified.
