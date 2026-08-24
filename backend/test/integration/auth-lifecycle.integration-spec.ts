import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthEmailService } from '../../src/auth/auth-email.service';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Authentication lifecycle GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const emails = {
    sendVerification: jest.fn().mockResolvedValue(true),
    sendWelcome: jest.fn().mockResolvedValue(true),
    sendPasswordReset: jest.fn().mockResolvedValue(true),
    sendPasswordChanged: jest.fn().mockResolvedValue(true),
  };
  const createdUserIds: number[] = [];
  const suffix = `${Date.now()}-${process.pid}`;
  const primaryEmail = `auth-lifecycle-${suffix}@test.itemize`;
  const resendEmail = `auth-resend-${suffix}@test.itemize`;
  let verificationToken = '';

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.NODE_ENV = 'test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(AuthEmailService)
      .useValue(emails)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (pool && createdUserIds.length > 0) {
      await pool.query(
        `DELETE FROM organizations
         WHERE id IN (
           SELECT organization_id FROM organization_members
           WHERE user_id = ANY($1::int[])
         )`,
        [createdUserIds],
      );
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds]);
    }
    if (app) await app.close();
  });

  const mutation = (document: string, variables: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/graphql').send({ query: document, variables });

  it('atomically creates the user, personal workspace, owner membership, and default', async () => {
    const response = await mutation(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) { success message email }
      }`,
      { input: { email: primaryEmail, password: 'StrongPass1', name: 'Lifecycle Member' } },
    ).expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.register).toMatchObject({
      success: true,
      email: primaryEmail,
    });
    expect(emails.sendVerification).toHaveBeenCalledWith(
      expect.objectContaining({ email: primaryEmail }),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    verificationToken = emails.sendVerification.mock.calls[0][1];

    const persisted = await pool.query<{
      id: number;
      password_hash: string;
      verification_token: string;
      membership_count: string;
      organization_count: string;
      default_organization_id: number;
      owned_organization_id: number;
    }>(
      `SELECT u.id, u.password_hash, u.verification_token,
              COUNT(om.id)::text AS membership_count,
              COUNT(DISTINCT om.organization_id)::text AS organization_count,
              MAX(u.default_organization_id) AS default_organization_id,
              MAX(om.organization_id) FILTER (WHERE om.role = 'owner') AS owned_organization_id
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
       WHERE u.email = $1
       GROUP BY u.id`,
      [primaryEmail],
    );
    const row = persisted.rows[0];
    createdUserIds.push(Number(row.id));
    expect(row).toMatchObject({ membership_count: '1', organization_count: '1' });
    expect(Number(row.default_organization_id)).toBe(Number(row.owned_organization_id));
    expect(row.verification_token).not.toBe(verificationToken);
    await expect(bcrypt.compare('StrongPass1', row.password_hash)).resolves.toBe(true);
  });

  it('allows only one concurrent verification winner and establishes its cookie session', async () => {
    const document = `mutation Verify($input: VerifyEmailInput!) {
      verifyEmail(input: $input) { success user { uid email name role } }
    }`;
    const [first, second] = await Promise.all([
      mutation(document, { input: { token: verificationToken } }).expect(200),
      mutation(document, { input: { token: verificationToken } }).expect(200),
    ]);
    const responses = [first, second];
    const winners = responses.filter((response) => response.body.data?.verifyEmail?.success);
    const losers = responses.filter((response) => response.body.errors?.length);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].body.errors[0].extensions.code).toBe('INVALID_TOKEN');
    const cookies = winners[0].headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('itemize_auth='))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('itemize_refresh='))).toBe(true);
    expect(emails.sendWelcome).toHaveBeenCalledTimes(1);

    const persisted = await pool.query<{
      email_verified: boolean;
      verification_token: string | null;
    }>('SELECT email_verified, verification_token FROM users WHERE email = $1', [primaryEmail]);
    expect(persisted.rows[0]).toEqual({ email_verified: true, verification_token: null });
  });

  it('keeps resend non-enumerating and rotates only an eligible account token', async () => {
    emails.sendVerification.mockClear();
    const document = `mutation Resend($input: ResendVerificationInput!) {
      resendVerificationEmail(input: $input) { success message email }
    }`;
    const missing = await mutation(document, {
      input: { email: `missing-${suffix}@test.itemize` },
    }).expect(200);
    const verified = await mutation(document, { input: { email: primaryEmail } }).expect(200);
    expect(missing.body).toEqual(verified.body);
    expect(emails.sendVerification).not.toHaveBeenCalled();

    await mutation(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) { success email }
      }`,
      { input: { email: resendEmail, password: 'StrongPass2', name: 'Resend Member' } },
    ).expect(200);
    const created = await pool.query<{ id: number; verification_token: string }>(
      'SELECT id, verification_token FROM users WHERE email = $1',
      [resendEmail],
    );
    createdUserIds.push(Number(created.rows[0].id));
    const originalHash = created.rows[0].verification_token;
    emails.sendVerification.mockClear();

    const eligible = await mutation(document, { input: { email: resendEmail } }).expect(200);
    expect(eligible.body).toEqual(missing.body);
    expect(emails.sendVerification).toHaveBeenCalledTimes(1);
    const rotated = await pool.query<{ verification_token: string }>(
      'SELECT verification_token FROM users WHERE email = $1',
      [resendEmail],
    );
    expect(rotated.rows[0].verification_token).not.toBe(originalHash);
  });

  it('keeps recovery non-enumerating and permits one concurrent reset winner', async () => {
    emails.sendPasswordReset.mockClear();
    emails.sendPasswordChanged.mockClear();
    const requestDocument = `mutation RequestReset($input: RequestPasswordResetInput!) {
      requestPasswordReset(input: $input) { success message email }
    }`;
    const missing = await mutation(requestDocument, {
      input: { email: `missing-reset-${suffix}@test.itemize` },
    }).expect(200);
    const eligible = await mutation(requestDocument, {
      input: { email: resendEmail },
    }).expect(200);

    expect(eligible.body).toEqual(missing.body);
    expect(emails.sendPasswordReset).toHaveBeenCalledTimes(1);
    const rawToken = emails.sendPasswordReset.mock.calls[0][1];
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const before = await pool.query<{ password_reset_token: string }>(
      'SELECT password_reset_token FROM users WHERE email = $1',
      [resendEmail],
    );
    expect(before.rows[0].password_reset_token).not.toBe(rawToken);

    const resetDocument = `mutation Reset($input: ResetPasswordInput!) {
      resetPassword(input: $input) { success message }
    }`;
    const responses = await Promise.all([
      mutation(resetDocument, {
        input: { token: rawToken, password: 'RecoveredPass3' },
      }).expect(200),
      mutation(resetDocument, {
        input: { token: rawToken, password: 'RecoveredPass3' },
      }).expect(200),
    ]);
    expect(responses.filter((response) => response.body.data?.resetPassword?.success)).toHaveLength(1);
    expect(responses.filter((response) => response.body.errors?.[0]?.extensions?.code === 'INVALID_TOKEN')).toHaveLength(1);
    expect(emails.sendPasswordChanged).toHaveBeenCalledTimes(1);
    const after = await pool.query<{
      password_hash: string;
      password_reset_token: string | null;
    }>('SELECT password_hash, password_reset_token FROM users WHERE email = $1', [resendEmail]);
    expect(after.rows[0].password_reset_token).toBeNull();
    await expect(bcrypt.compare('RecoveredPass3', after.rows[0].password_hash)).resolves.toBe(true);
  });

  it('requires authentication and CSRF for password and profile changes', async () => {
    emails.sendPasswordChanged.mockClear();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/graphql')
      .send({
        query: `mutation Login($input: LoginInput!) {
          login(input: $input) { success user { uid } }
        }`,
        variables: { input: { email: primaryEmail, password: 'StrongPass1' } },
      })
      .expect(200);

    const changeDocument = `mutation Change($input: ChangePasswordInput!) {
      changePassword(input: $input) { success message }
    }`;
    const withoutCsrf = await agent
      .post('/graphql')
      .send({
        query: changeDocument,
        variables: { input: { currentPassword: 'StrongPass1', newPassword: 'ChangedPass4' } },
      })
      .expect(200);
    expect(withoutCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const csrf = await agent
      .post('/graphql')
      .send({ query: '{ csrfToken { token } }' })
      .expect(200);
    const csrfToken = csrf.body.data.csrfToken.token as string;
    const changed = await agent
      .post('/graphql')
      .set('x-csrf-token', csrfToken)
      .send({
        query: changeDocument,
        variables: { input: { currentPassword: 'StrongPass1', newPassword: 'ChangedPass4' } },
      })
      .expect(200);
    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.changePassword.success).toBe(true);

    const profile = await agent
      .post('/graphql')
      .set('x-csrf-token', csrfToken)
      .send({
        query: `mutation Profile($input: UpdateViewerProfileInput!) {
          updateViewerProfile(input: $input) { id email name }
        }`,
        variables: { input: { name: '  Updated Lifecycle Member  ' } },
      })
      .expect(200);
    expect(profile.body.errors).toBeUndefined();
    expect(profile.body.data.updateViewerProfile).toMatchObject({
      email: primaryEmail,
      name: 'Updated Lifecycle Member',
    });
    expect(emails.sendPasswordChanged).toHaveBeenCalledTimes(1);
    const persisted = await pool.query<{ name: string; password_hash: string }>(
      'SELECT name, password_hash FROM users WHERE email = $1',
      [primaryEmail],
    );
    expect(persisted.rows[0].name).toBe('Updated Lifecycle Member');
    await expect(bcrypt.compare('ChangedPass4', persisted.rows[0].password_hash)).resolves.toBe(true);
  });
});
