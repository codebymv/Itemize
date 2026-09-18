import { Pool } from 'pg';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { GleamPairingService } from '../../src/gleam-integration/gleam-pairing.service';
const {getTestDatabasePoolConfig} = require('../../../db/test-support/test-database-config');
const {runGleamPairingMigration} = require('../../../db/src/db_gleam_pairing_migrations');
const {runGleamHandoffReceiverMigration} = require('../../../db/src/db_gleam_handoff_receiver_migrations');
const keys = generateKeyPairSync('rsa', {modulusLength: 2048});
const publicKey = keys.publicKey.export({type: 'spki', format: 'pem'}).toString();
const privateKey = keys.privateKey.export({type: 'pkcs8', format: 'pem'}).toString();
let pool: Pool, app: NestExpressApplication, service: GleamPairingService;
let org: number, actor: number, member: number, id: string, connection: string, code: string;
let fetcher: jest.SpyInstance;
const proof = 'a'.repeat(64);
const input = () => ({code, defaultAssigneeId: member, dueAfterMinutes: 1440});
const claim = () => service.claim(code, {connectionId: connection, proof});
const token = async (scope: string) => new JwtService().signAsync({
  iss: 'urn:gleam:client-work:v1', aud: 'urn:itemize:client-work:v1', sub: 'synthetic-gleam', connectionId: connection,
  generation: 1, scope, jti: randomUUID(),
}, {privateKey, algorithm: 'RS256', keyid: 'synthetic-key', expiresIn: '5m'});
beforeAll(async () => {
  process.env.GLEAM_PAIRING_ENABLED = 'true'; process.env.GLEAM_API_ORIGIN = 'https://gleam.test';
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEYS = JSON.stringify({test: randomBytes(32).toString('hex')});
  process.env.CALENDAR_TOKEN_ACTIVE_KEY_ID = 'test';
  pool = new Pool(getTestDatabasePoolConfig(process.env));
  await runGleamHandoffReceiverMigration(pool); await runGleamPairingMigration(pool);
  const module = await Test.createTestingModule({imports: [AppModule]}).overrideProvider(PG_POOL).useValue(pool).compile();
  app = module.createNestApplication<NestExpressApplication>({bodyParser: false, logger: false}); configureApp(app); await app.init();
  service = app.get(GleamPairingService);
});
beforeEach(async () => {
  id = randomUUID(); connection = randomUUID(); code = randomBytes(32).toString('hex');
  const users = await pool.query("INSERT INTO users(email,name,provider,email_verified) VALUES($1,'Pairing owner','email',true),($2,'Pairing assignee','email',true) RETURNING id", [`${id}@test.itemize`,`${id}-member@test.itemize`]);
  [actor,member] = users.rows.map(row => row.id);
  org = (await pool.query("INSERT INTO organizations(name,slug) VALUES('Synthetic Itemize',$1) RETURNING id", [id])).rows[0].id;
  process.env.GLEAM_ALLOWED_ORGANIZATION_IDS = String(org);
  await pool.query("INSERT INTO organization_members(organization_id,user_id,role,joined_at) VALUES($1,$2,'owner',NOW()),($1,$3,'member',NOW())", [org,actor,member]);
  fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => new Response(JSON.stringify({schemaVersion: 1,
    nonce: JSON.parse(options!.body as string).nonce, connectionId: connection, generation: 1, sourceOrganizationId: 'synthetic-gleam',
    pairingCodeHash: createHash('sha256').update(code).digest('hex'),
    sourceOrganizationName: 'Synthetic Gleam', keyId: 'synthetic-key', publicKey, sourceApprovedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+600000).toISOString(),
  }), {status: 200}));
});
afterEach(async () => {
  fetcher.mockRestore();
  await pool.query('DELETE FROM organizations WHERE id=$1', [org]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[actor,member]]);
});
afterAll(async () => {if (app) await app.close(); else if (pool) await pool.end();});

it('denies new pairing and pending-code claims after exclusion without peer I/O', async () => {
  await service.start(org, actor, input(), id);
  process.env.GLEAM_ALLOWED_ORGANIZATION_IDS = '';
  await expect(service.start(org, actor, input(), randomUUID())).rejects.toThrow('not enabled');
  await expect(claim()).rejects.toThrow('not enabled');
  expect(fetcher).not.toHaveBeenCalled();
  await expect(service.status(org, actor)).resolves.toMatchObject({enabled:false});
});

