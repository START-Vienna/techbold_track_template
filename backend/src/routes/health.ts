// Health check route — implemented in Plan 03
import { Hono } from 'hono';
export const healthRouter = new Hono();
healthRouter.get('/', (c) => c.json({ status: 'ok' }));
