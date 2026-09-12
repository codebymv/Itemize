import { PoolClient } from 'pg';

export const emailMonthStartSql = "(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
export const emailUsageSql = (organization: string) => `(SELECT COALESCE(SUM(amount),0)::int
  FROM email_usage_reservations WHERE organization_id=${organization}
    AND reserved_at >= ${emailMonthStartSql})`;

// Call inside the same transaction as the outbox insert/claim. A shared lock
// serializes every producer; receipts persist independently of deletable content.
export async function lockEmailUsage(client: PoolClient, organizationId: number, excludedWorkflowId: number | null = null): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('email-usage:' || $1::text,0))", [organizationId]);
  // Reconcile legacy producers during rolling deployment. Immutable source IDs
  // make repeated reads/retries safe; current code records every new reservation.
  await client.query(`INSERT INTO email_usage_reservations (organization_id,source,source_id,amount,reserved_at)
    SELECT organization_id,'message',id,1,created_at FROM message_delivery_jobs
      WHERE organization_id=$1 AND kind='contact_email' AND created_at >= ${emailMonthStartSql}
    UNION ALL
    SELECT organization_id,'campaign',id,recipient_count,created_at FROM campaign_delivery_jobs
      WHERE organization_id=$1 AND recipient_count>0 AND created_at >= ${emailMonthStartSql}
    UNION ALL
    SELECT organization_id,'workflow',id,1,COALESCE(sent_at,created_at) FROM workflow_side_effect_outbox
      WHERE organization_id=$1 AND effect_type='email' AND idempotency_key LIKE 'workflow-%'
        AND attempt_count>0 AND ($2::bigint IS NULL OR id<>$2)
        AND COALESCE(sent_at,created_at) >= ${emailMonthStartSql}
    ON CONFLICT DO NOTHING`, [organizationId, excludedWorkflowId]);
}

export async function emailCapacity(client: PoolClient, organizationId: number, requested: number): Promise<{ allowed: boolean; limit: number; current: number }> {
  const result = await client.query<{ current: number; limit: number }>(
    `SELECT ${emailUsageSql('o.id')} AS current, COALESCE(o.emails_limit,0) AS limit
     FROM organizations o WHERE o.id=$1`, [organizationId]);
  const current = Number(result.rows[0]?.current ?? 0);
  const limit = Number(result.rows[0]?.limit ?? 0);
  return { current, limit, allowed: limit === -1 || current + requested <= limit };
}

export async function recordEmailUsage(client: PoolClient, organizationId: number, source: 'message' | 'campaign' | 'workflow', sourceId: number, amount = 1): Promise<void> {
  await client.query(`INSERT INTO email_usage_reservations (organization_id,source,source_id,amount)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [organizationId,source,sourceId,amount]);
}
