import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { PG_POOL } from '../database/database.module';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AuthenticatedIdentity } from '../request-context/request-context.types';
import { decryptMfa, encryptMfa } from './admin-mfa-crypto';

const fail = (message: string, reason = 'MFA_REQUIRED') =>
  itemizeGraphqlError(message, 'FORBIDDEN', { reason });
const hash = (code: string) => createHash('sha256').update(code).digest('hex');
type Row = Record<string, any>;

@Injectable()
export class AdminMfaService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async status(identity: AuthenticatedIdentity) {
    const result = await this.pool.query(
      `SELECT m.enabled_at,s.admin_verified_at,s.recovery_until,
      s.reauthenticated_at, CURRENT_TIMESTAMP AS now FROM users u
      LEFT JOIN admin_mfa m ON m.user_id=u.id
      LEFT JOIN auth_sessions s ON s.user_id=u.id AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP
      WHERE u.id=$1 AND u.role='ADMIN' AND u.account_deletion_scheduled_at IS NULL`,
      [identity.userId, identity.sessionId || null],
    );
    const row = result.rows[0];
    if (!row) throw fail('Administrator access required');
    const expiresAt =
      row.enabled_at && row.admin_verified_at
        ? new Date(new Date(row.admin_verified_at).getTime() + 30 * 60_000)
        : null;
    return {
      enrolled: !!row.enabled_at,
      verified: !!expiresAt && expiresAt > row.now,
      expiresAt,
      recovery: !!row.recovery_until && row.recovery_until > row.now,
      reauthenticated:
        !!row.reauthenticated_at &&
        new Date(row.reauthenticated_at).getTime() >
          row.now.getTime() - 5 * 60_000,
      sessionRequired: !identity.sessionId,
    };
  }

  async requireVerified(identity: AuthenticatedIdentity) {
    const status = await this.status(identity);
    if (!status.verified)
      throw fail('Verify your authenticator to access administration');
  }

  // User -> MFA -> session lock order serializes code use, recovery and security changes.
  private async action<T>(
    identity: AuthenticatedIdentity,
    work: (db: PoolClient, user: Row, mfa: Row, session: Row) => Promise<T>,
  ): Promise<T> {
    if (!identity.sessionId)
      throw fail(
        'Sign out and sign in again to secure this session',
        'MFA_SESSION_REQUIRED',
      );
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const user = (
        await db.query(
          `SELECT * FROM users WHERE id=$1 AND role='ADMIN'
        AND account_deletion_scheduled_at IS NULL FOR UPDATE`,
          [identity.userId],
        )
      ).rows[0];
      if (!user) throw fail('Administrator access required');
      await db.query(
        `INSERT INTO admin_mfa(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [identity.userId],
      );
      const mfa = (
        await db.query(
          'SELECT *,CURRENT_TIMESTAMP AS now FROM admin_mfa WHERE user_id=$1 FOR UPDATE',
          [identity.userId],
        )
      ).rows[0];
      const session = (
        await db.query(
          `SELECT * FROM auth_sessions WHERE id=$1 AND user_id=$2
        AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`,
          [identity.sessionId, identity.userId],
        )
      ).rows[0];
      if (!session) throw fail('Please sign in again', 'MFA_SESSION_REQUIRED');
      // Counts all security actions, including failures. No process-local reset bypass.
      if (mfa.attempt_window.getTime() <= mfa.now.getTime() - 15 * 60_000)
        mfa.failed_attempts = 0;
      if (mfa.failed_attempts >= 10)
        throw fail(
          'Too many attempts. Try again in 15 minutes.',
          'MFA_RATE_LIMITED',
        );
      await db.query(
        `UPDATE admin_mfa SET failed_attempts=$2,
        attempt_window=CASE WHEN attempt_window<=CURRENT_TIMESTAMP-INTERVAL '15 minutes' THEN CURRENT_TIMESTAMP ELSE attempt_window END WHERE user_id=$1`,
        [identity.userId, mfa.failed_attempts + 1],
      );
      await db.query('SAVEPOINT verification');
      let result: T;
      try {
        result = await work(db, user, mfa, session);
      } catch (error) {
        await db.query('ROLLBACK TO SAVEPOINT verification');
        await db.query(
          `INSERT INTO admin_mfa_audit(user_id,action) VALUES($1,'verification_failed')`,
          [identity.userId],
        );
        await db.query('COMMIT');
        throw error;
      }
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async reauthenticate(
    identity: AuthenticatedIdentity,
    password?: string,
    googleAccessToken?: string,
  ) {
    return this.action(identity, async (db, user) => {
      if (user.provider === 'google') {
        if (!googleAccessToken || googleAccessToken.length > 4096)
          throw fail('Sign in with Google to continue');
        const response = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(googleAccessToken)}`,
          { signal: AbortSignal.timeout(5000) },
        );
        const token = await response.json();
        // A newly issued OAuth credential for this client/account is required, not the Itemize cookie.
        if (
          !process.env.GOOGLE_CLIENT_ID ||
          !response.ok ||
          token.aud !== process.env.GOOGLE_CLIENT_ID ||
          !Number.isFinite(Number(token.expires_in)) ||
          Number(token.expires_in) < 3300
        )
          throw fail('Sign in with Google again to continue');
        const profileResponse = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${googleAccessToken}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        const profile = await profileResponse.json();
        if (
          !profileResponse.ok ||
          profile.sub !== user.google_id ||
          profile.email !== user.email ||
          profile.email_verified !== true
        )
          throw fail('Google account does not match');
      } else if (
        !password ||
        password.length > 128 ||
        !user.password_hash ||
        !(await bcrypt.compare(password, user.password_hash))
      ) {
        throw fail('Current password is incorrect');
      }
      await db.query(
        'UPDATE auth_sessions SET reauthenticated_at=CURRENT_TIMESTAMP WHERE id=$1',
        [identity.sessionId],
      );
      return true;
    });
  }

  private recent(session: Row, now: Date) {
    if (
      !session.reauthenticated_at ||
      session.reauthenticated_at.getTime() <= now.getTime() - 5 * 60_000
    )
      throw fail('Confirm your sign-in again', 'MFA_REAUTH_REQUIRED');
  }

  async begin(identity: AuthenticatedIdentity) {
    return this.action(identity, async (db, user, mfa, session) => {
      this.recent(session, mfa.now);
      if (
        mfa.enabled_at &&
        !(session.recovery_until > mfa.now) &&
        !(
          session.admin_verified_at &&
          session.admin_verified_at.getTime() > mfa.now.getTime() - 5 * 60_000
        )
      )
        throw fail('Verify your current authenticator first');
      const secret = generateSecret();
      const uri = generateURI({ issuer: 'Itemize', label: user.email, secret });
      const envelope = encryptMfa(secret, identity.userId);
      await db.query(
        `UPDATE admin_mfa SET pending_secret=$2,pending_session=$3,
        pending_until=CURRENT_TIMESTAMP+INTERVAL '10 minutes' WHERE user_id=$1`,
        [identity.userId, envelope, identity.sessionId],
      );
      return {
        secret,
        qrDataUrl: await QRCode.toDataURL(uri, { width: 240, margin: 2 }),
        expiresAt: new Date(mfa.now.getTime() + 10 * 60_000),
      };
    });
  }

  private async check(secret: string, code: string, lastStep?: number) {
    if (!/^\d{6}$/.test(code))
      throw fail('Enter a valid six-digit authenticator code');
    const result = await verify({
      secret,
      token: code,
      epochTolerance: 30,
      ...(lastStep === undefined ? {} : { afterTimeStep: lastStep }),
    });
    if (!result.valid || !('timeStep' in result))
      throw fail('Code is invalid, expired or already used');
    return result.timeStep;
  }

  async confirm(identity: AuthenticatedIdentity, code: string) {
    return this.action(identity, async (db, user, mfa, session) => {
      this.recent(session, mfa.now);
      if (
        !mfa.pending_secret ||
        mfa.pending_session !== identity.sessionId ||
        !(mfa.pending_until > mfa.now)
      )
        throw fail('Start authenticator setup again');
      if (
        mfa.enabled_at &&
        !(session.recovery_until > mfa.now) &&
        !(
          session.admin_verified_at &&
          session.admin_verified_at.getTime() > mfa.now.getTime() - 5 * 60_000
        )
      )
        throw fail('Verify your current authenticator again');
      const step = await this.check(
        decryptMfa(mfa.pending_secret, identity.userId),
        code,
      );
      const codes = Array.from({ length: 10 }, () =>
        randomBytes(16).toString('hex'),
      );
      await db.query(
        `UPDATE admin_mfa SET secret=pending_secret,enabled_at=CURRENT_TIMESTAMP,last_step=$2,
        pending_secret=NULL,pending_session=NULL,pending_until=NULL WHERE user_id=$1`,
        [identity.userId, step],
      );
      await db.query('DELETE FROM admin_mfa_recovery_codes WHERE user_id=$1', [
        identity.userId,
      ]);
      for (const recovery of codes)
        await db.query(
          'INSERT INTO admin_mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',
          [identity.userId, hash(recovery)],
        );
      await db.query(
        `UPDATE auth_sessions SET admin_verified_at=NULL,recovery_until=NULL,
        revoked_at=CASE WHEN id=$2 THEN revoked_at ELSE CURRENT_TIMESTAMP END WHERE user_id=$1`,
        [identity.userId, identity.sessionId],
      );
      // Setup is complete; a new authenticator code must unlock administration.
      await db.query(
        `UPDATE auth_sessions SET recovery_until=NULL WHERE id=$1`,
        [identity.sessionId],
      );
      await db.query(
        `INSERT INTO admin_mfa_audit(user_id,action) VALUES($1,'authenticator_enrolled')`,
        [identity.userId],
      );
      return codes;
    });
  }

  async challenge(identity: AuthenticatedIdentity, code: string) {
    return this.action(identity, async (db, user, mfa) => {
      if (!mfa.enabled_at || !mfa.secret)
        throw fail('Set up an authenticator first');
      const step = await this.check(
        decryptMfa(mfa.secret, identity.userId),
        code,
        mfa.last_step === null ? undefined : Number(mfa.last_step),
      );
      await db.query('UPDATE admin_mfa SET last_step=$2 WHERE user_id=$1', [
        identity.userId,
        step,
      ]);
      await db.query(
        `UPDATE auth_sessions SET admin_verified_at=CURRENT_TIMESTAMP,recovery_until=NULL WHERE id=$1`,
        [identity.sessionId],
      );
      await db.query(
        `INSERT INTO admin_mfa_audit(user_id,action) VALUES($1,'admin_verified')`,
        [identity.userId],
      );
      return true;
    });
  }

  async recover(identity: AuthenticatedIdentity, code: string) {
    return this.action(identity, async (db, user, mfa, session) => {
      this.recent(session, mfa.now);
      if (!mfa.enabled_at || !/^[a-f0-9]{32}$/i.test(code))
        throw fail('Recovery code is invalid');
      const used = await db.query(
        `UPDATE admin_mfa_recovery_codes SET consumed_at=CURRENT_TIMESTAMP
        WHERE user_id=$1 AND code_hash=$2 AND consumed_at IS NULL RETURNING code_hash`,
        [identity.userId, hash(code.toLowerCase())],
      );
      if (!used.rows[0]) throw fail('Recovery code is invalid or already used');
      await db.query(
        `UPDATE auth_sessions SET admin_verified_at=NULL,recovery_until=NULL,
        revoked_at=CASE WHEN id=$2 THEN revoked_at ELSE CURRENT_TIMESTAMP END WHERE user_id=$1`,
        [identity.userId, identity.sessionId],
      );
      await db.query(
        `UPDATE auth_sessions SET recovery_until=CURRENT_TIMESTAMP+INTERVAL '10 minutes' WHERE id=$1`,
        [identity.sessionId],
      );
      await db.query(
        `UPDATE admin_mfa SET pending_secret=NULL,pending_session=NULL,pending_until=NULL WHERE user_id=$1`,
        [identity.userId],
      );
      await db.query(
        `INSERT INTO admin_mfa_audit(user_id,action) VALUES($1,'recovery_started')`,
        [identity.userId],
      );
      return true;
    });
  }

  async lock(identity: AuthenticatedIdentity) {
    await this.pool.query(
      `UPDATE auth_sessions SET admin_verified_at=NULL,recovery_until=NULL,reauthenticated_at=NULL
      WHERE id=$1 AND user_id=$2`,
      [identity.sessionId || null, identity.userId],
    );
    return true;
  }
}
