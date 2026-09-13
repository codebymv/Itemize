import { Pool } from 'pg';
import { EstimatesRepository } from '../../src/estimates/estimates.repository';
import { ReputationRequestDeliveryRepository } from '../../src/reputation-requests/reputation-request-delivery.repository';

describe('estimate and review delivery attempt fencing', () => {
  let helper: any;
  let pool: Pool;
  let organizationId: number;
  let otherOrganizationId: number;
  let estimates: EstimatesRepository;
  let reviews: ReputationRequestDeliveryRepository;
  beforeAll(async () => {
    const Helper = require('../../../db/test-support/test-db-helper');
    helper = new Helper(); await helper.setup(); pool = helper.pool;
    organizationId = (await helper.seedUser('fencing-owner@test.itemize', 'Fencing QA')).org.id;
    otherOrganizationId = (await helper.seedUser('fencing-other@test.itemize', 'Other QA')).org.id;
    await pool.query("UPDATE organizations SET plan='starter',subscription_status='active' WHERE id=$1", [organizationId]);
    estimates = new EstimatesRepository(pool); reviews = new ReputationRequestDeliveryRepository(pool);
  });
  afterAll(async () => { if (helper) await helper.teardown(); });

  it.each(['estimate_sent', 'estimate_accepted', 'estimate_declined'])('%s ignores stale callbacks and preserves terminal evidence', async deliveryType => {
    const estimate = (await pool.query(`INSERT INTO estimates (organization_id,estimate_number,valid_until)
      VALUES ($1,$2,CURRENT_DATE+7) RETURNING id`, [organizationId, deliveryType])).rows[0];
    const createDelivery = async (key: string) => Number((await pool.query(`INSERT INTO estimate_email_deliveries
      (organization_id,estimate_id,idempotency_key,recipient_email,subject,payload,delivery_type)
      VALUES ($1,$2,$3,'qa@example.test','QA','{}',$4) RETURNING id`, [organizationId, estimate.id, key, deliveryType])).rows[0].id);
    const previousId = await createDelivery('previous');
    await pool.query(`INSERT INTO estimate_public_capabilities (organization_id,estimate_id,delivery_id,token_hash,expires_at)
      VALUES ($1,$2,$3,$4,NOW()+INTERVAL '7 days')`, [organizationId, estimate.id, previousId, String(previousId).padStart(64, '0')]);
    const id = await createDelivery('current');
    const first = (await estimates.claimEmailDelivery(organizationId, id))!;
    await pool.query("UPDATE estimate_email_deliveries SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [id]);
    const second = (await estimates.claimEmailDelivery(organizationId, id))!;
    expect(second.attempt_count).toBe(first.attempt_count + 1);
    const current = () => pool.query('SELECT * FROM estimate_email_deliveries WHERE id=$1', [id]).then(r => r.rows[0]);
    const before = await current();
    await estimates.failEmailDelivery(organizationId, id, 'stale timeout', true, first.attempt_count);
    await estimates.completeEmailDelivery(organizationId, id, 'stale-provider', first.attempt_count);
    expect(await current()).toEqual(before);
    expect((await pool.query('SELECT status FROM estimates WHERE id=$1', [estimate.id])).rows[0].status).toBe('draft');
    expect((await pool.query('SELECT revoked_at FROM estimate_public_capabilities WHERE delivery_id=$1', [previousId])).rows[0].revoked_at).toBeNull();
    await expect(estimates.completeEmailDelivery(otherOrganizationId, id, 'wrong-tenant', second.attempt_count)).rejects.toThrow('not found');
    const completed = await estimates.completeEmailDelivery(organizationId, id, 'current-provider', second.attempt_count);
    expect(completed.status).toBe('sent');
    const sent = await current();
    await estimates.failEmailDelivery(organizationId, id, 'late timeout', true, second.attempt_count);
    await estimates.completeEmailDelivery(organizationId, id, 'late-provider', second.attempt_count);
    expect(await current()).toEqual(sent);
    expect((await pool.query('SELECT status FROM estimates WHERE id=$1', [estimate.id])).rows[0].status)
      .toBe(deliveryType === 'estimate_sent' ? 'sent' : 'draft');
    const revoked = (await pool.query('SELECT revoked_at FROM estimate_public_capabilities WHERE delivery_id=$1', [previousId])).rows[0].revoked_at;
    if (deliveryType === 'estimate_sent') expect(revoked).not.toBeNull(); else expect(revoked).toBeNull();
    const failedId = await createDelivery('failed');
    const failedClaim = (await estimates.claimEmailDelivery(organizationId, failedId))!;
    expect((await estimates.failEmailDelivery(organizationId, failedId, 'unknown', true, failedClaim.attempt_count)).status).toBe('reconciliation_required');
    expect((await estimates.completeEmailDelivery(organizationId, failedId, 'late-success', failedClaim.attempt_count)).status).toBe('reconciliation_required');
  });

  it.each(['email', 'sms'])('%s review callbacks cannot finalize a newer claim or overwrite sent state', async channel => {
    const batch = (await pool.query(`INSERT INTO review_request_delivery_batches (organization_id,idempotency_key,operation,input_fingerprint)
      VALUES ($1,$2,'send',$3) RETURNING id`, [organizationId, channel, 'a'.repeat(64)])).rows[0];
    const request = (await pool.query('INSERT INTO review_requests (organization_id,channel) VALUES ($1,$2) RETURNING id', [organizationId, channel])).rows[0];
    const id = Number((await pool.query(`INSERT INTO review_request_deliveries
      (organization_id,batch_id,review_request_id,channel,recipient,payload)
      VALUES ($1,$2,$3,$4,'qa@example.test','{}') RETURNING id`, [organizationId, batch.id, request.id, channel])).rows[0].id);
    const first = (await reviews.claim(organizationId, id))!;
    await pool.query("UPDATE review_request_deliveries SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [id]);
    const second = (await reviews.claim(organizationId, id))!;
    const snapshot = async () => ({
      delivery: (await pool.query('SELECT * FROM review_request_deliveries WHERE id=$1', [id])).rows[0],
      request: (await pool.query('SELECT * FROM review_requests WHERE id=$1', [request.id])).rows[0],
      batch: (await pool.query('SELECT * FROM review_request_delivery_batches WHERE id=$1', [batch.id])).rows[0],
    });
    const before = await snapshot();
    await reviews.fail(organizationId, id, 'stale failure', true, first.attempt_count);
    expect(await reviews.complete(organizationId, id, 'stale-provider', first.attempt_count)).toBe(false);
    expect(await reviews.complete(otherOrganizationId, id, 'wrong-tenant', second.attempt_count)).toBe(false);
    await reviews.fail(otherOrganizationId, id, 'wrong-tenant', true, second.attempt_count);
    expect(await snapshot()).toEqual(before);
    await reviews.fail(organizationId, id, 'known rejection', false, second.attempt_count);
    expect((await snapshot()).delivery.status).toBe('retry');
    expect(await reviews.complete(organizationId, id, 'late-provider', second.attempt_count)).toBe(false);
    await pool.query('UPDATE review_request_deliveries SET next_attempt_at=NOW() WHERE id=$1', [id]);
    const third = (await reviews.claim(organizationId, id))!;
    expect(await reviews.complete(organizationId, id, 'current-provider', third.attempt_count)).toBe(true);
    const sent = await snapshot();
    expect(sent.batch.status).toBe('sent'); expect(sent.request[`${channel}_sent`]).toBe(true);
    await reviews.fail(organizationId, id, 'late failure', true, third.attempt_count);
    expect(await reviews.complete(organizationId, id, 'replacement-provider', third.attempt_count)).toBe(false);
    expect(await snapshot()).toEqual(sent);
  });
});
