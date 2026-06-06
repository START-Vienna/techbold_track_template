# Testing Patterns

**Analysis Date:** 2026-06-06

## Current State

No test framework is configured in this project. Neither the frontend nor the backend has a test runner, test config, or test files. This is a skeleton template — testing infrastructure must be added before writing tests.

## Recommended Setup

### Frontend (TypeScript/React)

Add Vitest and React Testing Library:

```bash
bun add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Add to `frontend/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

Add `frontend/src/test/setup.ts`:
```typescript
import "@testing-library/jest-dom";
```

Add to `frontend/package.json` scripts:
```json
"test": "vitest",
"test:ui": "vitest --ui",
"coverage": "vitest run --coverage"
```

### Backend (Python/FastAPI)

Add pytest and httpx for FastAPI test client:

```bash
uv add --dev pytest pytest-asyncio httpx
```

Config in `backend/pyproject.toml` (create if absent):
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

## Test File Organization

**Frontend — co-located with source:**
```
frontend/src/
├── components/
│   ├── TicketList.tsx
│   └── TicketList.test.tsx
├── App.tsx
├── App.test.tsx
└── test/
    └── setup.ts
```

**Backend — separate `tests/` directory:**
```
backend/
├── app/
│   └── main.py
└── tests/
    ├── __init__.py
    ├── conftest.py
    └── test_main.py
```

**Naming:**
- Frontend: `[ComponentName].test.tsx` or `[module].test.ts`
- Backend: `test_[module].py`

## Test Structure

**Frontend (Vitest + RTL):**
```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
```

**Backend (pytest + httpx TestClient):**
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

## Mocking

**Framework (Frontend):** Vitest built-in mocking (`vi`)

**Patterns:**
```typescript
import { vi } from "vitest";

// Mock a module
vi.mock("../api/client", () => ({
  fetchTickets: vi.fn().mockResolvedValue([]),
}));

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [] }),
});
```

**What to mock:**
- Network requests (`fetch`, API client functions)
- External SDK calls (OpenAI, SSH clients)
- Environment variables (`import.meta.env`)

**What NOT to mock:**
- React itself
- Pure utility functions
- FastAPI route logic in backend unit tests (use the real app via TestClient)

**Backend mocking (pytest):**
```python
from unittest.mock import patch, AsyncMock

def test_route_with_external_call(monkeypatch):
    mock_response = AsyncMock(return_value={"tickets": []})
    monkeypatch.setattr("app.routes.tickets.fetch_erp_tickets", mock_response)
    response = client.get("/api/tickets")
    assert response.status_code == 200
```

## Fixtures and Factories

**Backend — `tests/conftest.py`:**
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def sample_ticket():
    return {"id": "T-001", "title": "Server unreachable", "status": "open"}
```

**Frontend — inline factories for now; extract to `src/test/factories.ts` when repeated:**
```typescript
const makeTicket = (overrides = {}) => ({
  id: "T-001",
  title: "Server unreachable",
  status: "open",
  ...overrides,
});
```

## Coverage

**Requirements:** None enforced (no config present)

**Recommended targets once tests are added:**
- Backend route handlers: 100% of happy paths + key error paths
- Frontend components: render + primary user interactions

**View coverage (frontend):**
```bash
bun run coverage
```

**View coverage (backend):**
```bash
uv run pytest --cov=app --cov-report=term-missing
```

## Test Types

**Unit Tests:**
- Pure utility functions, data transformations, business logic
- FastAPI route handlers via TestClient (in-process, no real network)

**Integration Tests:**
- Backend routes that call external services — mock the HTTP client (`httpx`), test the full route handler
- Frontend components that wire up multiple child components

**E2E Tests:**
- Not configured
- If added: use Playwright via `bash playwright` — do not load Playwright MCP

## Common Patterns

**Async testing (Frontend):**
```typescript
import { waitFor } from "@testing-library/react";

it("loads tickets on mount", async () => {
  render(<TicketList />);
  await waitFor(() => {
    expect(screen.getByText("T-001")).toBeInTheDocument();
  });
});
```

**Error path testing (Backend):**
```python
def test_missing_ticket_returns_404(client):
    response = client.get("/api/tickets/nonexistent")
    assert response.status_code == 404
    assert "detail" in response.json()
```

**Environment variable testing (Frontend):**
```typescript
it("uses VITE_API_BASE for requests", () => {
  import.meta.env.VITE_API_BASE = "http://test-server";
  // ... assert the client uses the correct base URL
});
```

---

*Testing analysis: 2026-06-06*
