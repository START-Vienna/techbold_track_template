# External Integrations

**Analysis Date:** 2026-06-06

## APIs & External Services

**ERP System:**
- Phoenix ERP Mock — source of truth for tickets, customers, and activity logging
  - Base URL: `http://68.210.101.85:8000` (production mock on Builder Base)
  - Alt URLs: `http://host.docker.internal:8000` (host mock), `http://localhost:8000`
  - OpenAPI spec: `docs/phoenix-openapi.yaml`
  - SDK/Client: `httpx` (not yet installed — listed as suggested dep in `backend/requirements.txt`)
  - Auth: `Authorization: Bearer <PHOENIX_API_TOKEN>` — static team token

**AI / LLM:**
- Azure OpenAI — intended for AI-assisted troubleshooting
  - SDK/Client: `openai` (not yet installed — listed as suggested dep in `backend/requirements.txt`)
  - Auth: env var (name not confirmed — `.env.example` unreadable)

## Data Storage

**Databases:**
- None detected — no ORM, no DB client, no migration tooling present

**File Storage:**
- Local filesystem only — SSH private keys stored in `./keys/` (mounted read-only into backend at `/keys` via `docker-compose.yml`)

**Caching:**
- None detected

## Authentication & Identity

**API Auth (outbound to Phoenix ERP):**
- Static bearer token per team
- Token kept on the backend only — `backend/app/main.py` comments explicitly state the ERP token must never reach the browser

**SSH Auth (outbound to customer VMs):**
- Private key authentication via `.pem` files in `./keys/`
- SSH client: `paramiko` (not yet installed — listed as suggested dep in `backend/requirements.txt`)
- Key injected into backend container at `/keys` read-only

**Inbound Auth (frontend → backend):**
- None implemented — CORS is fully open (`allow_origins=["*"]`) for local dev (`backend/app/main.py`)

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Uvicorn access logs only (default stdout)

## CI/CD & Deployment

**Hosting:**
- Docker Compose — `docker-compose.yml` at repo root
- No cloud-specific deployment config detected

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars (inferred from codebase and OpenAPI spec):**
- `PHOENIX_API_TOKEN` — bearer token for Phoenix ERP API
- `VITE_API_BASE` — frontend base URL for backend calls (set to `http://localhost:8000` in `docker-compose.yml`)
- Azure OpenAI credentials (specific var names not confirmed — `.env.example` unreadable)

**Secrets location:**
- `.env` file at repo root (loaded by Docker Compose, not committed)
- SSH private keys in `./keys/` directory (git-ignored via `keys/.gitkeep`)

## Phoenix ERP API Endpoints

All endpoints require `Authorization: Bearer <PHOENIX_API_TOKEN>`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/me` | Get current technician identity |
| GET | `/api/v1/me/tickets` | List assigned tickets (filterable by status/priority) |
| GET | `/api/v1/tickets/{id}` | Get single ticket |
| GET | `/api/v1/tickets/{id}/customer-system` | Get SSH target for a ticket |
| PATCH | `/api/v1/tickets/{id}/status` | Update ticket status (OPEN/PENDING/DONE) |
| GET | `/api/v1/customers/{id}` | Get customer info including system details |
| POST | `/api/v1/activities/create` | Write activity log back to ERP |
| POST | `/api/v1/me/reset` | Reset activities and reboot VMs |

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

---

*Integration audit: 2026-06-06*
