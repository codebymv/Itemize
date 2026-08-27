import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';
import { SignupMode } from './auth.inputs';
import { NotificationsService } from '../notifications/notifications.service';

export type AuthenticationUser = {
  id: number;
  email: string;
  name: string;
  passwordHash: string | null;
  provider: string | null;
  emailVerified: boolean;
  role: string;
  createdAt: Date;
};

type AuthenticationUserRow = {
  id: number | string;
  email: string;
  name: string;
  password_hash: string | null;
  provider: string | null;
  email_verified: boolean | null;
  role: string | null;
  created_at: Date | string;
  account_deletion_scheduled_at: Date | string | null;
};

const USER_COLUMNS = `
  id, email, name, password_hash, provider, email_verified, role, created_at,
  account_deletion_scheduled_at
`;

const mapUser = (row: AuthenticationUserRow): AuthenticationUser => ({
  id: Number(row.id),
  email: row.email,
  name: row.name,
  passwordHash: row.password_hash,
  provider: row.provider,
  emailVerified: row.email_verified === true,
  role: row.role || 'USER',
  createdAt: new Date(row.created_at),
});

@Injectable()
export class AuthRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async findByEmail(email: string): Promise<AuthenticationUser | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `SELECT ${USER_COLUMNS} FROM users
       WHERE email = $1 AND account_deletion_scheduled_at IS NULL`,
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findById(userId: number): Promise<AuthenticationUser | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `SELECT ${USER_COLUMNS} FROM users
       WHERE id = $1 AND account_deletion_scheduled_at IS NULL`,
      [userId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async registerEmailUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    verificationTokenHash: string;
    verificationTokenExpires: Date;
    signupMode: SignupMode;
  }): Promise<AuthenticationUser> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<AuthenticationUserRow>(
        `INSERT INTO users (
           email, name, password_hash, provider, email_verified,
           verification_token, verification_token_expires, created_at, updated_at
         ) VALUES ($1, $2, $3, 'email', false, $4, $5, NOW(), NOW())
         RETURNING ${USER_COLUMNS}`,
        [
          input.email,
          input.name,
          input.passwordHash,
          input.verificationTokenHash,
          input.verificationTokenExpires,
        ],
      );
      const user = mapUser(inserted.rows[0]);
      await this.ensurePersonalOrganization(client, user, input.signupMode);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw itemizeGraphqlError(
          'An account with this email already exists.',
          'ACCOUNT_CONFLICT',
          { reason: 'USER_EXISTS' },
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeVerificationToken(
    tokenHash: string,
  ): Promise<AuthenticationUser | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `UPDATE users
       SET email_verified = true,
           verification_token = NULL,
           verification_token_expires = NULL,
           updated_at = NOW()
       WHERE verification_token = $1
         AND verification_token_expires > NOW()
         AND email_verified = false
       RETURNING ${USER_COLUMNS}`,
      [tokenHash],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async replaceVerificationToken(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Pick<AuthenticationUser, 'email' | 'name'> | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `UPDATE users
       SET verification_token = $1,
           verification_token_expires = $2,
           updated_at = NOW()
       WHERE email = $3
         AND provider = 'email'
         AND account_deletion_scheduled_at IS NULL
         AND email_verified = false
       RETURNING ${USER_COLUMNS}`,
      [input.tokenHash, input.expiresAt, input.email],
    );
    return result.rows[0]
      ? { email: result.rows[0].email, name: result.rows[0].name }
      : null;
  }

  async replacePasswordResetToken(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<Pick<AuthenticationUser, 'email' | 'name'> | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `UPDATE users
       SET password_reset_token = $1,
           password_reset_expires = $2,
           updated_at = NOW()
       WHERE email = $3
         AND provider = 'email'
         AND password_hash IS NOT NULL
         AND account_deletion_scheduled_at IS NULL
       RETURNING ${USER_COLUMNS}`,
      [input.tokenHash, input.expiresAt, input.email],
    );
    return result.rows[0]
      ? { email: result.rows[0].email, name: result.rows[0].name }
      : null;
  }

  async consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
  }): Promise<Pick<AuthenticationUser, 'email' | 'name'> | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           updated_at = NOW()
       WHERE password_reset_token = $2
         AND password_reset_expires > NOW()
         AND provider = 'email'
         AND account_deletion_scheduled_at IS NULL
       RETURNING ${USER_COLUMNS}`,
      [input.passwordHash, input.tokenHash],
    );
    return result.rows[0]
      ? { email: result.rows[0].email, name: result.rows[0].name }
      : null;
  }

  async changePasswordIfCurrent(input: {
    userId: number;
    currentHash: string;
    passwordHash: string;
  }): Promise<Pick<AuthenticationUser, 'email' | 'name'> | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           updated_at = NOW()
       WHERE id = $2
         AND password_hash = $3
         AND provider = 'email'
         AND account_deletion_scheduled_at IS NULL
       RETURNING ${USER_COLUMNS}`,
      [input.passwordHash, input.userId, input.currentHash],
    );
    return result.rows[0]
      ? { email: result.rows[0].email, name: result.rows[0].name }
      : null;
  }

  async updateName(userId: number, name: string): Promise<AuthenticationUser | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `UPDATE users SET name = $1, updated_at = NOW()
       WHERE id = $2 AND account_deletion_scheduled_at IS NULL
       RETURNING ${USER_COLUMNS}`,
      [name, userId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findOrCreateGoogleUser(identity: {
    googleId: string;
    email: string;
    name: string;
  }, signupMode: SignupMode = SignupMode.FREE): Promise<AuthenticationUser> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let result = await client.query<AuthenticationUserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 FOR UPDATE`,
        [identity.email],
      );

      if (result.rows[0]) {
        if (result.rows[0].account_deletion_scheduled_at) {
          throw itemizeGraphqlError(
            'This account is pending deletion. Use the recovery link sent by email before signing in.',
            'UNAUTHENTICATED',
            { reason: 'ACCOUNT_DELETION_PENDING' },
          );
        }
        result = await client.query<AuthenticationUserRow>(
          `UPDATE users
           SET google_id = $1,
               email_verified = true,
               updated_at = NOW()
           WHERE id = $2
           RETURNING ${USER_COLUMNS}`,
          [identity.googleId, result.rows[0].id],
        );
      } else {
        result = await client.query<AuthenticationUserRow>(
          `INSERT INTO users (
             email, name, google_id, provider, email_verified, created_at, updated_at
           ) VALUES ($1, $2, $3, 'google', true, NOW(), NOW())
           RETURNING ${USER_COLUMNS}`,
          [identity.email, identity.name, identity.googleId],
        );
      }

      const user = mapUser(result.rows[0]);
      await this.ensurePersonalOrganization(client, user, signupMode);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensurePersonalOrganization(
    client: PoolClient,
    user: AuthenticationUser,
    signupMode: SignupMode,
  ): Promise<void> {
    const existing = await client.query<{ default_organization_id: number | null }>(
      'SELECT default_organization_id FROM users WHERE id = $1',
      [user.id],
    );
    if (existing.rows[0]?.default_organization_id) return;

    const slugBase = (user.name || `user${user.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const isTrial = signupMode === SignupMode.TRIAL;
    const organization = await client.query<{ id: number }>(
      `INSERT INTO organizations (
         name, slug, settings, plan, subscription_status,
         trial_started_at, trial_ends_at,
         emails_limit, sms_limit, api_calls_limit, contacts_limit,
         users_limit, workflows_limit, landing_pages_limit, forms_limit, calendars_limit
       ) VALUES (
         $1, $2, $3::jsonb, $4, $5,
         CASE WHEN $5::varchar = 'trialing' THEN NOW() ELSE NULL END,
         CASE WHEN $5::varchar = 'trialing' THEN NOW() + INTERVAL '14 days' ELSE NULL END,
         $6, $7, $8, $9, $10, $11, $12, $13, $14
       )
       RETURNING id`,
      [
        `${user.name}'s Organization`,
        `${slugBase}-${user.id}`,
        JSON.stringify({ personal: true }),
        isTrial ? 'starter' : 'free',
        isTrial ? 'trialing' : 'none',
        isTrial ? 1_000 : 0,
        isTrial ? 500 : 0,
        0,
        isTrial ? 5_000 : 0,
        isTrial ? 3 : 1,
        isTrial ? 5 : 0,
        isTrial ? 10 : 0,
        isTrial ? 10 : 0,
        isTrial ? 3 : 0,
      ],
    );
    const organizationId = Number(organization.rows[0].id);
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW())
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [organizationId, user.id],
    );
    await client.query(
      'UPDATE users SET default_organization_id = $1 WHERE id = $2',
      [organizationId, user.id],
    );
    await this.notifications.createWithClient(client, {
      organizationId,
      recipientUserId: user.id,
      eventType: 'account.welcome',
      entityType: 'organization',
      entityId: organizationId,
      dedupeKey: `account:${user.id}:welcome:v1`,
      payload: { organizationName: `${user.name}'s Organization` },
      category: 'system',
      priority: 'normal',
      title: 'Welcome to Itemize',
      body: isTrial
        ? 'Your workspace is ready. Add content, create a contact, or send your first estimate.'
        : 'Your workspace is ready. Add your first list, note, whiteboard, wireframe, or vault.',
      href: '/canvas',
    });
  }
}
