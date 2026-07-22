import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type AdminUserRow = {
  id: number; email: string; name: string | null; role: string | null;
  plan: string | null; created_at: Date;
};

@Injectable()
export class AdminOperationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async userCount(): Promise<number> {
    const result = await this.pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
    return Number(result.rows[0].count);
  }

  async searchUsers(input: { query?: string; plan?: string; limit: number; offset: number }): Promise<{ rows: AdminUserRow[]; total: number }> {
    return this.readTransaction(async (client) => {
      const { clauses, params } = this.filters(input.query, input.plan);
      const joins = `LEFT JOIN organizations o ON o.id = u.default_organization_id
        LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status IN ('active', 'trialing')
        LEFT JOIN subscription_plans sp ON sp.id = s.plan_id`;
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM users u ${joins} ${clauses}`, params,
      );
      const pageParams = [...params, input.limit + 1, input.offset];
      const rows = await client.query<AdminUserRow>(
        `SELECT u.id, u.email, u.name, u.role, COALESCE(sp.name, 'free') AS plan, u.created_at
         FROM users u ${joins} ${clauses}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pageParams,
      );
      return { rows: rows.rows, total: Number(count.rows[0].total) };
    });
  }

  async userIds(query?: string, plan?: string): Promise<number[]> {
    const { clauses, params } = this.filters(query, plan);
    const result = await this.pool.query<{ id: number }>(
      `SELECT u.id FROM users u
       LEFT JOIN organizations o ON o.id = u.default_organization_id
       LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status IN ('active', 'trialing')
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       ${clauses} ORDER BY u.created_at DESC, u.id DESC`, params,
    );
    return result.rows.map((row) => row.id);
  }

  async usersByIds(ids: number[]): Promise<AdminUserRow[]> {
    const result = await this.pool.query<AdminUserRow>(
      `SELECT u.id, u.email, u.name, u.role, COALESCE(sp.name, 'free') AS plan, u.created_at
       FROM unnest($1::int[]) WITH ORDINALITY requested(id, position)
       JOIN users u ON u.id = requested.id
       LEFT JOIN organizations o ON o.id = u.default_organization_id
       LEFT JOIN subscriptions s ON s.organization_id = o.id AND s.status IN ('active', 'trialing')
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       ORDER BY requested.position`, [ids],
    );
    return result.rows;
  }

  async stats(): Promise<{ users: number; contacts: number; invoices: number }> {
    const result = await this.pool.query<{ users: number; contacts: number; invoices: number }>(
      `SELECT (SELECT COUNT(*) FROM users)::int AS users,
              (SELECT COUNT(*) FROM contacts)::int AS contacts,
              (SELECT COUNT(*) FROM invoices)::int AS invoices`,
    );
    return result.rows[0];
  }

  async updateOwnPlan(userId: number, plan: string): Promise<'updated' | 'no_organization' | 'plan_not_found'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ default_organization_id: number | null }>(
        'SELECT default_organization_id FROM users WHERE id = $1 FOR UPDATE', [userId],
      );
      const organizationId = user.rows[0]?.default_organization_id;
      if (!organizationId) { await client.query('ROLLBACK'); return 'no_organization'; }
      const selected = await client.query<{ id: number }>(
        'SELECT id FROM subscription_plans WHERE name = $1 AND is_active = true LIMIT 1', [plan],
      );
      const planId = selected.rows[0]?.id;
      if (!planId) { await client.query('ROLLBACK'); return 'plan_not_found'; }
      await client.query(
        `INSERT INTO subscriptions (organization_id, plan_id, status, created_at, updated_at)
         VALUES ($1, $2, 'active', NOW(), NOW())
         ON CONFLICT (organization_id) DO UPDATE SET plan_id = EXCLUDED.plan_id,
           status = 'active', updated_at = NOW()`, [organizationId, planId],
      );
      const updated = await client.query(
        'UPDATE organizations SET current_plan_id = $1, updated_at = NOW() WHERE id = $2',
        [planId, organizationId],
      );
      if (updated.rowCount !== 1) throw new Error('Default organization disappeared during plan update');
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private filters(query?: string, plan?: string): { clauses: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query) {
      params.push(`%${query}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
    }
    if (plan) {
      params.push(plan);
      conditions.push(`COALESCE(sp.name, 'free') = $${params.length}`);
    }
    return { clauses: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  private async readTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
