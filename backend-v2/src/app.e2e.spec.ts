import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { PG_POOL } from './database/database.module';

describe('GraphQL foundation', () => {
  let app: INestApplication;
  const query = jest.fn();
  const end = jest.fn();
  const jwt = new JwtService();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'foundation-test-secret';
    process.env.DATABASE_URL = 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://frontend.test.itemize';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, end })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.FRONTEND_URL;
  });

  beforeEach(() => query.mockReset());

  it('exposes public readiness without touching the database', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ readiness }' })
      .expect(200);
    expect(response.body).toEqual({ data: { readiness: 'ready' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('allows credentialed GraphQL preflight from the configured frontend', async () => {
    const response = await request(app.getHttpServer())
      .options('/graphql')
      .set('Origin', 'https://frontend.test.itemize')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-organization-id')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://frontend.test.itemize',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers'].toLowerCase()).toContain(
      'x-organization-id',
    );
  });

  it('rejects a protected query without an access cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ viewerContext { userId } }' })
      .expect(200);
    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('returns verified identity, membership, role, and request ID', async () => {
    query.mockResolvedValue({ rows: [{ organization_id: 42, role: 'member' }] });
    const token = await jwt.signAsync(
      { id: 7 },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', '42')
      .set('x-request-id', 'foundation-e2e')
      .send({
        query:
          '{ viewerContext { userId organizationId organizationRole requestId } }',
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        viewerContext: {
          userId: 7,
          organizationId: 42,
          organizationRole: 'member',
          requestId: 'foundation-e2e',
        },
      },
    });
  });

  it('rejects a malformed organization header before PostgreSQL', async () => {
    const token = await jwt.signAsync(
      { id: 7 },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', '-1')
      .send({ query: '{ viewerContext { organizationId } }' })
      .expect(200);

    expect(response.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ORGANIZATION_ID',
      field: 'x-organization-id',
    });
    expect(query).not.toHaveBeenCalled();
  });
});
