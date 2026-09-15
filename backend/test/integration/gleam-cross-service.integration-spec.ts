/** Optional acceptance suite: supply a compiled, isolated Gleam runtime. Never point at either app's real database. */
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
const {getTestDatabasePoolConfig} = require('../../../db/test-support/test-database-config');
const {runGleamPairingMigration} = require('../../../db/src/db_gleam_pairing_migrations');
const {runGleamTaskStatusMigration} = require('../../../db/src/db_gleam_task_status_migrations');
const {runGleamNotificationMigration} = require('../../../db/src/db_gleam_notification_migrations');

const acceptance = process.env.GLEAM_TEST_RUNTIME_ROOT ? describe : describe.skip;
acceptance('Gleam and Itemize paired handoff acceptance', () => {
  let pool: Pool, app: NestExpressApplication, gleamDb: any, gleamApp: express.Express;
  let gleamOrg: string, gleamActor: string, agent: string, org: number, actor: number, assignee: number;
  let fetcher: jest.SpyInstance, pairService: any, worker: any, persist: any, getCallFollowUp:any;
  let statusWorker: any, statusOverride: object | undefined, statusFailure = false;
  let notificationWorker: any, deliverEmail: any, notificationDropped=false, emailSends=0;
  let beforeStatusResponse: (() => Promise<void>) | undefined;
  const savedGlobalPrisma = (global as any).prisma;
  let dropped = false, handoffPosts = 0;
  beforeAll(async () => {
    const root = path.resolve(process.env.GLEAM_TEST_RUNTIME_ROOT!);
    require(path.join(root, 'backend/__tests__/env.js')); // Complete, inert provider placeholders; no live credentials.
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const url = new URL(process.env.GLEAM_TEST_DATABASE_URL || 'http://invalid');
    if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/gleam_robustness') throw new Error('Dedicated Gleam test database required');
    const {PrismaClient} = require(require.resolve('@prisma/client', {paths: [path.join(root, 'backend')]}));
    gleamDb = new PrismaClient({datasources: {db: {url: url.toString()}}});
    (global as any).prisma = gleamDb;
    process.env.ITEMIZE_PAIRING_ENABLED = 'true'; process.env.GLEAM_PAIRING_ENABLED = 'true'; process.env.ITEMIZE_HANDOFF_EXPORT_ENABLED = 'true';
    process.env.ITEMIZE_NOTIFICATION_COORDINATION_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'synthetic-notification-test-only';
    process.env.ITEMIZE_API_ORIGIN = 'https://itemize.test'; process.env.GLEAM_API_ORIGIN = 'https://gleam.test';
    process.env.ITEMIZE_WRAPPING_KEYS_JSON = JSON.stringify({test: randomBytes(32).toString('base64')}); process.env.ITEMIZE_ACTIVE_WRAPPING_KEY_ID = 'test';
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEYS = JSON.stringify({test: randomBytes(32).toString('hex')}); process.env.CALENDAR_TOKEN_ACTIVE_KEY_ID = 'test';
    const load = (file: string) => require(path.join(root, 'backend/dist', file));
    const {ItemizeCredentialVault} = load('integrations/itemize-credential-vault');
    const {ItemizePairingService} = load('integrations/itemize-pairing.service');
    const {ItemizeHandoffWorker} = load('integrations/itemize-handoff-worker');
    const {ItemizeTaskStatusWorker} = load('integrations/itemize-task-status-worker');
    const {ItemizeNotificationWorker} = load('integrations/itemize-notification-worker');
    deliverEmail = load('services/booking-notification.service').deliverNextBookingNotification;
    const {ItemizeDeliveryClient} = load('integrations/itemize-delivery-client');
    persist = load('services/booking-handoff.service').persistBookingHandoff;
    getCallFollowUp = load('services/recovery-queue.service').getCallItemizeFollowUp;
    gleamApp = express(); gleamApp.use(express.json()); gleamApp.use('/api/itemize', load('routes/itemize.routes').default);
    gleamApp.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode || 500).json({error: 'Test request failed'}));
    pool = new Pool(getTestDatabasePoolConfig(process.env)); await runGleamPairingMigration(pool);
    await runGleamTaskStatusMigration(pool);
    await runGleamNotificationMigration(pool);
    const module = await Test.createTestingModule({imports: [AppModule]}).overrideProvider(PG_POOL).useValue(pool).compile();
    app = module.createNestApplication<NestExpressApplication>({bodyParser: false, logger: false}); configureApp(app); await app.init();
    // Route only the two configured synthetic origins through the real HTTP controllers.
    fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input, options) => {
      const target = new URL(String(input));
      if (target.href === 'https://api.resend.com/emails') {
        emailSends++;
        return new Response(JSON.stringify({id:`synthetic-email-${emailSends}`}),{status:200});
      }
      if (!['https://gleam.test','https://itemize.test'].includes(target.origin)) throw new Error('Unexpected external request');
      const server = target.origin === 'https://gleam.test' ? gleamApp : app.getHttpServer();
      const call = options?.method === 'POST' ? request(server).post(target.pathname) : request(server).get(target.pathname);
      const auth = (options!.headers as Record<string,string>).Authorization;
      call.set('Authorization', auth);
      if (options?.body) call.send(JSON.parse(options.body as string));
      const response = await call;
      if (target.pathname.endsWith('/notify') && response.status===200 && !notificationDropped) {
        notificationDropped=true; throw new Error('Synthetic response loss after notification commit');
      }
      if (target.pathname.startsWith('/api/integrations/gleam/tasks/')) {
        if (beforeStatusResponse) {const action = beforeStatusResponse; beforeStatusResponse = undefined; await action();}
        if (statusFailure) throw new Error('Synthetic unavailable peer');
        if (statusOverride) return new Response(JSON.stringify(statusOverride), {status:200});
      }
      if (target.pathname === '/api/integrations/gleam/handoffs') {
        handoffPosts++;
        if (response.status === 200 && !dropped) {dropped = true; throw new Error('Synthetic response loss after real receiver commit');}
      }
      return new Response(JSON.stringify(response.body), {status: response.status});
    });
    const vault = new ItemizeCredentialVault(JSON.parse(process.env.ITEMIZE_WRAPPING_KEYS_JSON), 'test');
    pairService = new ItemizePairingService(gleamDb, vault, 'https://itemize.test', global.fetch);
    worker = new ItemizeHandoffWorker(gleamDb, vault, new ItemizeDeliveryClient('https://itemize.test', global.fetch));
    statusWorker = new ItemizeTaskStatusWorker(gleamDb, vault, 'https://itemize.test', global.fetch);
    notificationWorker = new ItemizeNotificationWorker(gleamDb, vault, 'https://itemize.test', global.fetch);
    const suffix = randomUUID();
    gleamActor = (await gleamDb.user.create({data: {email: `${suffix}@example.invalid`}})).id;
    gleamOrg = (await gleamDb.organization.create({data: {name: 'Cross-service Gleam', slug: suffix, plan: 'PROFESSIONAL'}})).id;
    await gleamDb.organizationMember.create({data: {userId: gleamActor, organizationId: gleamOrg, role: 'OWNER', acceptedAt: new Date()}});
    agent = (await gleamDb.agent.create({data: {userId: gleamActor, organizationId: gleamOrg, name: 'Synthetic agent', systemPrompt: 'Test only'}})).id;
    const users = await pool.query("INSERT INTO users(email,name,provider,email_verified) VALUES($1,'Cross owner','email',true),($2,'Cross assignee','email',true) RETURNING id", [`${suffix}@test.itemize`,`${suffix}-assignee@test.itemize`]);
    [actor,assignee] = users.rows.map(row => row.id);
    org = (await pool.query("INSERT INTO organizations(name,slug) VALUES('Cross-service Itemize',$1) RETURNING id", [suffix])).rows[0].id;
    await pool.query("INSERT INTO organization_members(organization_id,user_id,role,joined_at) VALUES($1,$2,'owner',NOW()),($1,$3,'member',NOW())", [org,actor,assignee]);
  }, 120000);
  afterAll(async () => {
    fetcher?.mockRestore();
    if (gleamDb && gleamOrg) {
      for (const model of ['itemizeHandoffDelivery','itemizeConnectionAudit','itemizePairingAttempt','itemizeConnection','bookingNotification','bookingHandoffRequest']) await gleamDb[model].deleteMany({where: {organizationId: gleamOrg}});
      await gleamDb.organization.delete({where: {id: gleamOrg}}); await gleamDb.user.delete({where: {id: gleamActor}});
    }
    if (gleamDb) await gleamDb.$disconnect(); (global as any).prisma = savedGlobalPrisma;
    if (pool && org) {await pool.query('DELETE FROM organizations WHERE id=$1', [org]); await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[actor,assignee]]);}
    if (app) await app.close(); else if (pool) await pool.end();
  });
  it('pairs through both HTTP boundaries and recovers one assigned task after response loss', async () => {
    const auth = await new JwtService().signAsync({id: actor}, {secret: process.env.JWT_SECRET, expiresIn: '5m'});
    const graphql = (query: string, variables: object) => request(app.getHttpServer()).post('/graphql')
      .set('Cookie', `itemize_auth=${auth}; csrf-token=cross-test`).set('x-csrf-token', 'cross-test').set('x-organization-id', String(org)).send({query,variables});
    const code = randomBytes(32).toString('hex'), requestId = randomUUID(), connectionId = randomUUID();
    const created = await graphql('mutation($input:CreateGleamPairingInput!,$key:String!){createGleamPairing(input:$input,idempotencyKey:$key){pairing{id state}}}',
      {input: {code, defaultAssigneeId: assignee, dueAfterMinutes: 60}, key: requestId});
    expect(created.body.errors).toBeUndefined();
    const claimed = await pairService.start(gleamOrg, gleamActor, {organizationId: gleamOrg, idempotencyKey: connectionId, code});
    expect(claimed).toMatchObject({targetOrganizationId: org, state: 'pending'});
    expect((await gleamDb.itemizeConnection.findUnique({where: {id: connectionId}})).state).toBe('PENDING');
    const approveQuery = 'mutation($id:String!,$key:String!){approveGleamPairing(id:$id,idempotencyKey:$key){pairing{state expires_at}}}';
    const approveInput = {id: requestId, key: randomUUID()};
    const approved = await graphql(approveQuery, approveInput);
    expect(approved.body.errors).toBeUndefined(); expect(approved.body.data.approveGleamPairing.pairing.state).toBe('approved');
    expect((await graphql(approveQuery, approveInput)).body.data).toEqual(approved.body.data);
    await pairService.refresh(gleamOrg, gleamActor, connectionId);
    const sid = `CA${randomUUID().replaceAll('-', '')}`;
    await gleamDb.call.create({data: {userId: gleamActor, organizationId: gleamOrg, agentId: agent, callSid: sid,
      direction: 'inbound', from: '+12025550100', to: '+12025550101'}});
    expect(await persist({organizationId: gleamOrg, agentId: agent, operationKey: `voice:${sid}`, requestedAt: 'Tomorrow'})).toBe(true);
    await worker.deliverNext();
    let delivery = await gleamDb.itemizeHandoffDelivery.findFirstOrThrow({where: {organizationId: gleamOrg}});
    expect(delivery.state).toBe('PENDING'); expect(dropped).toBe(true);
    await gleamDb.itemizeHandoffDelivery.update({where: {id: delivery.id}, data: {nextAttemptAt: new Date(0)}});
    await worker.deliverNext();
    delivery = await gleamDb.itemizeHandoffDelivery.findUniqueOrThrow({where: {id: delivery.id}});
    expect(delivery.state).toBe('APPLIED'); expect(handoffPosts).toBe(1);
    const tasks = (await pool.query('SELECT id,assigned_to,status,description FROM tasks WHERE organization_id=$1', [org])).rows;
    expect(tasks).toHaveLength(1); expect(tasks[0]).toMatchObject({assigned_to: assignee, status: 'pending'});
    expect(tasks[0].description).toContain('+12025550100'); expect(delivery.receipt.result.taskId).toBe(String(tasks[0].id));
    const callFollowUp=await getCallFollowUp(gleamOrg,delivery.callId);
    const taskLink=new URL(callFollowUp.itemizeDelivery.taskUrl);
    expect(taskLink.searchParams.get('organizationId')).toBe(String(org));
    expect(taskLink.searchParams.get('taskId')).toBe(String(tasks[0].id));
    const exactTask=await graphql('query($id:Int!){clientTasks(filter:{taskId:$id}){nodes{id contactId}}}',{id:Number(taskLink.searchParams.get('taskId'))});
    expect(exactTask.body.errors).toBeUndefined();
    expect(exactTask.body.data.clientTasks.nodes).toEqual([{id:tasks[0].id,contactId:null}]);
    const notices = async () => (await pool.query("SELECT recipient_user_id FROM user_notifications n JOIN notification_events e ON e.id=n.event_id WHERE n.organization_id=$1 AND e.event_type='gleam.follow_up_assigned'",[org])).rows;
    expect(await deliverEmail()).toBe(false); // Initial two-minute grace period.
    expect(await notificationWorker.deliverNext()).toBe(true);
    expect(notificationDropped).toBe(true);
    let alert=await gleamDb.bookingNotification.findUniqueOrThrow({where:{handoffRequestId:delivery.handoffRequestId}});
    expect(alert).toMatchObject({notificationOwner:'ITEMIZE',state:'ITEMIZE_PENDING'});
    expect(await notices()).toEqual([{recipient_user_id:assignee}]);
    await gleamDb.bookingNotification.update({where:{id:alert.id},data:{nextAttemptAt:new Date(0)}});
    expect(await notificationWorker.deliverNext()).toBe(true);
    alert=await gleamDb.bookingNotification.findUniqueOrThrow({where:{id:alert.id}});
    expect(alert.state).toBe('ITEMIZE_NOTIFIED');
    expect(await notices()).toHaveLength(1);expect(emailSends).toBe(0);
    expect(await deliverEmail()).toBe(false);
    await expect(gleamDb.bookingNotification.update({where:{id:alert.id},data:{notificationOwner:'GLEAM',state:'PENDING'}})).rejects.toThrow();
    const poll = async () => {
      await gleamDb.itemizeHandoffDelivery.update({where:{id:delivery.id},data:{nextTaskStatusCheckAt:new Date(0)}});
      expect(await statusWorker.pollNext()).toBe(true);
      return gleamDb.itemizeHandoffDelivery.findUniqueOrThrow({where:{id:delivery.id}});
    };
    const transition = async (version: number, status: string) => {
      const result = await graphql('mutation($id:Int!,$version:Int!,$status:String!,$key:String!){transitionClientTask(id:$id,expectedVersion:$version,status:$status,idempotencyKey:$key){id version status completedAt}}',
        {id:tasks[0].id,version,status,key:randomUUID()});
      expect(result.body.errors).toBeUndefined(); return result.body.data.transitionClientTask;
    };
    const pending = await poll();
    expect(pending.taskSnapshot.task).toEqual({version:1,status:'pending',completedAt:null});
    expect(pending.taskStatusError).toBeNull();
    const complete = await transition(1,'completed');
    expect(complete.version).toBe(2);
    const completed = await poll();
    expect(completed.taskSnapshot.task).toMatchObject({version:2,status:'completed'});
    expect(completed.taskSnapshot.task.completedAt).not.toBeNull();
    await transition(2,'pending');
    const reopened = await poll();
    expect(reopened.taskSnapshot.task).toEqual({version:3,status:'pending',completedAt:null});
    // An old completion, conflicting same-version state, or another task can never replace the reopening.
    for (const invalid of [completed.taskSnapshot,
      {...completed.taskSnapshot,task:{...completed.taskSnapshot.task,version:3}},
      {...reopened.taskSnapshot,taskId:String(tasks[0].id+1)}]) {
      statusOverride = invalid;
      const rejected = await poll();
      expect(rejected.taskSnapshot).toEqual(reopened.taskSnapshot);
      expect(rejected.taskStatusCheckedAt).toEqual(reopened.taskStatusCheckedAt);
      expect(rejected.taskStatusError).toBe('STATUS_UNAVAILABLE');
    }
    statusOverride = undefined; statusFailure = true;
    expect((await poll()).taskSnapshot).toEqual(reopened.taskSnapshot);
    statusFailure = false;
    expect((await poll()).taskStatusError).toBeNull(); // Duplicate version refreshes freshness safely.
    beforeStatusResponse = () => gleamDb.itemizeHandoffDelivery.update({where:{id:delivery.id},
      data:{taskStatusOwnerToken:randomUUID()}}).then(() => undefined);
    const beforeFence = await gleamDb.itemizeHandoffDelivery.findUniqueOrThrow({where:{id:delivery.id}});
    const fenced = await poll();
    expect(fenced.taskStatusCheckedAt).toEqual(beforeFence.taskStatusCheckedAt);
    expect(fenced.taskSnapshot).toEqual(beforeFence.taskSnapshot);
    await gleamDb.organizationMember.updateMany({where:{organizationId:gleamOrg,userId:gleamActor},data:{role:'MEMBER'}});
    expect((await poll()).taskStatusError).toBe('STATUS_UNAVAILABLE');
    await gleamDb.organizationMember.updateMany({where:{organizationId:gleamOrg,userId:gleamActor},data:{role:'OWNER'}});
    beforeStatusResponse = () => gleamDb.itemizeConnection.update({where:{id:connectionId},data:{state:'REVOKED'}}).then(() => undefined);
    const disconnected = await poll();
    expect(disconnected.taskStatusError).toBe('STATUS_UNAVAILABLE');
    expect(disconnected.taskSnapshot).toEqual(reopened.taskSnapshot);
    // Restore only this synthetic fixture, then prove the remote revocation boundary too.
    await gleamDb.itemizeConnection.update({where:{id:connectionId},data:{state:'ACTIVE'}});
    await pool.query("UPDATE gleam_connections SET state='revoked' WHERE id=$1",[connectionId]);
    expect((await poll()).taskStatusError).toBe('STATUS_UNAVAILABLE');
    await pool.query("UPDATE gleam_connections SET state='active' WHERE id=$1",[connectionId]);
    await pool.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",[org,actor]);
    expect((await poll()).taskStatusError).toBe('STATUS_UNAVAILABLE');
    await pool.query("UPDATE organization_members SET role='owner' WHERE organization_id=$1 AND user_id=$2",[org,actor]);
    await pool.query('DELETE FROM tasks WHERE id=$1',[tasks[0].id]);
    const removed = await poll();
    expect(removed.taskSnapshot.task).toBeNull(); expect(removed.taskStatusError).toBeNull();
    statusOverride = reopened.taskSnapshot;
    const late = await poll();
    expect(late.taskSnapshot.task).toBeNull(); expect(late.taskStatusError).toBe('STATUS_UNAVAILABLE');
    expect((await pool.query('SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id=$1',[org])).rows[0].count).toBe(0);
    statusOverride = undefined;
    const extraHandoff=async()=>{
      const extraSid=`CA${randomUUID().replaceAll('-','')}`;
      await gleamDb.call.create({data:{userId:gleamActor,organizationId:gleamOrg,agentId:agent,callSid:extraSid,direction:'inbound',from:'+12025550100',to:'+12025550101'}});
      expect(await persist({organizationId:gleamOrg,agentId:agent,operationKey:`voice:${extraSid}`})).toBe(true);
      const handoff=await gleamDb.bookingHandoffRequest.findUniqueOrThrow({where:{organizationId_agentId_operationKey:{organizationId:gleamOrg,agentId:agent,operationKey:`voice:${extraSid}`}}});
      const notice=await gleamDb.bookingNotification.findUniqueOrThrow({where:{handoffRequestId:handoff.id}});
      await gleamDb.bookingNotification.update({where:{id:notice.id},data:{nextAttemptAt:new Date(0)}});
      return notice;
    };
    // Gleam fallback wins before a late task delivery: one email, no second assignment alert.
    const fallback=await extraHandoff();
    expect(await deliverEmail()).toBe(true);expect(emailSends).toBe(1);
    await worker.deliverNext();await notificationWorker.deliverNext();
    expect((await gleamDb.bookingNotification.findUniqueOrThrow({where:{id:fallback.id}}))).toMatchObject({notificationOwner:'GLEAM',state:'SENT'});
    expect(await notices()).toHaveLength(1);
    // Both workers race for an applied handoff. The notification row lock selects exactly one owner.
    const racing=await extraHandoff();await worker.deliverNext();
    const beforeCount=(await notices()).length+emailSends;
    await Promise.all([deliverEmail(),notificationWorker.deliverNext()]);
    const raceResult=await gleamDb.bookingNotification.findUniqueOrThrow({where:{id:racing.id}});
    expect(['SENT','ITEMIZE_NOTIFIED']).toContain(raceResult.state);
    expect((await notices()).length+emailSends).toBe(beforeCount+1);
  });
});
