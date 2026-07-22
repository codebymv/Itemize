import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';

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
};

const USER_COLUMNS = `
  id, email, name, password_hash, provider, email_verified, role, created_at
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
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<AuthenticationUser | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findById(userId: number): Promise<AuthenticationUser | null> {
    const result = await this.pool.query<AuthenticationUserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
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
      await this.ensurePersonalOrganization(client, user);
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
       WHERE id = $2
       RETURNING ${USER_COLUMNS}`,
      [name, userId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findOrCreateGoogleUser(identity: {
    googleId: string;
    email: string;
    name: string;
  }): Promise<AuthenticationUser> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let result = await client.query<AuthenticationUserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 FOR UPDATE`,
        [identity.email],
      );

      if (result.rows[0]) {
        result = await client.query<AuthenticationUserRow>(
          `UPDATE users
           SET name = $1,
               google_id = $2,
               email_verified = true,
               updated_at = NOW()
           WHERE id = $3
           RETURNING ${USER_COLUMNS}`,
          [identity.name, identity.googleId, result.rows[0].id],
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
      await this.ensurePersonalOrganization(client, user);
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
    const organization = await client.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, settings)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [`${user.name}'s Workspace`, `${slugBase}-${user.id}`, JSON.stringify({ personal: true })],
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
  }
}
