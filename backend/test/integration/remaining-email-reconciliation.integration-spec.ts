import { Pool } from 'pg';
import { DeliveryReconciliationService } from '../../src/admin-operations/delivery-reconciliation.service';
import { deliveryTag, sendDurableEmail } from '../../src/common/durable-email';
import { encryptDeliveryPayload } from '../../src/common/delivery-payload-encryption';

describe('remaining email operator recovery', () => {
  let helper: any; let pool: Pool; let org: number; let actor: number; let otherOrg: number;
  let service: DeliveryReconciliationService;
  const originalKey = process.env.RESEND_API_KEY;
  const payload = { to: ['qa@example.test'], subject: 'Recovery QA', html: '<p>Private</p>' };
  beforeAll(async () => {
    const Helper = require('../../../db/test-support/test-db-helper'); helper = new Helper();
    await helper.setup(); pool = helper.pool;
    const owner = await helper.seedUser('reconciliation-owner@test.itemize', 'QA');
    org = owner.org.id; actor = owner.user.id;
    otherOrg = (await helper.seedUser('reconciliation-other@test.itemize', 'Other')).org.id;
    service = new DeliveryReconciliationService(pool); process.env.RESEND_API_KEY = 're_test';
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (helper) {
      // Remove this suite's unresolved child jobs before the production delete guard
      // rejects cascading deletion of their parent request/organization.
      await pool.query('DELETE FROM review_request_deliveries WHERE organization_id=$1', [org]);
      await helper.teardown();
    }
  });
  it.each(['estimate', 'review_request', 'workflow', 'trial_reminder'] as const)
  ('%s verifies evidence and resumes only bookkeeping without sending', async source => {
    const index = ['estimate', 'review_request', 'workflow', 'trial_reminder'].indexOf(source);
    const key = `operator-${source}`;
    const providerId = `11111111-2222-4333-8444-55555555555${index}`;
    const table = { estimate: 'estimate_email_deliveries', review_request: 'review_request_deliveries',
      workflow: 'workflow_side_effect_outbox', trial_reminder: 'trial_reminder_deliveries' }[source];
    let id: number;
    if (source === 'estimate') {
      const estimate = (await pool.query("INSERT INTO estimates (organization_id,estimate_number,valid_until) VALUES ($1,'recovery',CURRENT_DATE+7) RETURNING id", [org])).rows[0];
      id = Number((await pool.query(`INSERT INTO estimate_email_deliveries (organization_id,estimate_id,idempotency_key,recipient_email,subject,payload)
        VALUES ($1,$2,$3,'qa@example.test','Recovery QA','{}') RETURNING id`, [org, estimate.id, key])).rows[0].id);
    } else if (source === 'review_request') {
      const request = (await pool.query("INSERT INTO review_requests (organization_id,channel) VALUES ($1,'email') RETURNING id", [org])).rows[0];
      const batch = (await pool.query("INSERT INTO review_request_delivery_batches (organization_id,idempotency_key,operation,input_fingerprint) VALUES ($1,$2,'send',$3) RETURNING id", [org,key,'a'.repeat(64)])).rows[0];
      id = Number((await pool.query(`INSERT INTO review_request_deliveries (organization_id,review_request_id,batch_id,channel,recipient,payload)
        VALUES ($1,$2,$3,'email','qa@example.test','{}') RETURNING id`, [org,request.id,batch.id])).rows[0].id);
    } else if (source === 'workflow') {
      id = Number((await pool.query(`INSERT INTO workflow_side_effect_outbox (organization_id,idempotency_key,enrollment_run_at,effect_type,payload)
        VALUES ($1,$2,NOW(),'email','{}') RETURNING id`, [org,key])).rows[0].id);
    } else {
      id = Number((await pool.query("INSERT INTO trial_reminder_deliveries (organization_id,trial_ends_at) VALUES ($1,NOW()+INTERVAL '7 days') RETURNING id", [org])).rows[0].id);
    }
    await pool.query(`UPDATE ${table} SET status='dead_letter',attempt_count=2 WHERE id=$1`, [id]);
    await pool.query(`INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,request_body,first_attempt_at,review_required)
      VALUES ($1,$2,$3,$4,$5,NOW()-INTERVAL '3 days',true)`, [org,source,id,key,encryptDeliveryPayload(JSON.stringify(payload),key)]);
    const evidence = { id: providerId, ...payload, tags: [{ name: 'itemize_delivery', value: deliveryTag(key) }], last_event: 'delivered' };
    const fetchMock = jest.spyOn(global,'fetch').mockImplementation(async () => new Response(JSON.stringify({...evidence,tags:[]})));
    await expect(service.reconcile(actor,source,id,providerId)).rejects.toMatchObject({extensions:{code:'CONFLICT'}});
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(evidence)));
    const foreign = (await pool.query(`INSERT INTO trial_reminder_deliveries (organization_id,trial_ends_at,provider_id,status)
      VALUES ($1,NOW()+INTERVAL '7 days',$2,'sent') RETURNING id`, [otherOrg,providerId])).rows[0];
    await expect(service.reconcile(actor,source,id,providerId)).rejects.toMatchObject({extensions:{code:'CONFLICT'}});
    await pool.query('DELETE FROM trial_reminder_deliveries WHERE id=$1', [foreign.id]);
    if (source==='workflow' || source==='review_request') {
      const column = source==='workflow' ? 'effect_type' : 'channel';
      await pool.query(`UPDATE ${table} SET ${column}='sms' WHERE id=$1`, [id]);
      await expect(service.reconcile(actor,source,id,providerId)).rejects.toMatchObject({extensions:{code:'CONFLICT'}});
      await pool.query(`UPDATE ${table} SET ${column}='email' WHERE id=$1`, [id]);
    }
    await pool.query(`UPDATE ${table} SET status='processing',lease_expires_at=NOW()+INTERVAL '1 minute' WHERE id=$1`, [id]);
    await expect(service.reconcile(actor,source,id,providerId)).rejects.toMatchObject({extensions:{code:'CONFLICT'}});
    await pool.query(`UPDATE ${table} SET lease_expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1`, [id]);
    const receiptBefore = (await pool.query('SELECT * FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2',[source,id])).rows[0];
    await expect(service.reconcile(actor,source,id,providerId)).resolves.toBe(true);
    const resumed = (await pool.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0];
    expect(resumed).toMatchObject({status:'retry',attempt_count:2,lease_expires_at:null});
    await service.reconcile(actor,source,id,providerId);
    expect((await pool.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0]).toEqual(resumed);
    const receipt = (await pool.query('SELECT * FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2',[source,id])).rows[0];
    expect(receipt).toMatchObject({provider_id:providerId,review_required:false,request_body:receiptBefore.request_body,first_attempt_at:receiptBefore.first_attempt_at});
    expect((await pool.query('SELECT COUNT(*)::int n FROM delivery_reconciliation_audit WHERE source=$1 AND delivery_id=$2',[source,id])).rows[0].n).toBe(1);
    fetchMock.mockClear();
    await expect(sendDurableEmail(pool,{source,organizationId:org,deliveryId:id,attemptCount:3},key,{subject:'Changed'},'re_test')).resolves.toEqual({providerId});
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(evidence)));
    if (source==='workflow' || source==='trial_reminder') {
      await pool.query(`UPDATE ${table} SET status='cancelled' WHERE id=$1`, [id]);
      await service.reconcile(actor,source,id,providerId);
      expect((await pool.query(`SELECT status FROM ${table} WHERE id=$1`,[id])).rows[0].status).toBe('cancelled');
    }
    await pool.query('UPDATE delivery_provider_receipts SET request_body=NULL WHERE source=$1 AND delivery_id=$2',[source,id]);
    await expect(service.reconcile(actor,source,id,providerId)).rejects.toMatchObject({extensions:{code:'CONFLICT'}});
  });
});
