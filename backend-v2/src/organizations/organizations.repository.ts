import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type OrganizationRow = {
  id: number | string;
  name: string;
  slug: string;
  settings: unknown;
  logo_url: string | null;
  role: string;
  is_default: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type UserRow = {
  id: number | string;
  email: string;
  name: string | null;
  default_organization_id: number | string | null;
};

const organizationSelection = `
  o.id,
  o.name,
  o.slug,
  o.settings,
  o.logo_url,
  om.role,
  COALESCE(u.default_organization_id = o.id, false) AS is_default,
  o.created_at,
  o.updated_at`;

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listForUser(userId: number): Promise<OrganizationRow[]> {
    const result = await this.pool.query<OrganizationRow>(
      `SELECT ${organizationSelection}
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1
       ORDER BY lower(o.name), o.id`,
      [userId],
    );
    return result.rows;
  }

  selectForUser(
    userId: number,
    organizationId: number,
  ): Promise<OrganizationRow | null> {
    return this.transaction(async (client) => {
      const user = await client.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!user.rows[0]) return null;

      const organization = await client.query<OrganizationRow>(
        `SELECT ${organizationSelection}
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         JOIN users u ON u.id = om.user_id
         WHERE om.user_id = $1 AND om.organization_id = $2
         FOR SHARE OF om, o`,
        [userId, organizationId],
      );
      if (!organization.rows[0]) return null;

      await client.query(
        `UPDATE users
         SET default_organization_id = $1
         WHERE id = $2`,
        [organizationId, userId],
      );
      return { ...organization.rows[0], is_default: true };
    });
  }

  ensureDefaultForUser(userId: number): Promise<OrganizationRow | null> {
    return this.transaction(async (client) => {
      const userResult = await client.query<UserRow>(
        `SELECT id, email, name, default_organization_id
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) return null;

      const existing = await client.query<OrganizationRow>(
        `SELECT ${organizationSelection}
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         JOIN users u ON u.id = om.user_id
         WHERE om.user_id = $1
         ORDER BY
           (u.default_organization_id = o.id) DESC NULLS LAST,
           o.id
         LIMIT 1
         FOR SHARE OF om, o`,
        [userId],
      );
      if (existing.rows[0]) {
        const selected = existing.rows[0];
        await client.query(
          `UPDATE users
           SET default_organization_id = $1
           WHERE id = $2
             AND default_organization_id IS DISTINCT FROM $1`,
          [selected.id, userId],
        );
        return { ...selected, is_default: true };
      }

      const fallbackName = user.email.split('@')[0] || 'Personal';
      const displayName = user.name?.trim() || fallbackName;
      const organizationName = `${displayName.slice(0, 90)}'s Workspace`;
      const slug = `${this.slugBase(organizationName)}-${randomBytes(4).toString('hex')}`;
      const created = await client.query<OrganizationRow>(
        `INSERT INTO organizations (name, slug, settings)
         VALUES ($1, $2, '{"personal":true}'::jsonb)
         RETURNING
           id,
           name,
           slug,
           settings,
           logo_url,
           'owner'::text AS role,
           true AS is_default,
           created_at,
           updated_at`,
        [organizationName, slug],
      );
      const organization = created.rows[0];
      await client.query(
        `INSERT INTO organization_members (
           organization_id, user_id, role, joined_at
         ) VALUES ($1, $2, 'owner', NOW())`,
        [organization.id, userId],
      );
      await client.query(
        `UPDATE users
         SET default_organization_id = $1
         WHERE id = $2`,
        [organization.id, userId],
      );
      return organization;
    });
  }

  private slugBase(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 220) || 'workspace'
    );
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
