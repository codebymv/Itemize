import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { BillingPlanId, BillingPeriod } from './billing.constants';
import { BillingSubscription } from './stripe-billing.provider';

export type BillingStatusRow = {
  plan: string | null;
  subscription_status: string | null;
  billing_period: string | null;
  billing_period_start: Date | null;
  billing_period_end: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  emails_used: number | null;
  emails_limit: number | null;
  sms_used: number | null;
  sms_limit: number | null;
  api_calls_used: number | null;
  api_calls_limit: number | null;
  contacts_limit: number | null;
  users_limit: number | null;
  workflows_limit: number | null;
  landing_pages_limit: number | null;
  forms_limit: number | null;
  calendars_limit: number | null;
  trial_ends_at: Date | null;
  trial_end_acknowledged_at: Date | null;
  cancel_at_period_end: boolean | null;
  canceled_at: Date | null;
};

export type BillingUsageRow = Pick<
  BillingStatusRow,
  | 'emails_used'
  | 'emails_limit'
  | 'sms_used'
  | 'sms_limit'
  | 'api_calls_used'
  | 'api_calls_limit'
  | 'billing_period_start'
  | 'billing_period_end'
> & {
  contacts: number;
  workflows: number;
  forms: number;
  landing_pages: number;
};

const statusSelection = `
  plan, subscription_status, billing_period, billing_period_start,
  billing_period_end, stripe_customer_id, stripe_subscription_id,
  emails_used, emails_limit, sms_used, sms_limit, api_calls_used,
  api_calls_limit, contacts_limit, users_limit, workflows_limit,
  landing_pages_limit, forms_limit, calendars_limit, trial_ends_at,
  trial_end_acknowledged_at, cancel_at_period_end, canceled_at`;

@Injectable()
export class BillingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async status(organizationId: number): Promise<BillingStatusRow | null> {
    const result = await this.pool.query<BillingStatusRow>(
      `SELECT ${statusSelection} FROM organizations WHERE id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  async usage(organizationId: number): Promise<BillingUsageRow | null> {
    const result = await this.pool.query<BillingUsageRow>(
      `SELECT
         o.emails_used, o.emails_limit, o.sms_used, o.sms_limit,
         o.api_calls_used, o.api_calls_limit, o.billing_period_start,
         o.billing_period_end,
         (SELECT COUNT(*)::int FROM contacts c WHERE c.organization_id = o.id) AS contacts,
         (SELECT COUNT(*)::int FROM workflows w WHERE w.organization_id = o.id) AS workflows,
         (SELECT COUNT(*)::int FROM forms f WHERE f.organization_id = o.id) AS forms,
         (SELECT COUNT(*)::int FROM pages p WHERE p.organization_id = o.id) AS landing_pages
       FROM organizations o
       WHERE o.id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  async checkoutOrganization(
    organizationId: number,
  ): Promise<{ name: string; stripeCustomerId: string | null } | null> {
    const result = await this.pool.query<{
      name: string;
      stripe_customer_id: string | null;
    }>(
      `SELECT name, stripe_customer_id
       FROM organizations
       WHERE id = $1`,
      [organizationId],
    );
    const row = result.rows[0];
    return row
      ? { name: row.name, stripeCustomerId: row.stripe_customer_id }
      : null;
  }

  async ensureCustomer(
    organizationId: number,
    create: (name: string) => Promise<string>,
  ): Promise<{ customerId: string; existed: boolean }> {
    return this.transaction(async (client) => {
      const result = await client.query<{
        name: string;
        stripe_customer_id: string | null;
      }>(
        `SELECT name, stripe_customer_id
         FROM organizations
         WHERE id = $1
         FOR UPDATE`,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Organization not found');
      if (row.stripe_customer_id) {
        return { customerId: row.stripe_customer_id, existed: true };
      }
      const customerId = await create(row.name);
      await client.query(
        `UPDATE organizations
         SET stripe_customer_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [customerId, organizationId],
      );
      return { customerId, existed: false };
    });
  }

  async portalCustomer(organizationId: number): Promise<string | null> {
    const result = await this.pool.query<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM organizations WHERE id = $1',
      [organizationId],
    );
    return result.rows[0]?.stripe_customer_id ?? null;
  }

  async acknowledgeTrialEnd(organizationId: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE organizations
       SET trial_end_acknowledged_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [organizationId],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async synchronizeSubscription(
    organizationId: number,
    subscription: BillingSubscription,
    planId: BillingPlanId,
    billingPeriod: BillingPeriod,
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
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE organizations SET
         plan = $1, subscription_status = $2, stripe_subscription_id = $3,
         billing_period = $4, billing_period_start = $5,
         billing_period_end = $6, trial_ends_at = $7,
         cancel_at_period_end = $8, emails_limit = $9, sms_limit = $10,
         api_calls_limit = $11, contacts_limit = $12, users_limit = $13,
         workflows_limit = $14, landing_pages_limit = $15,
         forms_limit = $16, calendars_limit = $17, updated_at = NOW()
       WHERE id = $18`,
      [
        planId,
        subscription.status,
        subscription.id,
        billingPeriod,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.trialEnd,
        subscription.cancelAtPeriodEnd,
        limits.emails,
        limits.sms,
        limits.apiCalls,
        limits.contacts,
        limits.users,
        limits.workflows,
        limits.landingPages,
        limits.forms,
        limits.calendars,
        organizationId,
      ],
    );
  }

  private async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
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
