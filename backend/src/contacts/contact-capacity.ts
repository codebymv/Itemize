import type { PoolClient } from 'pg';
import { planDefinition } from '../billing/billing.constants';

/** Call inside the creation transaction, before contact/email/session locks.
 * Advisory lock first matches other organization-scoped writers; the row lock
 * then keeps plan changes from racing the capacity decision. Every creator shares the
 * existing organization advisory lock used by manual creation and CSV imports.
 */
export async function lockContactCreation(client: PoolClient, organizationId: number): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
  await client.query('SELECT id FROM organizations WHERE id = $1 FOR SHARE', [organizationId]);
}

/** Requires lockContactCreation in the same transaction. */
export async function contactCapacity(client: PoolClient, organizationId: number, attempted = 1) {
  const organization = await client.query<{ plan: string | null; contacts_limit: number | null }>(
    'SELECT plan, contacts_limit FROM organizations WHERE id = $1', [organizationId],
  );
  const plan = organization.rows[0]?.plan ?? 'free';
  const limit = organization.rows[0]?.contacts_limit ?? planDefinition(plan)?.limits.contacts ?? 0;
  const count = await client.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id = $1', [organizationId],
  );
  const current = count.rows[0]?.total ?? 0;
  return { plan, limit, current, allowed: attempted === 0 || limit === -1 || current + attempted <= limit };
}
