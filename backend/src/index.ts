// Node server bootstrap — implemented in Plan 03
import { serve } from '@hono/node-server';
import { app } from './app.js';
serve({ fetch: app.fetch, port: 8000 });
