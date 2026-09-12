import { Pool } from 'pg';
import { emailCapacity, lockEmailUsage, recordEmailUsage } from '../../src/billing/email-allowance';
import { BillingRepository } from '../../src/billing/billing.repository';
import { WorkflowSideEffectJobsRepository } from '../../src/workflow-jobs/workflow-side-effect-jobs.repository';

describe('Shared monthly email allowance PostgreSQL contract', () => {
  let pool: Pool;
  let organizationId: number;
  beforeAll(() => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, ssl: process.env.TEST_DATABASE_SSL === 'true' });
  });
  beforeEach(async () => {
    organizationId = Number((await pool.query(`INSERT INTO organizations
      (name,slug,plan,subscription_status,billing_period,emails_limit)
      VALUES ('Allowance QA',$1,'unlimited','active','yearly',2) RETURNING id`,
    [`allowance-${Date.now()}-${Math.random()}`])).rows[0].id);
  });
  afterEach(async () => { await pool.query('DELETE FROM organizations WHERE id=$1', [organizationId]); });
  afterAll(async () => { await pool.end(); });

  it('serializes competing producers and rejects a batch atomically', async () => {
    const reserve = async (source: 'campaign' | 'message' | 'workflow', amount: number) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lockEmailUsage(client, organizationId);
        const capacity = await emailCapacity(client, organizationId, amount);
        if (capacity.allowed) await recordEmailUsage(client, organizationId, source, 1, amount);
        await client.query('COMMIT');
        return capacity.allowed ? amount : 0;
      } finally { client.release(); }
    };
    const results = await Promise.all([reserve('campaign',2),reserve('message',1),reserve('workflow',1)]);
    expect(results.reduce((sum, amount) => sum+amount,0)).toBe(2);
    const billing = new BillingRepository(pool);
    expect((await billing.usage(organizationId))?.emails_used).toBe(2);
    expect(await reserve('campaign',3)).toBe(0);
    // Unlimited still meters, and an explicit zero remains a hard cap.
    await pool.query('UPDATE organizations SET emails_limit=-1 WHERE id=$1', [organizationId]);
    const client = await pool.connect();
    expect((await emailCapacity(client,organizationId,100)).allowed).toBe(true);
    await pool.query('UPDATE organizations SET emails_limit=0 WHERE id=$1', [organizationId]);
    expect((await emailCapacity(client,organizationId,1)).allowed).toBe(false);
    client.release();
  });

  it('pauses metered workflow emails at the cap, exempts notifications and never recharges retries', async () => {
    await pool.query('UPDATE organizations SET emails_limit=0 WHERE id=$1', [organizationId]);
    const insert = async (prefix: string) => Number((await pool.query(`INSERT INTO workflow_side_effect_outbox
      (organization_id,idempotency_key,enrollment_run_at,effect_type,payload)
      VALUES ($1,$2,NOW(),'email','{}') RETURNING id`, [organizationId,`${prefix}-${organizationId}`])).rows[0].id);
    const workflowId = await insert('workflow');
    const notificationId = await insert('booking-notification');
    const jobs = new WorkflowSideEffectJobsRepository(pool);
    expect(await jobs.claim(60,workflowId)).toBeNull();
    expect((await pool.query('SELECT attempt_count,status FROM workflow_side_effect_outbox WHERE id=$1', [workflowId])).rows[0])
      .toMatchObject({ attempt_count:0,status:'retry' });
    expect(await jobs.claim(60,notificationId)).not.toBeNull();
    await pool.query('UPDATE organizations SET emails_limit=1 WHERE id=$1', [organizationId]);
    await pool.query('UPDATE workflow_side_effect_outbox SET next_attempt_at=NOW() WHERE id=$1', [workflowId]);
    expect(await jobs.claim(60,workflowId)).not.toBeNull();
    expect((await new BillingRepository(pool).usage(organizationId))?.emails_used).toBe(1);
    // Retry in the next UTC month retains the original reservation even on an annual plan.
    await pool.query(`UPDATE email_usage_reservations SET reserved_at=
      (date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-INTERVAL '1 second'
      WHERE organization_id=$1`, [organizationId]);
    await pool.query(`UPDATE workflow_side_effect_outbox SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [workflowId]);
    expect(await jobs.claim(60,workflowId)).not.toBeNull();
    expect((await new BillingRepository(pool).usage(organizationId))?.emails_used).toBe(0);
    await pool.query('DELETE FROM workflow_side_effect_outbox WHERE id=$1', [workflowId]);
    expect(Number((await pool.query('SELECT COUNT(*) AS total FROM email_usage_reservations WHERE organization_id=$1', [organizationId])).rows[0].total)).toBe(1);
  });
});
