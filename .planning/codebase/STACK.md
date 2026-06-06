# Technology Stack

**Analysis Date:** 2026-06-06

## Languages

**Primary:**
- Python 3.11 - Backend (`backend/`)
- TypeScript 5.6 - Frontend (`frontend/src/`)

**Secondary:**
- HTML - Entry point (`frontend/index.html`)
- CSS - Styles (`frontend/src/index.css`)

## Runtime

**Backend:**
- Python 3.11 (slim Docker image — `backend/Dockerfile`)

**Frontend:**
- Node 20 (slim Docker image — `frontend/Dockerfile`)

**Package Manager:**
- Backend: pip (via `backend/requirements.txt`) — no lockfile
- Frontend: npm — lockfile present (`frontend/package-lock.json`)

## Frameworks

**Backend:**
- FastAPI 0.115.6 — HTTP API server (`backend/app/main.py`)
- Uvicorn 0.34.0 (standard extras) — ASGI server, run command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Pydantic-settings 2.7.1 — environment/config management

**Frontend:**
- React 18.3.1 — UI framework (`frontend/src/App.tsx`, `frontend/src/main.tsx`)
- Vite 5.4.11 — dev server and build tool (`frontend/vite.config.ts`)

**Build/Dev:**
- `@vitejs/plugin-react` 4.3.4 — Vite plugin for React/JSX transform
- TypeScript compiler (`tsc`) — type-check step before production build

## Key Dependencies

**Critical (installed):**
- `fastapi==0.115.6` — entire HTTP layer
- `uvicorn[standard]==0.34.0` — production-ready ASGI server with websocket/http2 extras
- `pydantic-settings==2.7.1` — typed settings from env vars

**Suggested but not yet installed** (commented in `backend/requirements.txt`):
- `httpx` — calling the Phoenix ERP REST API
- `paramiko` — SSH to customer VMs
- `openai` — Azure OpenAI integration

**Frontend:**
- `react@^18.3.1` + `react-dom@^18.3.1` — core UI

## Configuration

**Environment:**
- Backend reads settings via pydantic-settings (env vars / `.env` file)
- `.env.example` present at repo root — copy to `.env` for local dev
- Docker Compose loads `.env` with `required: false` so the stack starts without it
- Frontend reads `VITE_API_BASE` at build/dev time (set to `http://localhost:8000` in `docker-compose.yml`)

**Build:**
- `frontend/tsconfig.json` — TypeScript config (target ES2020, strict mode, bundler module resolution)
- `frontend/vite.config.ts` — Vite config (React plugin, host `0.0.0.0`, port 5173)

## Platform Requirements

**Development:**
- Docker + Docker Compose (primary dev environment)
- Backend: port 8000, Frontend: port 5173
- SSH private key(s) as `.pem` files placed in `./keys/` (git-ignored, mounted read-only into backend container)

**Production:**
- Containerised deployment via Docker Compose
- Backend exposed on port 8000, Frontend on port 5173
- No production-specific build config detected beyond the Dockerfiles

---

*Stack analysis: 2026-06-06*
