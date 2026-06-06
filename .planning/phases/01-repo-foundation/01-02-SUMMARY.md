---
phase: 01-repo-foundation
plan: "02"
subsystem: config
tags: [env, zod, tdd, mock-mode, config]
dependency_graph:
  requires:
    - 01-01 (pnpm workspace, backend package.json, vitest, zod declared)
  provides:
    - backend/src/env.ts — Zod-validated env parser, resolveClientMode, isMockMode, EnvConfig type
    - backend/src/tests/env.test.ts — 20-case Vitest suite
  affects:
    - All downstream plans that import from env.ts (plans 03–09)
tech_stack:
  added: []
  patterns:
    - parseEnv() as pure function, module-level env = loadEnv() for fail-fast startup
    - Dependency-injected config argument (default = env) for testable pure functions
    - z.preprocess for string-to-boolean coercion of env var booleans
key_files:
  created:
    - backend/src/tests/env.test.ts
  modified:
    - backend/src/env.ts
decisions:
  - "parseEnv throws Error (not process.exit) — loadEnv() private wrapper does the exit so tests reach validation logic directly"
  - "resolveClientMode accepts optional config arg (default=env) for dependency injection without a factory pattern"
  - "isMockMode returns true when MOCK_MODE OR any per-service flag is true — health route shows 'mock' whenever any service is mocked"
  - "EnvSchema defined at module level, exported as EnvConfig type — downstream modules can import the type without re-parsing"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-06"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 01 Plan 02: Env Parser + Mock-Flag Resolver Summary

Zod-validated env parser with fail-fast startup behavior and per-service mock-flag resolver, built TDD (RED → GREEN). All 20 test cases pass; no regressions in other test files.

## What Was Built

- `backend/src/env.ts` — full implementation replacing the `export {}` stub:
  - `EnvSchema` (Zod schema) with 3 required strings, 3 optional strings with defaults, 4 optional booleans defaulting false
  - `EnvConfig` type exported (inferred from schema)
  - `parseEnv(raw)` — pure function, throws `Error` with message `"Missing required env var: <KEY>"` on validation failure; never prints secret values (T-02-01)
  - `loadEnv()` — private module-level wrapper that calls `parseEnv(process.env)` and exits on error
  - `env` — exported const, the parsed config object callers use directly
  - `resolveClientMode(service, config?)` — implements D-01 flag precedence: MOCK_MODE=true forces all services to mock; when false, per-service flag decides independently
  - `isMockMode(config?)` — returns true when MOCK_MODE=true OR any per-service mock flag is true
- `backend/src/tests/env.test.ts` — 20 Vitest cases covering:
  - parseEnv happy path (typed config with correct values)
  - parseEnv missing PHOENIX_API_URL, PHOENIX_API_TOKEN, OPENAI_API_KEY → error message contains key name
  - MOCK_MODE "true" → true; absent → false; MOCK_PHOENIX coercion
  - T-02-01 security: error message contains key name but NOT token value
  - resolveClientMode: MOCK_MODE=true forces all 3 services to mock
  - resolveClientMode: per-service isolation (MOCK_PHOENIX=true doesn't affect ssh)
  - resolveClientMode: all 3 real when all flags false
  - isMockMode: true on MOCK_MODE, true on any per-service flag, false when all off

## Verification Results

| Check | Result |
|-------|--------|
| RED phase: 19/20 tests fail against stub | PASS |
| GREEN phase: 20/20 tests pass | PASS |
| Full suite: 20 pass, 3 skipped (planned describe.skip) | PASS |
| Smoke: `resolveClientMode('phoenix')` with no flags → `real` | PASS |
| Error message contains key name, not value | PASS |
| process.env never mutated in tests | PASS |

## TDD Gate Compliance

- RED commit: `48ca736` — `test(01-02): add failing env parser + mock-flag resolver tests`
- GREEN commit: `6adcde8` — `feat(01-02): implement Zod env parser and mock-flag resolver`
- REFACTOR: no changes needed — skipped (no commit)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseEnv threw via process.exit instead of Error**
- **Found during:** GREEN phase first run
- **Issue:** Initial implementation called `process.exit(1)` directly inside `parseEnv()`. Vitest intercepts `process.exit` and throws a non-matching wrapper error, so `expect(() => parseEnv(raw)).toThrow(/KEY_NAME/)` failed with "process.exit unexpectedly called with 1".
- **Fix:** Changed `parseEnv()` to throw `new Error("Missing required env var: KEY")`. Extracted a private `loadEnv()` wrapper at module level that catches and calls `process.exit(1)` — matching the plan's implementation guidance exactly.
- **Files modified:** `backend/src/env.ts`
- **Commit:** Part of `6adcde8`

## Known Stubs

None — env.ts is fully implemented. All exports (`env`, `parseEnv`, `resolveClientMode`, `isMockMode`, `EnvConfig`) are real and tested.

## Threat Surface Scan

No new network endpoints, auth paths, file access, or schema changes. Threat mitigations confirmed:

| Threat | Status |
|--------|--------|
| T-02-01: Error messages must not leak secret values | MITIGATED — tested in case "does not include secret values in error messages" |
| T-02-02: Tests must not mutate process.env | MITIGATED — all tests pass fabricated env objects to parseEnv() directly |
| T-02-03: Fail-fast exit on missing var | ACCEPTED — loadEnv() calls process.exit(1), parseEnv() throws for testability |

## Self-Check: PASSED

Files verified present:
- backend/src/env.ts — FOUND
- backend/src/tests/env.test.ts — FOUND

Commits verified:
- 48ca736 (test RED) — FOUND
- 6adcde8 (feat GREEN) — FOUND
