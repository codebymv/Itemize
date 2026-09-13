import { Pool } from 'pg';
import { ReputationRequestDeliveryRepository } from '../../src/reputation-requests/reputation-request-delivery.repository';
import { ReputationRequestsRepository } from '../../src/reputation-requests/reputation-requests.repository';

describe('review email canonical links and latest delivery outcome', () => {
  let helper: any; let pool: Pool; let org: number; let actor: number; let otherOrg: number;
  let deliveries: ReputationRequestDeliveryRepository; let requests: ReputationRequestsRepository;
  beforeAll(async () => {
    const Helper = require('../../../db/test-support/test-db-helper'); helper = new Helper(); await helper.setup(); pool = helper.pool;
    const owner = await helper.seedUser('review-polish@test.itemize','QA'); org=owner.org.id; actor=owner.user.id;
    otherOrg=(await helper.seedUser('review-polish-other@test.itemize','Other')).org.id;
    deliveries=new ReputationRequestDeliveryRepository(pool); requests=new ReputationRequestsRepository(pool);
  });
  afterAll(async () => {
    if (helper) { await pool.query('DELETE FROM review_request_deliveries WHERE organization_id=$1',[org]); await helper.teardown(); }
  });
  it('snapshots the canonical URL and recovers it for legacy queued payloads', async () => {
    const prepared=await deliveries.prepareSend(org,actor,{idempotencyKey:'canonical',fingerprint:'a'.repeat(64),contactId:null,
      contactEmail:'qa@example.test',contactPhone:null,contactName:'QA',channel:'email',customMessage:'See https://example.test first.',
      preferredPlatform:null,redirectUrl:null,scheduledAt:null});
    if (prepared.kind!=='created') throw new Error('Expected a new request');
    const row=prepared.snapshot.deliveries[0];
    const token=(await pool.query('SELECT unique_token FROM review_requests WHERE id=$1',[row.review_request_id])).rows[0].unique_token;
    expect(row.payload.reviewUrl).toMatch(new RegExp(`/review/${token}$`));
    expect(row.payload.reviewUrl).not.toContain('example.test');
    await pool.query("UPDATE review_request_deliveries SET payload=payload-'reviewUrl' WHERE id=$1",[row.id]);
    const claim=await deliveries.claim(org,Number(row.id));
    expect(claim?.payload.reviewUrl).toBe(row.payload.reviewUrl);
    expect((await pool.query('SELECT payload FROM review_request_deliveries WHERE id=$1',[row.id])).rows[0].payload.reviewUrl).toBeUndefined();
    await deliveries.complete(org,Number(row.id),'accepted',claim!.attempt_count);
    await pool.query(`INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,provider_id,provider_status)
      VALUES ($1,'review_request',$2,'canonical-receipt','accepted','delivered')`,[org,row.id]);
    await pool.query("UPDATE review_requests SET status='clicked' WHERE id=$1",[row.review_request_id]);
    expect((await requests.findByIds(org,[row.review_request_id]))[0]).toMatchObject({status:'clicked',email_delivery_status:'delivered'});
    expect(await requests.findByIds(otherOrg,[row.review_request_id])).toEqual([]);
    const resend=await deliveries.prepareResend(org,actor,row.review_request_id,'resend','b'.repeat(64));
    if (resend.kind!=='created') throw new Error('Expected resend');
    const latest=resend.snapshot.deliveries[0];
    expect(latest.payload.reviewUrl).toBe(row.payload.reviewUrl);
    expect((await requests.findByIds(org,[row.review_request_id]))[0].email_delivery_status).toBeNull();
    await pool.query(`INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,provider_status)
      VALUES ($1,'review_request',$2,'foreign-receipt','delivered')`,[otherOrg,latest.id]);
    expect((await requests.findByIds(org,[row.review_request_id]))[0].email_delivery_status).toBeNull();
    await pool.query("UPDATE delivery_provider_receipts SET organization_id=$1,provider_status='bounced' WHERE source='review_request' AND delivery_id=$2",[org,latest.id]);
    expect((await requests.findPage({organizationId:org,pageSize:10,offset:0})).rows[0].email_delivery_status).toBe('bounced');
  });
});
