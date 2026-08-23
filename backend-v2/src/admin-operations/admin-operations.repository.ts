import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type AdminUserRow = {
  id: number; email: string; name: string | null; role: string | null;
  plan: string | null; created_at: Date;
};

export type AdminActivationFunnelRow = {
  as_of: Date;
  cohort_started_at: Date;
  organizations_created: number;
  organizations_sent: number;
  organizations_advanced: number;
  organizations_returned: number;
  trial_organizations_sent: number;
  organizations_trial_to_paid: number;
};

export type AdminPlanEntitlement = {
  status: 'active' | 'none';
  limits: {
    emails: number;
    sms: number;
    apiCalls: number;
    contacts: number;
    users: number;
    workflows: number;
    landingPages: number;
    forms: number;
    calendars: number;
  };
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

  async activationFunnel(days: number): Promise<AdminActivationFunnelRow> {
    const result = await this.pool.query<AdminActivationFunnelRow>(
      `WITH bounds AS (
         SELECT CURRENT_TIMESTAMP AS as_of,
                CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day') AS started_at
       ), cohort AS (
         SELECT o.id, o.subscription_status, o.trial_started_at,
                o.trial_ends_at
         FROM organizations o, bounds b
         WHERE o.created_at >= b.started_at AND o.created_at <= b.as_of
       ), first_send AS (
         SELECT event.organization_id, MIN(event.occurred_at) AS sent_at
         FROM activation_events event
         JOIN cohort ON cohort.id = event.organization_id
         WHERE event.event_name = 'artifact_sent'
         GROUP BY event.organization_id
       ), advanced AS (
         SELECT DISTINCT event.organization_id
         FROM activation_events event
         JOIN first_send sent ON sent.organization_id = event.organization_id
         WHERE event.event_name = 'artifact_advanced'
           AND event.occurred_at >= sent.sent_at
       ), returned AS (
         SELECT DISTINCT event.organization_id
         FROM activation_events event
         JOIN first_send sent ON sent.organization_id = event.organization_id
         WHERE event.event_name = 'returned_after_send'
           AND event.occurred_at >= sent.sent_at
       )
       SELECT b.as_of, b.started_at AS cohort_started_at,
              COUNT(cohort.id)::int AS organizations_created,
              COUNT(sent.organization_id)::int AS organizations_sent,
              COUNT(advanced.organization_id)::int AS organizations_advanced,
              COUNT(returned.organization_id)::int AS organizations_returned,
              COUNT(*) FILTER (
                WHERE cohort.trial_started_at IS NOT NULL
                  AND sent.organization_id IS NOT NULL
              )::int AS trial_organizations_sent,
              COUNT(*) FILTER (
                WHERE cohort.trial_started_at IS NOT NULL
                  AND cohort.subscription_status = 'active'
                  AND cohort.trial_ends_at IS NOT NULL
                  AND cohort.trial_ends_at >= sent.sent_at
              )::int AS organizations_trial_to_paid
       FROM bounds b
       LEFT JOIN cohort ON true
       LEFT JOIN first_send sent ON sent.organization_id = cohort.id
       LEFT JOIN advanced ON advanced.organization_id = cohort.id
       LEFT JOIN returned ON returned.organization_id = cohort.id
       GROUP BY b.as_of, b.started_at`,
      [days],
    );
    return result.rows[0];
  }

  async updateOwnPlan(
    userId: number,
    plan: string,
    entitlement: AdminPlanEntitlement,
  ): Promise<'updated' | 'no_organization' | 'plan_not_found'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ default_organization_id: number | null }>(
        'SELECT default_organization_id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      const organizationId = user.rows[0]?.default_organization_id;
      if (!organizationId) { await client.query('ROLLBACK'); return 'no_organization'; }
      const organization = await client.query<{ current_plan_id: number | null }>(
        'SELECT current_plan_id FROM organizations WHERE id = $1 FOR UPDATE',
        [organizationId],
      );
      if (!organization.rows[0]) { await client.query('ROLLBACK'); return 'no_organization'; }
      const selected = await client.query<{ id: number }>(
        'SELECT id FROM subscription_plans WHERE name = $1 AND is_active = true LIMIT 1', [plan],
      );
      const planId = selected.rows[0]?.id ?? null;
      if (!planId && plan !== 'free') { await client.query('ROLLBACK'); return 'plan_not_found'; }

      let subscriptionId: number | null = null;
      if (entitlement.status === 'active') {
        const subscription = await client.query<{ id: number }>(
          `INSERT INTO subscriptions (organization_id, plan_id, status, created_at, updated_at)
           VALUES ($1, $2, 'active', NOW(), NOW())
           ON CONFLICT (organization_id) DO UPDATE SET plan_id = EXCLUDED.plan_id,
             status = 'active', updated_at = NOW()
           RETURNING id`,
          [organizationId, planId],
        );
        subscriptionId = subscription.rows[0]?.id ?? null;
      } else {
        const subscription = await client.query<{ id: number }>(
          `UPDATE subscriptions
           SET plan_id = COALESCE($2, plan_id), status = 'canceled',
               canceled_at = NOW(), updated_at = NOW()
           WHERE organization_id = $1
           RETURNING id`,
          [organizationId, planId],
        );
        subscriptionId = subscription.rows[0]?.id ?? null;
      }

      const updated = await client.query(
        `UPDATE organizations SET
           current_plan_id = $1, plan = $2, subscription_status = $3,
           emails_limit = $4, sms_limit = $5, api_calls_limit = $6,
           contacts_limit = $7, users_limit = $8, workflows_limit = $9,
           landing_pages_limit = $10, forms_limit = $11, calendars_limit = $12,
           trial_ends_at = NULL, trial_end_acknowledged_at = NULL,
           cancel_at_period_end = FALSE, canceled_at = NULL, updated_at = NOW()
         WHERE id = $13`,
        [
          planId,
          plan,
          entitlement.status,
          entitlement.limits.emails,
          entitlement.limits.sms,
          entitlement.limits.apiCalls,
          entitlement.limits.contacts,
          entitlement.limits.users,
          entitlement.limits.workflows,
          entitlement.limits.landingPages,
          entitlement.limits.forms,
          entitlement.limits.calendars,
          organizationId,
        ],
      );
      if (updated.rowCount !== 1) throw new Error('Default organization disappeared during plan update');

      await client.query(
        `INSERT INTO subscription_events (
           subscription_id, organization_id, event_type, previous_plan_id,
           new_plan_id, metadata, created_at
         ) VALUES ($1, $2, 'admin_plan_override', $3, $4,
           jsonb_build_object(
             'actor_user_id', $5::int,
             'plan', $6::text,
             'source', 'admin_tier_selector'
           ),
           NOW())`,
        [
          subscriptionId,
          organizationId,
          organization.rows[0].current_plan_id,
          planId,
          userId,
          plan,
        ],
      );
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