it('requires browser CSRF and current manager authority to create a pairing code', async () => {
  const auth = await new JwtService().signAsync({id: actor}, {secret: process.env.JWT_SECRET, expiresIn: '5m'});
  const send = (csrf: boolean) => {
    const call = request(app.getHttpServer()).post('/graphql').set('Cookie', `itemize_auth=${auth}; csrf-token=pairing-csrf`).set('x-organization-id', String(org));
    if (csrf) call.set('x-csrf-token', 'pairing-csrf');
    return call.send({query: 'mutation($input:CreateGleamPairingInput!,$key:String!){createGleamPairing(input:$input,idempotencyKey:$key){organizationId pairing{id}}}', variables: {input: input(), key: id}});
  };
  expect((await send(false)).body.errors).toBeDefined();
  const result = await send(true); expect(result.body.errors).toBeUndefined(); expect(result.body.data.createGleamPairing.organizationId).toBe(org);
  await expect(service.start(org, member, input(), randomUUID())).rejects.toThrow();
});
it('claims once, keeps capabilities encrypted, and requires final approval before handoff authorization', async () => {
  await service.start(org, actor, input(), id);
  const [first, second] = await Promise.all([claim(), claim()]); expect(second).toEqual(first); expect(first.state).toBe('pending');
  const stored = (await pool.query('SELECT * FROM gleam_pairing_requests WHERE id=$1', [id])).rows[0];
  expect(stored.encrypted_proof).not.toContain(proof); expect(stored.code_hash).not.toBe(code);
  const status = await request(app.getHttpServer()).get('/api/integrations/gleam/connection').set('Authorization', `Bearer ${await token('connection:read')}`);
  expect(status.status).toBe(200); expect(status.body.state).toBe('pending');
  const blocked = await request(app.getHttpServer()).post('/api/integrations/gleam/handoffs').set('Authorization', `Bearer ${await token('handoffs:write')}`).send({});
  expect(blocked.status).toBe(401);
  const key = randomUUID(); await service.approve(org, actor, id, key); await service.approve(org, actor, id, key);
  expect((await pool.query('SELECT state FROM gleam_connections WHERE id=$1', [connection])).rows[0].state).toBe('active');
  expect((await service.status(org, actor)).pairing.connection_state).toBe('active');
  expect((await pool.query("SELECT COUNT(*)::int AS count FROM gleam_connection_audit WHERE connection_id=$1 AND action='CONNECTION_APPROVED'", [connection])).rows[0].count).toBe(1);
  expect((await pool.query('SELECT encrypted_proof FROM gleam_pairing_requests WHERE id=$1', [id])).rows[0].encrypted_proof).toBeNull();
  expect(JSON.stringify(await service.status(org, actor))).not.toMatch(/encrypted_proof|code_hash|PRIVATE KEY/);
});
it('reports tenant-scoped receiver-confirmed delivery activity', async () => {
  await service.start(org, actor, input(), id); await claim(); await service.approve(org, actor, id, randomUUID());
  const contact = (await pool.query("INSERT INTO contacts(organization_id,first_name,last_name) VALUES($1,'Recent','Caller') RETURNING id", [org])).rows[0].id;
  const task = (await pool.query("INSERT INTO tasks(organization_id,contact_id,assigned_to,title,status) VALUES($1,$2,$3,'Qualified follow-up','pending') RETURNING id", [org,contact,member])).rows[0].id;
  const activity = (await pool.query("INSERT INTO contact_activities(contact_id,user_id,type,title,content,metadata) VALUES($1,NULL,'call','Gleam call follow-up','{}'::jsonb,'{}'::jsonb) RETURNING id", [contact])).rows[0].id;
  const eventId = randomUUID(), handoffId = randomUUID();
  await pool.query(`INSERT INTO gleam_handoff_sources(connection_id,handoff_id,source_fingerprint,call_id,task_id,contact_id,activity_id)
    VALUES($1,$2,$3,'call-recent',$4,$5,$6)`, [connection,handoffId,'f'.repeat(64),task,contact,activity]);
  await pool.query(`INSERT INTO gleam_handoff_inbox(connection_id,generation,event_id,fingerprint,receipt,applied_at)
    VALUES($1,1,$2,$3,$4::jsonb,NOW()-INTERVAL '2 minutes')`, [connection,eventId,'e'.repeat(64),JSON.stringify({result:{handoffId}})]);
  const overview = await service.status(org, actor);
  expect(Number.isNaN(Date.parse(overview.deliveryActivity.checkedAt))).toBe(false);
  expect(overview.deliveryActivity.lastDeliveryAt).toBe(overview.deliveryActivity.recentDeliveries[0].appliedAt);
  expect(overview.deliveryActivity.recentDeliveries).toEqual([expect.objectContaining({
    id:eventId,callId:'call-recent',callOutcome:'Recent Caller · Qualified follow-up',assignedTo:'Pairing assignee',
    created:'Task + call summary',taskUrl:`/contacts?view=follow-ups&taskId=${task}&organizationId=${org}`,
  })]);
});
it('does not contact Gleam for an invalid/expired code', async () => {
  await expect(service.claim(code, {connectionId: connection, proof})).rejects.toThrow();
  await service.start(org, actor, input(), id); await pool.query("UPDATE gleam_pairing_requests SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [id]);
  await expect(claim()).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it('rejects wrong peer nonces and does not pin a browser-supplied key', async () => {
  await service.start(org, actor, input(), id);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({nonce: randomUUID()}), {status: 200}));
  await expect(claim()).rejects.toThrow();
  expect((await pool.query('SELECT COUNT(*)::int AS count FROM gleam_connections WHERE organization_id=$1', [org])).rows[0].count).toBe(0);
});
it('rejects a valid source proof bound to another pairing code', async () => {
  await service.start(org, actor, input(), id);
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementationOnce(async (url, options) => {
    const response = await original(url, options);
    return new Response(JSON.stringify({...await response.json(), pairingCodeHash: '0'.repeat(64)}), {status: 200});
  });
  await expect(claim()).rejects.toThrow();
  expect((await pool.query('SELECT COUNT(*)::int AS count FROM gleam_connections WHERE organization_id=$1', [org])).rows[0].count).toBe(0);
});
it('rechecks source approval before final activation and refuses reassignment to an ineligible user', async () => {
  await service.start(org, actor, input(), id); await claim();
  fetcher.mockRejectedValueOnce(new Error('source approval revoked'));
  await expect(service.approve(org, actor, id, randomUUID())).rejects.toThrow();
  await pool.query("UPDATE organization_members SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [org,member]);
  await expect(service.approve(org, actor, id, randomUUID())).rejects.toThrow();
  expect((await pool.query('SELECT state FROM gleam_connections WHERE id=$1', [connection])).rows[0].state).toBe('pending');
});
it('revokes access immediately, preserves audit, and rejects conflicting replay keys', async () => {
  await service.start(org, actor, input(), id); await claim();
  const key = randomUUID(); await service.approve(org, actor, id, key);
  process.env.GLEAM_ALLOWED_ORGANIZATION_IDS = '';
  await expect(service.disconnect(org, actor, connection, key)).rejects.toThrow('different change');
  const revoke = randomUUID(); await service.disconnect(org, actor, connection, revoke); await service.disconnect(org, actor, connection, revoke);
  const response = await request(app.getHttpServer()).get('/api/integrations/gleam/connection').set('Authorization', `Bearer ${await token('connection:read')}`);
  expect(response.status).toBe(401);
  expect((await pool.query("SELECT COUNT(*)::int AS count FROM gleam_connection_audit WHERE connection_id=$1 AND action='CONNECTION_REVOKED'", [connection])).rows[0].count).toBe(1);
});
it('will not confirm a receiver whose approving manager has lost authority', async () => {
  await service.start(org, actor, input(), id); await claim();
  await pool.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2", [org,actor]);
  const response = await request(app.getHttpServer()).get('/api/integrations/gleam/connection').set('Authorization', `Bearer ${await token('connection:read')}`);
  expect(response.status).toBe(403); expect(response.body.error.code).toBe('APPROVAL_REQUIRED');
});
