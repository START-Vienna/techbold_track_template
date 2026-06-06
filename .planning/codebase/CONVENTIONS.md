# Coding Conventions

**Analysis Date:** 2026-06-06

## Project Context

This is a skeleton/template project. The conventions below describe the patterns established in the scaffold code. Teams building on this template should follow these patterns consistently.

## Naming Patterns

**Files:**
- React components: PascalCase, `.tsx` extension — `App.tsx`
- Entry points: lowercase — `main.tsx`, `main.py`
- CSS: lowercase, matches component or scope — `index.css`
- Config files: lowercase with dots — `vite.config.ts`, `tsconfig.json`
- Python modules: lowercase with underscores — `__init__.py`, `main.py`

**Functions (TypeScript/React):**
- Components: PascalCase default exports — `export default function App()`
- Route handlers (FastAPI): snake_case — `def health()`

**Variables:**
- TypeScript: camelCase for variables and props
- Python: snake_case throughout

**Types:**
- TypeScript interfaces and types: PascalCase (no `I` prefix)

## Code Style

**Formatting (Frontend):**
- No Prettier config present — no enforced formatter in place
- TypeScript strict mode enabled in `tsconfig.json`
- `noUnusedLocals` and `noUnusedParameters` disabled (intentional for skeleton)

**Formatting (Backend):**
- No ruff or black config present — no enforced formatter in place
- Python docstrings: module-level docstrings used to describe intent; function docstrings omitted on trivial/obvious functions

**Linting:**
- No ESLint, Biome, or oxlint config present
- No ruff config present
- Teams adopting this template should add Biome (frontend) and ruff (backend)

## Import Organization

**TypeScript (established in `main.tsx`):**
1. External libraries — `import React from "react"`
2. Internal modules — `import App from "./App"`
3. CSS/assets — `import "./index.css"`

**Python (established in `main.py`):**
1. Standard library
2. Third-party packages — `from fastapi import FastAPI`

**Path Aliases:**
- None configured — imports use relative paths (`./App`)

## Component Design

**Pattern:**
- Single default export per file
- Functional components only (no class components)
- Inline styles used in skeleton (`style={{ ... }}`) — teams should move to CSS classes

**Example from `frontend/src/App.tsx`:**
```tsx
export default function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 680, margin: "12vh auto", padding: 24 }}>
      <h1>AI Service Desk Autopilot</h1>
    </main>
  );
}
```

## FastAPI Route Design

**Pattern:**
- Route functions are plain `def` (sync) for simple handlers; use `async def` when doing I/O
- Return plain dicts for JSON responses — no explicit `JSONResponse` wrapping for simple cases
- Group related routes together; the skeleton suggests logical groupings via comments

**Example from `backend/app/main.py`:**
```python
@app.get("/health")
def health():
    return {"status": "ok"}
```

## Error Handling

**Frontend:**
- No error handling patterns established in skeleton
- Teams should implement React error boundaries for component trees
- API call errors should be surfaced to the UI, not silently swallowed

**Backend:**
- FastAPI's built-in exception handling is in place via the framework
- Use FastAPI `HTTPException` for expected error conditions
- Do not use bare `except:` or `except Exception: pass`

## Environment Configuration

**Frontend:**
- Environment variables via Vite: `import.meta.env.VITE_API_BASE`
- All public vars prefixed with `VITE_`
- Default fallback documented in comments: `http://localhost:8000`

**Backend:**
- `pydantic-settings` is in `requirements.txt` — use `BaseSettings` for config, not `os.getenv` directly

## Security Constraints (from skeleton comments)

- ERP token and SSH keys must stay on the backend — never passed to the browser
- CORS is open (`allow_origins=["*"]`) for local dev only — restrict in production

## Comments

**When to comment:**
- Module-level docstrings to describe purpose and intent (Python)
- Inline comments only for non-obvious constraints or workarounds
- The skeleton uses comments to guide implementers — remove scaffolding comments as code is written

**Do not:**
- Leave `# TODO` in commits — implement or file an issue
- Add section-header banners
- Restate what the code does

## CSS

**Pattern (`index.css`):**
- Minimal global reset only — `box-sizing: border-box`, bare `body` styles
- Component-specific styles go in component files or dedicated CSS modules
- No CSS framework configured

---

*Convention analysis: 2026-06-06*
