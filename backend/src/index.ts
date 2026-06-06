import { serve } from '@hono/node-server';
import { app } from './app.js';
import { getEnv } from './env.js';

// Fail fast on startup if any required env vars are missing; PORT is
// validated/coerced by the env schema (no raw NaN).
const { PORT } = getEnv();

serve({ fetch: app.fetch, port: PORT });

console.log(`Backend listening on :${PORT}`);
