import { Pool } from 'pg';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { GleamHandoffReceiverService } from '../../src/gleam-integration/gleam-handoff-receiver.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { GLEAM_TOKEN_AUDIENCE, GLEAM_TOKEN_ISSUER } from '../../src/gleam-integration/gleam-integration.guard';
const fixtures = require('../../src/integrations/client-work.contract.fixtures.json');
const { getTestDatabasePoolConfig } = require('../../../db/test-support/test-database-config');
const { runGleamHandoffReceiverMigration } = require('../../../db/src/db_gleam_handoff_receiver_migrations');
const { runGleamTaskStatusMigration } = require('../../../db/src/db_gleam_task_status_migrations');
const { runGleamNotificationMigration } = require('../../../db/src/db_gleam_notification_migrations');

describe('Gleam handoff receiver PostgreSQL and HTTP boundary',()=>{
  let pool:Pool, app:NestExpressApplication, receiver:GleamHandoffReceiverService;
  let org:number, foreignOrg:number, owner:number, member:number, foreignOwner:number, contact:number, foreignContact:number;
  const connectionId=randomUUID(), foreignConnectionId=randomUUID();
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const publicPem=keys.publicKey.export({type:'spki',format:'pem'}).toString();
  const privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const jwt=new JwtService();
  const token=(overrides:Record<string,unknown>={},options:JwtSignOptions={})=>{
    const now=Math.floor(Date.now()/1000);
    return jwt.signAsync({iss:GLEAM_TOKEN_ISSUER,aud:GLEAM_TOKEN_AUDIENCE,sub:'gleam-source-1',connectionId,generation:1,
      scope:'handoffs:write',jti:randomUUID(),iat:now,exp:now+300,...overrides},
    {privateKey:privatePem,algorithm:'RS256',keyid:'test-key',...options});
  };
  const event=()=>({...fixtures.handoff,eventId:randomUUID(),connectionId,data:{...fixtures.handoff.data,handoffId:randomUUID(),itemizeContactId:String(contact)}});
  const post=async(body:object,credential?:string)=>request(app.getHttpServer()).post('/api/integrations/gleam/handoffs')
    .set('Authorization',`Bearer ${credential??await token()}`).send(body);
  const counts=async()=> (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM tasks WHERE organization_id=$1) AS tasks,
    (SELECT COUNT(*)::int FROM contact_activities WHERE contact_id=$2) AS activities,
    (SELECT COUNT(*)::int FROM client_task_audit WHERE organization_id=$1) AS audit,
    (SELECT COUNT(*)::int FROM gleam_handoff_sources WHERE connection_id=$3) AS sources,
    (SELECT COUNT(*)::int FROM gleam_handoff_inbox WHERE connection_id=$3) AS receipts`,[org,contact,connectionId])).rows[0];
  beforeAll(async()=>{
    pool=new Pool(getTestDatabasePoolConfig(process.env));
    await runGleamHandoffReceiverMigration(pool);await runGleamHandoffReceiverMigration(pool);
    await runGleamTaskStatusMigration(pool);await runGleamTaskStatusMigration(pool);
    await runGleamNotificationMigration(pool);await runGleamNotificationMigration(pool);
    const suffix=randomUUID();
    const users=await pool.query<{id:number}>(`INSERT INTO users(email,name,provider,email_verified) SELECT $1||n||'@test.itemize','Gleam test '||n,'email',true FROM generate_series(1,3) n RETURNING id`,[suffix]);
    [owner,member,foreignOwner]=users.rows.map(row=>row.id);
    const orgs=await pool.query<{id:number}>(`INSERT INTO organizations(name,slug) VALUES('Gleam receiver',$1),('Other receiver',$2) RETURNING id`,[suffix,`${suffix}-other`]);
    [org,foreignOrg]=orgs.rows.map(row=>row.id);
    await pool.query(`INSERT INTO organization_members(organization_id,user_id,role,joined_at) VALUES($1,$2,'owner',NOW()),($1,$3,'member',NOW()),($4,$5,'owner',NOW())`,[org,owner,member,foreignOrg,foreignOwner]);
    const contacts=await pool.query<{id:number}>(`INSERT INTO contacts(organization_id,first_name) VALUES($1,'Linked client'),($2,'Foreign client') RETURNING id`,[org,foreignOrg]);
    [contact,foreignContact]=contacts.rows.map(row=>row.id);
    await pool.query(`INSERT INTO gleam_connections(id,organization_id,source_organization_id,state,key_id,public_key,source_approved_at,target_approved_at,target_approved_by,default_assignee_id)
      VALUES($1,$2,'gleam-source-1','active','test-key',$3,NOW(),NOW(),$4,$5),($6,$7,'gleam-source-other','active','test-key',$3,NOW(),NOW(),$8,$8)`,
    [connectionId,org,publicPem,owner,member,foreignConnectionId,foreignOrg,foreignOwner]);
    const moduleRef=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PG_POOL).useValue(pool).compile();
    app=moduleRef.createNestApplication<NestExpressApplication>({bodyParser:false,logger:false});configureApp(app);await app.init();
    receiver=app.get(GleamHandoffReceiverService);
  });
  afterAll(async()=>{
    if(pool){await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])',[[org,foreignOrg].filter(Boolean)]);await pool.query('DELETE FROM users WHERE id=ANY($1::int[])',[[owner,member,foreignOwner].filter(Boolean)]);if(app)await app.close();else await pool.end();}
  });

  it('applies one assigned task, call activity, audit and receipt despite concurrent replay',async()=>{
    const input=event(),before=await counts();
    const [one,two]=await Promise.all([post(input),post(input)]);
    expect(one.status).toBe(200);expect(two.status).toBe(200);expect(two.body).toEqual(one.body);
    expect(one.body).toMatchObject({status:'applied',eventId:input.eventId,result:{handoffId:input.data.handoffId,itemizeContactId:String(contact)}});
    expect(await counts()).toEqual(Object.fromEntries(Object.entries(before).map(([key,value])=>[key,Number(value)+1])));
    const task=(await pool.query('SELECT * FROM tasks WHERE id=$1',[Number(one.body.result.taskId)])).rows[0];
    expect(task).toMatchObject({organization_id:org,assigned_to:member,contact_id:contact,status:'pending',created_by:null});
    const receipt=await request(app.getHttpServer()).get(`/api/integrations/gleam/receipts/${input.eventId}`).set('Authorization',`Bearer ${await token({scope:'receipts:read'})}`);
    expect(receipt.status).toBe(200);expect(receipt.body).toEqual(one.body);
  });
  it('preserves human edits when the same handoff is re-emitted under a new event ID',async()=>{
    const input=event(),first=await post(input),id=Number(first.body.result.taskId);
    await pool.query("UPDATE tasks SET title='Staff edited this',status='completed',completed_at=NOW(),version=2 WHERE id=$1",[id]);
    const before=await counts();
    const replay=await post({...input,eventId:randomUUID()});
    expect(replay.status).toBe(200);expect(replay.body.result.taskId).toBe(String(id));
    expect(await counts()).toEqual({...before,receipts:before.receipts+1});
    expect((await pool.query('SELECT title,status FROM tasks WHERE id=$1',[id])).rows[0]).toEqual({title:'Staff edited this',status:'completed'});
    const conflict=await post({...input,eventId:randomUUID(),data:{...input.data,callId:'different-call'}});
    expect(conflict.status).toBe(409);expect(conflict.body.error.code).toBe('SOURCE_IDENTITY_CONFLICT');
  });
  it('reads versioned task status only with the dedicated scope and preserves deletion identity',async()=>{
    const input=event(),receipt=await post(input),id=Number(receipt.body.result.taskId);
    const read=async(credential:string)=>request(app.getHttpServer()).get(`/api/integrations/gleam/tasks/${input.eventId}`).set('Authorization',`Bearer ${credential}`);
    expect((await read(await token())).status).toBe(403);
    const credential=await token({scope:'task-status:read'});
    const pending=await read(credential);
    expect(pending.headers['cache-control']).toBe('no-store');
    expect(pending.status).toBe(200);expect(pending.body.task).toEqual({version:1,status:'pending',completedAt:null});
    // Legacy/direct writers cannot change mirrored fields without advancing the version.
    await pool.query("UPDATE tasks SET status='completed',completed_at=NOW() WHERE id=$1",[id]);
    expect((await read(credential)).body.task).toMatchObject({version:2,status:'completed'});
    await pool.query("UPDATE tasks SET status='pending',completed_at=NULL,version=1 WHERE id=$1",[id]);
    expect((await read(credential)).body.task).toEqual({version:3,status:'pending',completedAt:null});
    await pool.query('DELETE FROM tasks WHERE id=$1',[id]);
    expect((await read(credential)).body).toMatchObject({eventId:input.eventId,taskId:String(id),task:null});
  });
  it('does not expose a task through another connection or an unrecognized receipt',async()=>{
    const input=event();await post(input);
    const other=await token({connectionId:foreignConnectionId,sub:'gleam-source-other',scope:'task-status:read'});
    const read=await request(app.getHttpServer()).get(`/api/integrations/gleam/tasks/${input.eventId}`).set('Authorization',`Bearer ${other}`);
    expect(read.status).toBe(404);expect(read.body.error.code).toBe('RECEIPT_NOT_FOUND');
  });
  it('notifies the current assignee once despite concurrent commands and a new delivery event',async()=>{
    const input=event(),applied=await post(input),id=Number(applied.body.result.taskId);
    const credential=await token({scope:'notifications:write'});
    const notify=(eventId=input.eventId,auth=credential)=>request(app.getHttpServer()).post(`/api/integrations/gleam/handoffs/${eventId}/notify`).set('Authorization',`Bearer ${auth}`).send({});
    expect((await notify(input.eventId,await token())).status).toBe(403);
    // The task's current assignee, rather than the old connection default, receives the notice.
    await pool.query('UPDATE tasks SET assigned_to=$2 WHERE id=$1',[id,owner]);
    const [one,two]=await Promise.all([notify(),notify()]);
    expect(one.status).toBe(200);expect(two.body).toEqual(one.body);expect(one.body.status).toBe('notified');
    const notices=async()=> (await pool.query("SELECT n.recipient_user_id FROM user_notifications n JOIN notification_events e ON e.id=n.event_id WHERE e.organization_id=$1 AND e.entity_type='task' AND e.entity_id=$2",[org,id])).rows;
    expect(await notices()).toEqual([{recipient_user_id:owner}]);
    await pool.query('UPDATE tasks SET assigned_to=$2 WHERE id=$1',[id,member]);
    const newEvent=randomUUID();await post({...input,eventId:newEvent});
    expect((await notify(newEvent)).body).toMatchObject({eventId:newEvent,status:'notified'});
    expect(await notices()).toEqual([{recipient_user_id:owner}]);
    const foreign=await token({connectionId:foreignConnectionId,sub:'gleam-source-other',scope:'notifications:write'});
    expect((await notify(input.eventId,foreign)).status).toBe(404);
  });
  it.each(['completed','deleted'])('does not notify for an already %s task',async mode=>{
    const input=event(),applied=await post(input),id=Number(applied.body.result.taskId);
    if(mode==='deleted')await pool.query('DELETE FROM tasks WHERE id=$1',[id]);
    else await pool.query("UPDATE tasks SET status='completed',completed_at=NOW() WHERE id=$1",[id]);
    const result=await request(app.getHttpServer()).post(`/api/integrations/gleam/handoffs/${input.eventId}/notify`)
      .set('Authorization',`Bearer ${await token({scope:'notifications:write'})}`).send({});
    expect(result.status).toBe(200);expect(result.body.status).toBe('not_needed');
    expect((await pool.query("SELECT id FROM notification_events WHERE organization_id=$1 AND entity_type='task' AND entity_id=$2",[org,id])).rowCount).toBe(0);
  });
  it('retains an unconfirmed notification when the current assignee loses membership',async()=>{
    const input=event(),applied=await post(input),id=Number(applied.body.result.taskId);
    await pool.query("UPDATE organization_members SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[org,member]);
    try {
      const result=await request(app.getHttpServer()).post(`/api/integrations/gleam/handoffs/${input.eventId}/notify`)
        .set('Authorization',`Bearer ${await token({scope:'notifications:write'})}`).send({});
      expect(result.status).toBe(409);expect(result.body.error.code).toBe('ASSIGNEE_UNAVAILABLE');
      expect((await pool.query("SELECT id FROM notification_events WHERE organization_id=$1 AND entity_type='task' AND entity_id=$2",[org,id])).rowCount).toBe(0);
      expect((await pool.query('SELECT * FROM gleam_handoff_notifications WHERE connection_id=$1 AND handoff_id=$2',[connectionId,input.data.handoffId])).rowCount).toBe(0);
    } finally {await pool.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",[org,member]);}
  });
  it('rolls back the assignee notification and realtime event if final persistence fails',async()=>{
    const input=event(),applied=await post(input),id=Number(applied.body.result.taskId);
    const service=app.get(NotificationsService),original=service.createWithClient.bind(service);
    const before=Number((await pool.query("SELECT COUNT(*) FROM realtime_event_outbox WHERE payload->>'organizationId'=$1",[String(org)])).rows[0].count);
    const failure=jest.spyOn(service,'createWithClient').mockImplementationOnce(async(...args)=>{
      await original(...args);throw new Error('Synthetic failure before notification receipt');
    });
    try {
      const result=await request(app.getHttpServer()).post(`/api/integrations/gleam/handoffs/${input.eventId}/notify`)
        .set('Authorization',`Bearer ${await token({scope:'notifications:write'})}`).send({});
      expect(result.status).toBe(500);
      expect((await pool.query("SELECT id FROM notification_events WHERE organization_id=$1 AND entity_type='task' AND entity_id=$2",[org,id])).rowCount).toBe(0);
      expect(Number((await pool.query("SELECT COUNT(*) FROM realtime_event_outbox WHERE payload->>'organizationId'=$1",[String(org)])).rows[0].count)).toBe(before);
      expect((await pool.query('SELECT * FROM gleam_handoff_notifications WHERE connection_id=$1 AND handoff_id=$2',[connectionId,input.data.handoffId])).rowCount).toBe(0);
    } finally {failure.mockRestore();}
  });
  it('rejects changed payload for an existing event ID',async()=>{
    const input=event();await post(input);const before=await counts();
    const result=await post({...input,data:{...input.data,title:'Changed'}});
    expect(result.status).toBe(409);expect(result.body.error.code).toBe('EVENT_PAYLOAD_CONFLICT');expect(await counts()).toEqual(before);
  });
  it('keeps unknown callers unlinked with visible callback details and no invented contact',async()=>{
    const original=event(),input={...original,data:{...original.data,itemizeContactId:null}};
    const before=(await pool.query('SELECT COUNT(*)::int AS count FROM contacts WHERE organization_id=$1',[org])).rows[0].count;
    const result=await post(input);expect(result.status).toBe(200);expect(result.body.result.itemizeContactId).toBeNull();
    const task=(await pool.query('SELECT contact_id,description FROM tasks WHERE id=$1',[Number(result.body.result.taskId)])).rows[0];
    expect(task.contact_id).toBeNull();expect(task.description).toContain('+12025550100');
    expect((await pool.query('SELECT COUNT(*)::int AS count FROM contacts WHERE organization_id=$1',[org])).rows[0].count).toBe(before);
  });
  it('rejects cross-organization references and ignores tenant-selection headers',async()=>{
    const input=event(),before=await counts();input.data.itemizeContactId=String(foreignContact);
    const result=await request(app.getHttpServer()).post('/api/integrations/gleam/handoffs').set('Authorization',`Bearer ${await token()}`).set('x-organization-id',String(foreignOrg)).send(input);
    expect(result.status).toBe(409);expect(result.body.error.code).toBe('CONTACT_REFERENCE_INVALID');expect(await counts()).toEqual(before);
    const foreign=await post({...event(),connectionId:foreignConnectionId});expect(foreign.status).toBe(403);
  });
  it.each<[string,Record<string,unknown>]>([
    ['wrong audience',{aud:'another-service'}],['wrong issuer',{iss:'another-issuer'}],['wrong source',{sub:'foreign-source'}],
    ['expired',{iat:Math.floor(Date.now()/1000)-400,exp:Math.floor(Date.now()/1000)-100}],
    ['long lived',{exp:Math.floor(Date.now()/1000)+3600}],['future issued',{iat:Math.floor(Date.now()/1000)+120,exp:Math.floor(Date.now()/1000)+300}],
    ['old generation',{generation:2}],['unknown grant',{connectionId:randomUUID()}],
  ])('rejects %s credentials',async(_label,overrides)=>{
    const before=await counts();expect((await post(event(),await token(overrides))).status).toBe(401);expect(await counts()).toEqual(before);
  });
  it('rejects an invalid signature, embedded key URL and browser cookie credentials',async()=>{
    const other=generateKeyPairSync('rsa',{modulusLength:2048});
    expect((await post(event(),await token({}, {privateKey:other.privateKey.export({type:'pkcs8',format:'pem'}).toString()}))).status).toBe(401);
    expect((await post(event(),await token({}, {header:{alg:'RS256',typ:'JWT',kid:'test-key',jku:'https://example.invalid/key'}}))).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/integrations/gleam/handoffs').set('Cookie','itemize_auth=fake').send(event())).status).toBe(401);
    const hs=await jwt.signAsync({connectionId},{secret:'not-a-service-key',algorithm:'HS256'});
    expect((await post(event(),hs)).status).toBe(401);
  });
  it('enforces direction and per-route scopes',async()=>{
    expect((await post(event(),await token({scope:'receipts:read'}))).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/integrations/gleam/receipts/${randomUUID()}`).set('Authorization',`Bearer ${await token()}`)).status).toBe(403);
    expect((await post({...fixtures.taskCompleted,connectionId})).status).toBe(400);
    expect((await post({...event(),organizationId:foreignOrg})).status).toBe(400);
  });
  it('does not expose another connection receipt',async()=>{
    const input=event();await post(input);
    const result=await request(app.getHttpServer()).get(`/api/integrations/gleam/receipts/${input.eventId}`).set('Authorization',`Bearer ${await token({connectionId:foreignConnectionId,sub:'gleam-source-other',scope:'receipts:read'})}`);
    expect(result.status).toBe(404);
  });
  it('blocks new application on entitlement loss but permits existing receipt reconciliation',async()=>{
    const input=event(),first=await post(input);
    await pool.query("UPDATE organizations SET subscription_status='canceled',trial_ends_at=NULL WHERE id=$1",[org]);
    try{
      expect((await post(event())).body.error.code).toBe('ENTITLEMENT_REQUIRED');
      expect((await post(input)).body).toEqual(first.body);
      expect((await request(app.getHttpServer()).get(`/api/integrations/gleam/receipts/${input.eventId}`).set('Authorization',`Bearer ${await token({scope:'receipts:read'})}`)).status).toBe(200);
    }finally{await pool.query("UPDATE organizations SET subscription_status='active' WHERE id=$1",[org]);}
  });
  it('requires an eligible assignee and a currently authorized local approver',async()=>{
    await pool.query("UPDATE organization_members SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[org,member]);
    try{expect((await post(event())).body.error.code).toBe('ASSIGNEE_UNAVAILABLE');}finally{await pool.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",[org,member]);}
    await pool.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",[org,owner]);
    try{expect((await post(event())).body.error.code).toBe('APPROVAL_REQUIRED');}finally{await pool.query("UPDATE organization_members SET role='owner' WHERE organization_id=$1 AND user_id=$2",[org,owner]);}
  });
  it('rechecks revocation after signature verification and before applying the event',async()=>{
    const original=receiver.receive.bind(receiver),before=await counts();
    const spy=jest.spyOn(receiver,'receive').mockImplementationOnce(async(principal,input)=>{
      await pool.query("UPDATE gleam_connections SET state='revoked' WHERE id=$1",[connectionId]);return original(principal,input);
    });
    try{const result=await post(event());expect(result.status).toBe(401);expect(await counts()).toEqual(before);}
    finally{spy.mockRestore();await pool.query("UPDATE gleam_connections SET state='active' WHERE id=$1",[connectionId]);}
  });
  it('does not reactivate pending or revoked connections',async()=>{
    for(const state of ['pending','revoked']) {
      await pool.query('UPDATE gleam_connections SET state=$2 WHERE id=$1',[connectionId,state]);
      try{expect((await post(event())).status).toBe(401);}finally{await pool.query("UPDATE gleam_connections SET state='active' WHERE id=$1",[connectionId]);}
    }
  });
  it('rejects a key replaced after the guard verifies the token',async()=>{
    const replacement=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'pem'}).toString();
    const original=receiver.receive.bind(receiver),before=await counts();
    const spy=jest.spyOn(receiver,'receive').mockImplementationOnce(async(principal,input)=>{
      await pool.query('UPDATE gleam_connections SET public_key=$2 WHERE id=$1',[connectionId,replacement]);
      return original(principal,input);
    });
    try{expect((await post(event())).status).toBe(401);expect(await counts()).toEqual(before);}
    finally{spy.mockRestore();await pool.query('UPDATE gleam_connections SET public_key=$2 WHERE id=$1',[connectionId,publicPem]);}
  });
  it('preserves source deduplication across a connection generation change',async()=>{
    const input=event(),first=await post(input),oldToken=await token(),before=await counts();
    await pool.query('UPDATE gleam_connections SET generation=2 WHERE id=$1',[connectionId]);
    try{
      expect((await post(input,oldToken)).status).toBe(401);
      const result=await post({...input,eventId:randomUUID(),connectionGeneration:2},await token({generation:2}));
      expect(result.status).toBe(200);expect(result.body.result).toEqual(first.body.result);
      expect(await counts()).toEqual({...before,receipts:before.receipts+1});
    }finally{await pool.query('UPDATE gleam_connections SET generation=1 WHERE id=$1',[connectionId]);}
  });
  it('does not allow a connection to be retargeted to another organization',async()=>{
    await expect(pool.query('UPDATE gleam_connections SET organization_id=$2 WHERE id=$1',[connectionId,foreignOrg])).rejects.toThrow('organization pair is immutable');
    await expect(pool.query("UPDATE gleam_connections SET source_organization_id='changed-source' WHERE id=$1",[connectionId])).rejects.toThrow('organization pair is immutable');
  });
  it('retains a source tombstone after task deletion',async()=>{
    const input=event(),first=await post(input);
    await pool.query('DELETE FROM tasks WHERE id=$1',[Number(first.body.result.taskId)]);
    const before=await counts(),result=await post({...input,eventId:randomUUID()});
    expect(result.status).toBe(410);expect(result.body.error.code).toBe('HANDOFF_REMOVED');expect(await counts()).toEqual(before);
  });
  it('rolls all effects back if receipt persistence fails',async()=>{
    const before=await counts();
    await pool.query(`CREATE OR REPLACE FUNCTION gleam_test_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$;
      CREATE TRIGGER gleam_test_receipt_failure BEFORE INSERT ON gleam_handoff_inbox FOR EACH ROW WHEN (NEW.connection_id='${connectionId}'::uuid) EXECUTE FUNCTION gleam_test_reject_receipt()`);
    try{expect((await post(event())).status).toBe(500);expect(await counts()).toEqual(before);}
    finally{await pool.query('DROP TRIGGER gleam_test_receipt_failure ON gleam_handoff_inbox; DROP FUNCTION gleam_test_reject_receipt()');}
  });
});
