import { Pool } from 'pg';
import { ResendEstimateEmailProvider } from '../../src/estimates/estimate-email.provider';
import { ResendReputationEmailProvider } from '../../src/reputation-requests/reputation-request-delivery.providers';
import { ResendTrialReminderEmailProvider } from '../../src/trial-reminders/trial-reminders.service';
import { ResendWorkflowEmailProvider } from '../../src/workflow-jobs/workflow-side-effect.providers';
import { EmailWebhooksService } from '../../src/email-webhooks/email-webhooks.service';
import { sendDurableEmail } from '../../src/common/durable-email';

describe('remaining transactional email crash recovery', () => {
  let pool: Pool;
  let helper: any;
  let organizationId: number;
  const originalKey = process.env.RESEND_API_KEY;
  beforeAll(async () => {
    const Helper = require('../../../db/test-support/test-db-helper');
    helper = new Helper(); await helper.setup(); pool = helper.pool;
    const owner = await helper.seedUser(`remaining-email-${Date.now()}@test.itemize`,'Receipt QA');
    organizationId = owner.org.id;
    process.env.RESEND_API_KEY = 're_test_only';
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (helper) await helper.teardown();
  });

  it.each(['workflow','estimate','review_request','trial_reminder'] as const)
  ('%s preserves its wire request and deadline through lost responses and reuses accepted receipts', async source => {
    const deliveryId = 970000 + ['workflow','estimate','review_request','trial_reminder'].indexOf(source);
    const identity = {source,organizationId,deliveryId};
    const key = `receipt-${source}-${organizationId}`;
    const provider = source === 'workflow' ? new ResendWorkflowEmailProvider(pool)
      : source === 'estimate' ? new ResendEstimateEmailProvider(pool)
        : source === 'review_request' ? new ResendReputationEmailProvider(pool) : new ResendTrialReminderEmailProvider(pool);
    const message = {durableDelivery:identity,to:'qa@example.test',subject:'Original subject',html:'<p>Original private body</p>',
      text:'Original private body',tags:[],idempotencyKey:key};
    const mock = jest.spyOn(global,'fetch').mockRejectedValue(new Error('provider accepted, response lost'));
    await expect(provider.send(message)).rejects.toMatchObject({providerOutcomeUnknown:true});
    const saved = (await pool.query('SELECT * FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2',[source,deliveryId])).rows[0];
    expect(saved.request_body).toMatch(/^v1:/);
    expect(saved.request_body).not.toContain('Original private body');
    await expect(provider.send({...message,to:'changed@example.test',subject:'Changed',html:'Changed',text:'Changed'}))
      .rejects.toMatchObject({providerOutcomeUnknown:true});
    expect(mock.mock.calls[1][1]?.body).toBe(mock.mock.calls[0][1]?.body);
    expect(mock.mock.calls[1][1]?.headers).toEqual(mock.mock.calls[0][1]?.headers);
    expect((await pool.query('SELECT first_attempt_at FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2',[source,deliveryId])).rows[0].first_attempt_at)
      .toEqual(saved.first_attempt_at);
    await pool.query("UPDATE delivery_provider_receipts SET first_attempt_at=NOW()-INTERVAL '24 hours' WHERE source=$1 AND delivery_id=$2",[source,deliveryId]);
    await expect(provider.send(message)).rejects.toMatchObject({providerOutcomeUnknown:true});
    expect(mock).toHaveBeenCalledTimes(2);
    // Simulate durable provider evidence surviving a crash before job completion.
    await pool.query('UPDATE delivery_provider_receipts SET provider_id=$3 WHERE source=$1 AND delivery_id=$2',[source,deliveryId,`${key}-accepted`]);
    await expect(provider.send(message)).resolves.toMatchObject({providerId:`${key}-accepted`});
    expect(mock).toHaveBeenCalledTimes(2);
    const webhook = new EmailWebhooksService(pool,null as any);
    expect(await webhook.processResendEvent(`${key}-event`,{type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:`${key}-accepted`}}))
      .toMatchObject({matched:true});
    expect((await pool.query('SELECT provider_status FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2',[source,deliveryId])).rows[0].provider_status).toBe('delivered');
  });

  it('saves real provider evidence before returning acceptance and flags a receipt-write failure', async () => {
    const identity = {source:'workflow' as const,organizationId,deliveryId:980001};
    const mock = jest.spyOn(global,'fetch').mockImplementation(async () => new Response(JSON.stringify({id:'remaining-provider-id'})));
    await expect(sendDurableEmail(pool,identity,'remaining-real',{to:['qa@example.test'],html:'Private'},'re_test'))
      .resolves.toEqual({providerId:'remaining-provider-id'});
    await expect(sendDurableEmail(pool,identity,'remaining-real',{html:'Changed'},'re_test')).resolves.toEqual({providerId:'remaining-provider-id'});
    expect(mock).toHaveBeenCalledTimes(1);
    // Reuse the same provider ID for another identity: unique receipt protection must fail closed.
    await expect(sendDurableEmail(pool,{...identity,deliveryId:980002},'remaining-conflict',{html:'Other'},'re_test'))
      .rejects.toMatchObject({retryable:false,providerOutcomeUnknown:true});
  });

  it('blocks an untracked repeat claim after deployment without inventing its original request', async () => {
    const mock = jest.spyOn(global,'fetch');
    await expect(sendDurableEmail(pool,{source:'estimate',organizationId,deliveryId:990000,attemptCount:2},
      'untracked-repeat',{html:'Invented'},'re_test')).rejects.toMatchObject({retryable:false,providerOutcomeUnknown:true});
    expect(mock).not.toHaveBeenCalled();
    expect((await pool.query("SELECT review_required,request_body FROM delivery_provider_receipts WHERE source='estimate' AND delivery_id=990000")).rows[0])
      .toEqual({review_required:true,request_body:null});
  });

  it('quarantines a new receipt that conflicts with another tenant legacy outbox', async () => {
    const other = await helper.seedUser(`receipt-other-${Date.now()}@test.itemize`,'Other owner');
    await pool.query(`INSERT INTO delivery_provider_receipts
      (organization_id,source,delivery_id,idempotency_key,provider_id) VALUES ($1,'estimate',990001,'tenant-conflict','tenant-conflict')`,[organizationId]);
    await pool.query(`INSERT INTO trial_reminder_deliveries(organization_id,trial_ends_at,provider_id,status)
      VALUES ($1,NOW(),'tenant-conflict','sent')`,[other.org.id]);
    const webhook = new EmailWebhooksService(pool,null as any);
    await expect(webhook.processResendEvent('tenant-conflict-event',{type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'tenant-conflict'}}))
      .resolves.toMatchObject({pending:true,reason:'ambiguous'});
    expect((await pool.query("SELECT provider_status FROM delivery_provider_receipts WHERE idempotency_key='tenant-conflict'")).rows[0].provider_status).toBeNull();
  });

  it('backfills legacy attempts conservatively and keeps the trial key byte-for-byte', async () => {
    const migrate = require('../../../db/src/db_remaining_email_receipt_migrations').runRemainingEmailReceiptMigration;
    const row = (await pool.query(`INSERT INTO workflow_side_effect_outbox
      (organization_id,idempotency_key,enrollment_run_at,effect_type,payload,attempt_count,status,created_at)
      VALUES ($1,$2,NOW(),'email','{}',1,'retry',NOW()-INTERVAL '2 days') RETURNING id`,[organizationId,'legacy-remaining-review'])).rows[0];
    const trialEnds = new Date('2027-01-03T04:05:06.123Z');
    const trial = (await pool.query(`INSERT INTO trial_reminder_deliveries
      (organization_id,trial_ends_at,attempt_count,status,provider_id) VALUES ($1,$2,1,'sent',$3) RETURNING id`,
    [organizationId,trialEnds,'legacy-trial-provider'])).rows[0];
    await migrate(pool); await migrate(pool);
    const receipt = (await pool.query("SELECT * FROM delivery_provider_receipts WHERE source='workflow' AND delivery_id=$1",[row.id])).rows[0];
    expect(receipt).toMatchObject({review_required:true,request_body:null,provider_id:null,idempotency_key:'legacy-remaining-review'});
    const fetchMock = jest.spyOn(global,'fetch');
    await expect(sendDurableEmail(pool,{source:'workflow',organizationId,deliveryId:Number(row.id)},'legacy-remaining-review',{html:'Invented'},'re_test'))
      .rejects.toMatchObject({retryable:false,providerOutcomeUnknown:true});
    expect(fetchMock).not.toHaveBeenCalled();
    const trialReceipt = (await pool.query("SELECT * FROM delivery_provider_receipts WHERE source='trial_reminder' AND delivery_id=$1",[trial.id])).rows[0];
    expect(trialReceipt).toMatchObject({idempotency_key:`trial-reminder:${organizationId}:${trialEnds.toISOString()}`,provider_id:'legacy-trial-provider',request_body:null});
  });
});
