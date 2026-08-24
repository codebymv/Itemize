import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PG_POOL } from '../database/database.module';
import { OperationalStatusController } from './operational-status.controller';

describe('OperationalStatusController process probes', () => {
  let app: INestApplication;
  const pool = {
    query: jest.fn(),
    connect: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OperationalStatusController],
      providers: [{ provide: PG_POOL, useValue: pool }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    pool.connect.mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      release: jest.fn(),
    });
  });

  it('reports the retained health shape with a database latency check', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(['healthy', 'degraded']).toContain(response.body.status);
    expect(response.body.checks.database).toMatchObject({
      ok: true,
      message: 'Connected',
    });
    expect(response.body.checks.apiRoutes).toEqual({
      ok: true,
      message: 'Registered',
    });
    expect(response.body.checks.email).toHaveProperty('ok');
    expect(typeof response.body.uptime).toBe('number');
  });

  it('reports starting within the grace window when the database is down', async () => {
    pool.query.mockRejectedValue(new Error('connection refused'));
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body.status).toBe('starting');
    expect(response.body.startup).toContain('Grace period');
    expect(response.body.checks.database.ok).toBe(false);
  });

  it('reports the retained status shape with this runtime route inventory', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/status')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      version: '0.8.2',
      services: { api: 'operational', database: 'operational' },
      healthChecks: { database: true },
    });
    expect(response.body.server.memory.used).toMatch(/MB$/);
    expect(response.body.endpoints.total).toBeGreaterThan(0);
    expect(response.body.endpoints.available).toContain('/api/health');
  });

  it('degrades the status services when the database is unreachable', async () => {
    pool.connect.mockRejectedValue(new Error('connection refused'));
    const response = await request(app.getHttpServer())
      .get('/api/status')
      .expect(200);
    expect(response.body.services.database).toBe('degraded');
    expect(response.body.healthChecks.database).toBe(false);
  });
});
