# Phase 1: Repo Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 1-repo-foundation
**Areas discussed:** Mock toggle granularity, Phase 1 mock scope, Repo layout, Docker run strategy

---

## Mock toggle granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Single `MOCK_MODE` boolean | One flag mocks everything; simplest, but can't mix real + mock services | |
| Per-service flags | `MOCK_MODE` master + `MOCK_PHOENIX`/`MOCK_SSH`/`MOCK_LLM` overrides; mix real and mock per service | ✓ |
| Runtime mode object | Resolve a config object at boot exposing per-service booleans | |

**User's choice:** Per-service flags (Recommended)
**Notes:** `MOCK_MODE=true` is the master switch (forces all on); each `MOCK_<SERVICE>` flag can override individually. Enables real-Phoenix + mock-SSH combos during incremental bring-up across later phases. Pattern: `selectPhoenix() => mock ? mockClient : realClient`.

---

## Phase 1 mock scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full mock clients now | Build mock Phoenix/SSH/LLM clients in Phase 1 | |
| Seam + health stub | Phase 1 builds only the client-resolution seam + a `/health` that reports mode; later phases plug real+mock impls in | ✓ |
| Defer entirely | No mock infrastructure until Phase 2 | |

**User's choice:** Seam + health stub (Recommended)
**Notes:** No real services exist in Phase 1 (Phoenix=P2, SSH=P4, agents=P5). Phase 1 proves the pattern: `GET /health -> { status: 'ok', mode: 'mock' }` and a `registerClient`/`resolveClient` seam honoring the per-service flags. Avoids building mock fixtures with no real counterpart yet.

---

## Repo layout

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm workspace at root | `pnpm-workspace.yaml` with `backend` + `frontend` packages; root `pnpm install`/`pnpm test` | ✓ |
| Independent packages | Each package manages its own install; no root workspace | |
| Backend-only pnpm | Leave frontend on npm; only backend uses pnpm | |

**User's choice:** pnpm workspace at root (Recommended)
**Notes:** Resolves the lockfile conflict — frontend currently ships `package-lock.json` (npm) but docs lock pnpm. Delete `frontend/package-lock.json`; adopt a root pnpm workspace covering both packages. One install, one test entry point.

---

## Docker run strategy

| Option | Description | Selected |
|--------|-------------|----------|
| tsx direct, no build | `node:22-slim`, `corepack enable`, `pnpm install`, `CMD pnpm tsx src/index.ts` — zero build step | ✓ |
| tsc build then node | Compile to JS in image, run compiled output | |
| Multi-stage build | Builder stage + slim runtime stage | |

**User's choice:** tsx direct, no build (Recommended)
**Notes:** Matches the locked `tsx = zero-build dev` stack decision in ARCHITECTURE.md §1. Backend Dockerfile rewritten from the Python skeleton. Keeps the existing Docker layout + `./keys:/keys:ro` mount and `host.docker.internal` extra_host.

## Claude's Discretion

- Exact Zod env schema shape and which keys are required vs optional (bounded by `.env.example` placeholders + ARCHITECTURE.md §10 config rules).
- `tsconfig.json` compiler options for the backend.
- Internal file organization within the locked `backend/src/` tree.

## Deferred Ideas

- None — discussion stayed within Phase 1 scope (repo foundation, env, mock seam).
