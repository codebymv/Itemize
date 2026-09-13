import { Pool } from 'pg';
import { BookingsRepository } from '../../src/bookings/bookings.repository';
import { EstimatesRepository } from '../../src/estimates/estimates.repository';
import { enqueueBookingNotification } from '../../src/bookings/booking-notification';

describe('estimate and booking email evidence', () => {
  let helper: any; let pool: Pool; let org: number; let other: number; let calendar: number; let booking: number; let estimate: number;
  beforeAll(async () => {
    const Helper = require('../../../db/test-support/test-db-helper'); helper=new Helper(); await helper.setup(); pool=helper.pool;
    org=(await helper.seedUser('email-outcomes@test.itemize','QA')).org.id;
    other=(await helper.seedUser('email-outcomes-other@test.itemize','Other')).org.id;
    calendar=(await pool.query("INSERT INTO calendars(organization_id,name,slug,timezone,confirmation_email) VALUES($1,'QA','email-outcomes','America/Phoenix',true) RETURNING id",[org])).rows[0].id;
    booking=(await pool.query("INSERT INTO bookings(organization_id,calendar_id,start_time,end_time,timezone,attendee_email,status) VALUES($1,$2,NOW()+INTERVAL '2 days',NOW()+INTERVAL '2 days 30 minutes','America/Phoenix','qa@example.com','confirmed') RETURNING id",[org,calendar])).rows[0].id;
    estimate=(await pool.query("INSERT INTO estimates(organization_id,estimate_number,issue_date,valid_until,status) VALUES($1,'QA-EMAIL',CURRENT_DATE,CURRENT_DATE+30,'sent') RETURNING id",[org])).rows[0].id;
  });
  afterAll(async()=>{if(helper) await helper.teardown();});
  async function receipt(source: string,id: number,tenant: number,status='delivered') {
    await pool.query("INSERT INTO delivery_provider_receipts(organization_id,source,delivery_id,idempotency_key,provider_status) VALUES($1,$2,$3,$4,$5)",[tenant,source,id,source+id,status]);
  }
  it('uses latest booking event, including pending cancellation, and excludes foreign receipts', async()=>{
    const repo=new BookingsRepository(pool);
    async function event(name: string) {return (await pool.query("INSERT INTO workflow_side_effect_outbox(organization_id,idempotency_key,enrollment_run_at,effect_type,payload) VALUES($1,$2,NOW(),'email',$3) RETURNING id",[org,'outcome-'+name,JSON.stringify({bookingId:booking,bookingEvent:name})])).rows[0].id;}
    const first=await event('confirmed'); await receipt('workflow',first,org);
    expect(await repo.findById(org,booking)).toMatchObject({status:'confirmed',email_delivery_status:'delivered',email_delivery_event:'confirmed'});
    const last=await event('cancelled');
    expect(await repo.findById(org,booking)).toMatchObject({email_delivery_status:null,email_delivery_event:'cancelled'});
    await receipt('workflow',last,other);
    expect((await repo.findById(org,booking))?.email_delivery_status).toBeNull();
    await pool.query("UPDATE delivery_provider_receipts SET organization_id=$1,provider_status='bounced' WHERE source='workflow' AND delivery_id=$2",[org,last]);
    expect((await repo.findById(org,booking))?.email_delivery_status).toBe('bounced');
    expect(await repo.findById(other,booking)).toBeNull();
  });
  it('excludes owner responses and previous sends from customer estimate evidence', async()=>{
    const repo=new EstimatesRepository(pool);
    async function delivery(type: string,key: string){return (await pool.query("INSERT INTO estimate_email_deliveries(organization_id,estimate_id,idempotency_key,recipient_email,subject,payload,delivery_type) VALUES($1,$2,$3,'qa@example.com','QA','{}',$4) RETURNING id",[org,estimate,key,type])).rows[0].id;}
    const first=await delivery('estimate_sent','customer-first'); await receipt('estimate',first,org);
    const response=await delivery('estimate_accepted','owner-response'); await receipt('estimate',response,org,'bounced');
    expect((await repo.findById(org,estimate))?.estimate.email_delivery_status).toBe('delivered');
    const last=await delivery('estimate_sent','customer-second');
    expect((await repo.findById(org,estimate))?.estimate.email_delivery_status).toBeNull();
    await receipt('estimate',last,other);
    expect((await repo.findById(org,estimate))?.estimate.email_delivery_status).toBeNull();
    expect(await repo.findById(other,estimate)).toBeNull();
  });
  it('snapshots configured customer-facing contact and cannot select a foreign default business',async()=>{
    await pool.query("INSERT INTO payment_settings(organization_id,business_email) VALUES($1,'appointments@example.com') ON CONFLICT(organization_id) DO UPDATE SET business_email=EXCLUDED.business_email",[org]);
    const foreign=(await pool.query("INSERT INTO businesses(organization_id,name,email,is_active) VALUES($1,'Other','private@example.com',true) RETURNING id",[other])).rows[0].id;
    await pool.query("UPDATE organizations SET settings=jsonb_build_object('defaultBusinessId',$2::int) WHERE id=$1",[org,foreign]);
    const client=await pool.connect(); try{await enqueueBookingNotification(client,org,booking,'rescheduled','contact-snapshot');}finally{client.release();}
    await pool.query("UPDATE payment_settings SET business_email='changed@example.com' WHERE organization_id=$1",[org]);
    const payload=(await pool.query("SELECT payload FROM workflow_side_effect_outbox WHERE organization_id=$1 AND idempotency_key='booking-notification:contact-snapshot'",[org])).rows[0].payload;
    expect(payload.bodyHtml).toContain('mailto:appointments@example.com');
    expect(payload.bodyHtml).not.toContain('private@example.com');
    expect(payload.bodyText).not.toContain('changed@example.com');
  });
});
