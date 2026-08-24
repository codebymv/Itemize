import express from 'express';
import request from 'supertest';
import { apiRateLimit } from './api-rate-limit';

describe('global API rate limit (legacy origin parity)', () => {
  const appWith = (environment: NodeJS.ProcessEnv) => {
    const app = express();
    app.use('/api', apiRateLimit(environment));
    app.get('/api/ping', (_request, response) => {
      response.json({ ok: true });
    });
    app.get('/health', (_request, response) => {
      response.json({ status: 'ready' });
    });
    return app;
  };

  it('serves under the ceiling with standard draft headers', async () => {
    const app = appWith({
      API_RATE_LIMIT_WINDOW_MS: '900000',
      API_RATE_LIMIT_MAX: '2',
    } as NodeJS.ProcessEnv);
    const response = await request(app).get('/api/ping');
    expect(response.status).toBe(200);
    expect(response.headers['ratelimit-limit']).toBe('2');
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('returns the exact legacy 429 dialect with Retry-After at the ceiling', async () => {
    const app = appWith({
      API_RATE_LIMIT_WINDOW_MS: '900000',
      API_RATE_LIMIT_MAX: '1',
    } as NodeJS.ProcessEnv);
    await request(app).get('/api/ping');
    const limited = await request(app).get('/api/ping');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
    });
    expect(limited.headers['retry-after']).toBe('900');
  });

  it('never limits paths outside the mounted prefixes', async () => {
    const app = appWith({
      API_RATE_LIMIT_WINDOW_MS: '900000',
      API_RATE_LIMIT_MAX: '1',
    } as NodeJS.ProcessEnv);
    await request(app).get('/api/ping');
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
  });
});
