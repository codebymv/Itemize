import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generate } from 'otplib';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { AdminMfaService } from '../../src/auth/admin-mfa.service';
import { AuthSessionRepository } from '../../src/auth/auth-session.repository';
import { AuthEmailService } from '../../src/auth/auth-email.service';
import { AccessTokenService } from '../../src/auth/access-token.service';
import { SessionService } from '../../src/auth/session.service';
import { encryptMfa, decryptMfa } from '../../src/auth/admin-mfa-crypto';

describe('Admin MFA actual PostgreSQL and GraphQL boundaries', () => {
  let app: NestExpressApplication,
    pool: Pool,
    mfa: AdminMfaService,
    sessions: AuthSessionRepository;
  let userId: number, sid: string;
  const users: number[] = [];
  const jwt = new JwtService();
  const identity = () => ({ userId, sessionId: sid });
  const password = 'MfaQaPassword123!';
  const original = { ...process.env };
  beforeAll(async () => {
    process.env.JWT_SECRET = 'isolated-admin-mfa-integration-secret';
    process.env.DATABASE_URL = 'postgresql://unused/test';
    process.env.ADMIN_MFA_ACTIVE_KEY_ID = 'test';
    process.env.ADMIN_MFA_ENCRYPTION_KEYS = JSON.stringify({
      test: randomBytes(32).toString('hex'),
    });
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(AuthEmailService)
      .useValue({ sendMfaChanged: jest.fn().mockResolvedValue(true) })
      .compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    mfa = app.get(AdminMfaService);
    sessions = app.get(AuthSessionRepository);
  });
  beforeEach(async () => {
    userId = (
      await pool.query(
        `INSERT INTO users(email,name,provider,password_hash,email_verified,role)
      VALUES($1,'MFA QA','email',$2,true,'ADMIN') RETURNING id`,
        [
          `mfa-${randomBytes(12).toString('hex')}@test.itemize`,
          await bcrypt.hash(password, 4),
        ],
      )
    ).rows[0].id;
    users.push(userId);
    sid = await sessions.create(userId);
  });
  afterAll(async () => {
    if (pool)
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
    if (app) await app.close();
    process.env = original;
  });
  const token = () =>
    jwt.signAsync(
      { id: userId, sid },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  const gql = async (query: string, variables: object = {}, csrf = true) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${await token()}; csrf-token=mfa-test`)
      .set('x-csrf-token', csrf ? 'mfa-test' : '')
      .send({ query, variables });
  async function enroll() {
    await mfa.reauthenticate(identity(), password);
    const setup = await mfa.begin(identity());
    const code = await generate({ secret: setup.secret });
    const codes = await mfa.confirm(identity(), code);
    return { setup, code, codes };
  }
  it('blocks an admin session and legacy token until MFA, including direct reads', async () => {
    const blocked = await gql('{ adminUserCount { count } }');
    expect(blocked.body.errors[0].extensions.reason).toBe('MFA_REQUIRED');
    const legacy = await jwt.signAsync(
      { id: userId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    const result = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${legacy}`)
      .send({ query: '{ adminUserCount { count } }' });
    expect(result.body.errors[0].extensions.reason).toBe('MFA_REQUIRED');
  });
  it('requires primary reauthentication and CSRF; secrets never appear in status', async () => {
    await expect(mfa.begin(identity())).rejects.toMatchObject({
      extensions: { reason: 'MFA_REAUTH_REQUIRED' },
    });
    const result = await gql(
      'mutation { reauthenticateAdmin(password:"MfaQaPassword123!") }',
      {},
      false,
    );
    expect(result.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const status = await gql(
      '{ adminMfaStatus { enrolled verified sessionRequired } }',
    );
    expect(status.body.data.adminMfaStatus).toEqual({
      enrolled: false,
      verified: false,
      sessionRequired: false,
    });
    expect(status.headers['cache-control']).toContain('no-store');
  });
  it('stores encrypted secrets and hashes; enrollment code cannot unlock admin again', async () => {
    const { setup, code, codes } = await enroll();
    const row = (
      await pool.query('SELECT * FROM admin_mfa WHERE user_id=$1', [userId])
    ).rows[0];
    expect(row.secret).not.toContain(setup.secret);
    expect(decryptMfa(row.secret, userId)).toBe(setup.secret);
    expect(row.pending_secret).toBeNull();
    const stored = (
      await pool.query(
        'SELECT code_hash FROM admin_mfa_recovery_codes WHERE user_id=$1',
        [userId],
      )
    ).rows;
    expect(stored).toHaveLength(10);
    expect(JSON.stringify(stored)).not.toContain(codes[0]);
    await expect(mfa.challenge(identity(), code)).rejects.toThrow();
    expect((await mfa.status(identity())).verified).toBe(false);
  });
  it('allows exactly one concurrent use of an authenticator code', async () => {
    const { setup } = await enroll();
    const next = await generate({
      secret: setup.secret,
      epoch: Math.floor(Date.now() / 1000) + 30,
    });
    const results = await Promise.allSettled([
      mfa.challenge(identity(), next),
      mfa.challenge(identity(), next),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const result = await gql('{ adminUserCount { count } }');
    expect(result.body.errors).toBeUndefined();
    expect(
      (
        await pool.query(
          "SELECT COUNT(*)::int n FROM admin_mfa_audit WHERE user_id=$1 AND action='admin_verified'",
          [userId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('limits verification attempts across service instances without rolling counters back', async () => {
    await enroll();
    for (let i = 0; i < 7; i++)
      await expect(mfa.challenge(identity(), 'invalid')).rejects.toThrow();
    await expect(
      new AdminMfaService(pool).challenge(identity(), '123456'),
    ).rejects.toMatchObject({ extensions: { reason: 'MFA_RATE_LIMITED' } });
  });
  it('expires admin access and refresh does not renew it', async () => {
    await enroll();
    await pool.query(
      "UPDATE auth_sessions SET admin_verified_at=CURRENT_TIMESTAMP-INTERVAL '31 minutes' WHERE id=$1",
      [sid],
    );
    const refresh = await jwt.signAsync(
      { userId, sid, type: 'refresh' },
      { secret: process.env.JWT_SECRET, expiresIn: '1h' },
    );
    await app
      .get(SessionService)
      .refresh(refresh, { cookie: jest.fn(), setHeader: jest.fn() } as any);
    expect((await mfa.status(identity())).verified).toBe(false);
    expect(
      (await gql('{ adminUserCount { count } }')).body.errors[0].extensions
        .reason,
    ).toBe('MFA_REQUIRED');
  });
  it('consumes a recovery code once, permits replacement only, and revokes other sessions', async () => {
    const { codes } = await enroll();
    const other = await sessions.create(userId);
    await mfa.recover(identity(), codes[0]);
    expect(await mfa.status(identity())).toMatchObject({
      verified: false,
      recovery: true,
    });
    await expect(sessions.requireActive(userId, other)).rejects.toThrow();
    await expect(mfa.recover(identity(), codes[0])).rejects.toThrow();
    const replacement = await mfa.begin(identity());
    await mfa.confirm(
      identity(),
      await generate({ secret: replacement.secret }),
    );
    await expect(mfa.recover(identity(), codes[1])).rejects.toThrow();
    expect((await mfa.status(identity())).verified).toBe(false);
  });
  it('does not allow another session to confirm a pending secret', async () => {
    await mfa.reauthenticate(identity(), password);
    const setup = await mfa.begin(identity());
    const other = await sessions.create(userId);
    await mfa.reauthenticate({ userId, sessionId: other }, password);
    await expect(
      mfa.confirm(
        { userId, sessionId: other },
        await generate({ secret: setup.secret }),
      ),
    ).rejects.toThrow();
  });
  it('revokes access and refresh after logout', async () => {
    const access = await token();
    const refresh = await jwt.signAsync(
      { userId, sid, type: 'refresh' },
      { secret: process.env.JWT_SECRET, expiresIn: '1h' },
    );
    await app
      .get(SessionService)
      .logout({ cookie: jest.fn(), setHeader: jest.fn() } as any, refresh);
    await expect(app.get(AccessTokenService).verify(access)).rejects.toThrow();
    await expect(
      app.get(SessionService).refresh(refresh, { cookie: jest.fn() } as any),
    ).rejects.toThrow();
  });
  it('revokes sessions on password change and role removal at the database boundary', async () => {
    const access = await token();
    await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      userId,
      await bcrypt.hash('OtherPassword123!', 4),
    ]);
    await expect(app.get(AccessTokenService).verify(access)).rejects.toThrow();
    sid = await sessions.create(userId);
    await pool.query("UPDATE users SET role='USER' WHERE id=$1", [userId]);
    await expect(sessions.requireActive(userId, sid)).rejects.toThrow();
    await expect(mfa.status(identity())).rejects.toThrow();
  });
  it('revokes the session on logout even when the refresh cookie is missing', async () => {
    const access = await token();
    await app.get(SessionService).logout({cookie:jest.fn(),setHeader:jest.fn()} as any,undefined,access);
    await expect(app.get(AccessTokenService).verify(access)).rejects.toThrow();
  });
  it('fails closed for missing, wrong, and cross-user encryption keys', () => {
    const envelope = encryptMfa('SECRET', userId);
    expect(() => decryptMfa(envelope, userId + 1)).toThrow();
    const keys = process.env.ADMIN_MFA_ENCRYPTION_KEYS;
    delete process.env.ADMIN_MFA_ENCRYPTION_KEYS;
    expect(() => decryptMfa(envelope, userId)).toThrow();
    process.env.ADMIN_MFA_ENCRYPTION_KEYS = keys;
  });
  it('requires a recent Google credential for the same client and account', async () => {
    const email = (await pool.query('SELECT email FROM users WHERE id=$1',[userId])).rows[0].email;
    await pool.query("UPDATE users SET provider='google',password_hash=NULL,google_id='mfa-google-qa' WHERE id=$1",[userId]);
    sid = await sessions.create(userId);
    process.env.GOOGLE_CLIENT_ID='mfa-qa-client';
    const fetchMock=jest.spyOn(global,'fetch');
    try {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({aud:'other-client',expires_in:3500})));
      await expect(mfa.reauthenticate(identity(),undefined,'qa-token')).rejects.toThrow();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({aud:'mfa-qa-client',expires_in:2000})));
      await expect(mfa.reauthenticate(identity(),undefined,'qa-token')).rejects.toThrow();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({aud:'mfa-qa-client',expires_in:3500})))
        .mockResolvedValueOnce(new Response(JSON.stringify({sub:'wrong-user',email,email_verified:true})));
      await expect(mfa.reauthenticate(identity(),undefined,'qa-token')).rejects.toThrow();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({aud:'mfa-qa-client',expires_in:3500})))
        .mockResolvedValueOnce(new Response(JSON.stringify({sub:'mfa-google-qa',email,email_verified:true})));
      await expect(mfa.reauthenticate(identity(),undefined,'qa-token')).resolves.toBe(true);
      expect((await mfa.status(identity())).reauthenticated).toBe(true);
    } finally { fetchMock.mockRestore(); }
  });
  it('rejects expired setup, stale primary confirmation and a credential changed during login', async () => {
    await mfa.reauthenticate(identity(),password);
    const setup = await mfa.begin(identity());
    await pool.query("UPDATE admin_mfa SET pending_until=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE user_id=$1",[userId]);
    await expect(mfa.confirm(identity(),await generate({secret:setup.secret}))).rejects.toThrow();
    await pool.query("UPDATE auth_sessions SET reauthenticated_at=CURRENT_TIMESTAMP-INTERVAL '6 minutes' WHERE id=$1",[sid]);
    await expect(mfa.begin(identity())).rejects.toMatchObject({extensions:{reason:'MFA_REAUTH_REQUIRED'}});
    await expect(sessions.create(userId,'stale-password-hash')).rejects.toThrow();
  });
});
