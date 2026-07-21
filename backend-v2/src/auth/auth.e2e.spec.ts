import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { PG_POOL } from '../database/database.module';

const storedUser = {
  id: 91,
  email: 'session@example.com',
  name: 'Session User',
  password_hash: bcrypt.hashSync('valid-password', 4),
  provider: 'email',
  email_verified: true,
  role: 'USER',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Authentication GraphQL HTTP contract', () => {
  let app: NestExpressApplication;
  const query = jest.fn();
  const end = jest.fn();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'auth-e2e-secret';
    process.env.DATABASE_URL = 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://frontend.test.itemize';
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, end })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
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

  it('issues a CSRF cookie and returns the matching public token', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);

    const token = response.body.data.csrfToken.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers['set-cookie'][0]).toContain(`csrf-token=${token}`);
    expect(response.headers['x-csrf-token']).toBe(token);
    expect(query).not.toHaveBeenCalled();
  });

  it('logs in, emits both HTTP-only cookies, and authenticates currentUser', async () => {
    query.mockResolvedValue({ rows: [storedUser] });
    const login = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success user { uid email name role } }
        }`,
        variables: {
          input: { email: 'session@example.com', password: 'valid-password' },
        },
      })
      .expect(200);

    expect(login.body.errors).toBeUndefined();
    expect(login.body.data.login).toMatchObject({
      success: true,
      user: { uid: 91, email: 'session@example.com', name: 'Session User' },
    });
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('itemize_auth='))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('itemize_refresh='))).toBe(true);
    expect(cookies.every((cookie) => cookie.includes('HttpOnly'))).toBe(true);

    query.mockResolvedValue({ rows: [storedUser] });
    const accessCookie = cookies.find((cookie) => cookie.startsWith('itemize_auth='))!
      .split(';')[0];
    const current = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', accessCookie)
      .send({
        query: '{ currentUser { id email name provider emailVerified role createdAt } }',
      })
      .expect(200);

    expect(current.body.errors).toBeUndefined();
    expect(current.body.data.currentUser).toMatchObject({
      id: 91,
      email: 'session@example.com',
      emailVerified: true,
      role: 'USER',
    });
  });

  it('does not issue a session for bad credentials', async () => {
    query.mockResolvedValue({ rows: [storedUser] });
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success user { uid } }
        }`,
        variables: {
          input: { email: 'session@example.com', password: 'wrong-password' },
        },
      })
      .expect(200);

    expect(response.body.errors[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      reason: 'INVALID_CREDENTIALS',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refreshes and logs out through CSRF-protected GraphQL mutations', async () => {
    const agent = request.agent(app.getHttpServer());
    query.mockResolvedValue({ rows: [storedUser] });
    await agent
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success user { uid } }
        }`,
        variables: {
          input: { email: 'session@example.com', password: 'valid-password' },
        },
      })
      .expect(200);

    const csrf = await agent
      .post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);
    const token = csrf.body.data.csrfToken.token as string;

    query.mockResolvedValue({ rows: [storedUser] });
    const refreshed = await agent
      .post('/graphql')
      .set('x-csrf-token', token)
      .send({ query: 'mutation Refresh { refreshSession { success } }' })
      .expect(200);
    expect(refreshed.body).toEqual({
      data: { refreshSession: { success: true } },
    });
    expect((refreshed.headers['set-cookie'] as unknown as string[])[0]).toContain(
      'itemize_auth=',
    );

    const loggedOut = await agent
      .post('/graphql')
      .set('x-csrf-token', token)
      .send({ query: 'mutation Logout { logout { success } }' })
      .expect(200);
    expect(loggedOut.body).toEqual({ data: { logout: { success: true } } });
    const cleared = loggedOut.headers['set-cookie'] as unknown as string[];
    expect(cleared.some((cookie) => cookie.startsWith('itemize_auth=;'))).toBe(true);
    expect(cleared.some((cookie) => cookie.startsWith('itemize_refresh=;'))).toBe(true);
  });
});
