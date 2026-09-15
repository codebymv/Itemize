import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { ClientTasksService } from '../../src/client-tasks/client-tasks.service';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
const { getTestDatabasePoolConfig } = require('../../../db/test-support/test-database-config');
const { runClientTaskLifecycleMigration } = require('../../../db/src/db_client_task_migrations');
describe('Client task lifecycle PostgreSQL contract', () => {
    let pool: Pool, service: ClientTasksService;
    let app: NestExpressApplication;
    let org: number, otherOrg: number, owner: number, member: number, member2: number, viewer: number, invitee: number, outsider: number, contact: number, foreignContact: number;
    beforeAll(async () => {
        pool = new Pool(getTestDatabasePoolConfig(process.env));
        service = new ClientTasksService(pool);
        await runClientTaskLifecycleMigration(pool);
        await runClientTaskLifecycleMigration(pool);
        const suffix = randomUUID();
        const users = await pool.query<{
            id: number;
        }>(`INSERT INTO users(email,name,provider,email_verified) SELECT $1 || n || '@test.itemize','Task user '||n,'email',true FROM generate_series(1,6) n RETURNING id`, [suffix]);
        [owner, member, member2, viewer, invitee, outsider] = users.rows.map(r => r.id);
        const orgs = await pool.query<{
            id: number;
        }>(`INSERT INTO organizations(name,slug) VALUES('Tasks',$1),('Other tasks',$2) RETURNING id`, [suffix, `${suffix}-other`]);
        [org, otherOrg] = orgs.rows.map(r => r.id);
        await pool.query(`INSERT INTO organization_members(organization_id,user_id,role,joined_at) VALUES($1,$2,'owner',NOW()),($1,$3,'member',NOW()),($1,$4,'member',NOW()),($1,$5,'viewer',NOW()),($1,$6,'member',NULL),($7,$8,'owner',NOW())`, [org, owner, member, member2, viewer, invitee, otherOrg, outsider]);
        const contacts = await pool.query<{
            id: number;
        }>(`INSERT INTO contacts(organization_id,first_name) VALUES($1,'Task client'),($2,'Foreign client') RETURNING id`, [org, otherOrg]);
        [contact, foreignContact] = contacts.rows.map(r => r.id);
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PG_POOL).useValue(pool).compile();
        app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
        configureApp(app);
        await app.init();
    });
    afterAll(async () => {
        if (pool) {
            await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [[org, otherOrg].filter(Boolean)]);
            await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[owner, member, member2, viewer, invitee, outsider].filter(Boolean)]);
            if (app)
                await app.close();
            else
                await pool.end();
        }
    });
    const create = (assignedToId: number | null = member) => service.create(org, owner, { title: 'Return client call', contactId: contact, assignedToId }, randomUUID());
    it('opens an exact unlinked task beyond the first page without crossing organizations',async()=>{
        const target=await service.create(org,owner,{title:'Exact unknown caller follow-up',assignedToId:member},randomUUID());
        await pool.query("INSERT INTO tasks(organization_id,title,status) SELECT $1,'More recent follow-up '||n,'pending' FROM generate_series(1,25) n",[org]);
        const page=await service.list(org,owner,{taskId:target.id},{page:1,pageSize:20});
        expect(page.nodes.map(task=>task.id)).toEqual([target.id]);expect(page.nodes[0].contactId).toBeNull();
        expect(page.pageInfo.total).toBe(1);
        expect((await service.list(otherOrg,outsider,{taskId:target.id},{page:1,pageSize:20})).nodes).toEqual([]);
        await service.transition(org,owner,target.id,target.version,'completed',randomUUID());
        expect((await service.list(org,owner,{taskId:target.id},{page:1,pageSize:20})).nodes[0].status).toBe('completed');
        await pool.query('DELETE FROM tasks WHERE id=$1',[target.id]);
        expect((await service.list(org,owner,{taskId:target.id},{page:1,pageSize:20})).nodes).toEqual([]);
        await pool.query("DELETE FROM tasks WHERE organization_id=$1 AND title LIKE 'More recent follow-up %'",[org]);
    });
    it('serves the browser GraphQL workflow with CSRF and paid-plan enforcement', async () => {
        const token = await new JwtService().signAsync({ id: owner }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
        const send = (query: string, variables: Record<string, unknown> = {}, csrf = true) => {
            const call = request(app.getHttpServer()).post('/graphql').set('Cookie', `itemize_auth=${token}; csrf-token=task-test-csrf`).set('x-organization-id', String(org));
            if (csrf)
                call.set('x-csrf-token', 'task-test-csrf');
            return call.send({ query, variables });
        };
        const mutation = 'mutation($input:CreateClientTaskInput!,$key:String!){createClientTask(input:$input,idempotencyKey:$key){id title version canEdit}}';
        const variables = { input: { title: 'GraphQL follow-up', contactId: contact, assignedToId: owner }, key: randomUUID() };
        const noCsrf = await send(mutation, variables, false);
        expect(noCsrf.body.errors?.length).toBeGreaterThan(0);
        const created = await send(mutation, variables);
        expect(created.body.errors).toBeUndefined();
        expect(created.body.data.createClientTask).toMatchObject({ title: 'GraphQL follow-up', version: 1, canEdit: true });
        const replay = await send(mutation, variables);
        expect(replay.body.data).toEqual(created.body.data);
        const listed = await send('{clientTasks{nodes{id title} canCreate viewerId assignees{id name} pageInfo{total}}}');
        expect(listed.body.errors).toBeUndefined();
        expect(listed.body.data.clientTasks.canCreate).toBe(true);
        const done = await send('mutation($id:Int!,$key:String!){transitionClientTask(id:$id,expectedVersion:1,status:"completed",idempotencyKey:$key){status completedAt version}}', { id: created.body.data.createClientTask.id, key: randomUUID() });
        expect(done.body.errors).toBeUndefined();
        expect(done.body.data.transitionClientTask).toMatchObject({ status: 'completed', version: 2 });
        await pool.query("UPDATE organizations SET subscription_status='canceled',trial_ends_at=NULL WHERE id=$1", [org]);
        try {
            const blocked = await send(mutation, { ...variables, key: randomUUID() });
            expect(blocked.body.errors?.length).toBeGreaterThan(0);
        }
        finally {
            await pool.query("UPDATE organizations SET subscription_status='active' WHERE id=$1", [org]);
        }
    });
    it('serializes concurrent duplicate creates and records one audit entry', async () => {
        const key = randomUUID(), input = { title: 'One task', contactId: contact, assignedToId: member };
        const results = await Promise.all([service.create(org, owner, input, key), service.create(org, owner, input, key)]);
        expect(results[0].id).toBe(results[1].id);
        expect((await pool.query('SELECT id FROM client_task_audit WHERE task_id=$1', [results[0].id])).rowCount).toBe(1);
        await expect(service.create(org, owner, { ...input, title: 'Changed' }, key)).rejects.toMatchObject({ extensions: { code: 'CONFLICT' } });
    });
    it('completes and reopens with versions, completion time and replay after response loss', async () => {
        const task = await create(), key = randomUUID();
        const done = await service.transition(org, member, task.id, task.version, 'completed', key);
        expect(done.version).toBe(2);
        expect(done.completedAt).not.toBeNull();
        expect(await service.transition(org, member, task.id, task.version, 'completed', key)).toEqual(done);
        const reopened = await service.transition(org, member, task.id, done.version, 'pending', randomUUID());
        expect(reopened.version).toBe(3);
        expect(reopened.completedAt).toBeNull();
        expect((await pool.query('SELECT action FROM client_task_audit WHERE task_id=$1 ORDER BY id', [task.id])).rows.map(r => r.action)).toEqual(['created', 'completed', 'reopened']);
        await expect(service.update(org, member, task.id, task.version, { title: 'Stale edit' }, randomUUID())).rejects.toMatchObject({ extensions: { code: 'CONFLICT' } });
    });
    it('allows only one competing claimant', async () => {
        const task = await create(null);
        const claims = await Promise.allSettled([member, member2].map(actor => service.update(org, actor, task.id, task.version, { assignedToId: actor }, randomUUID())));
        expect(claims.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(claims.filter(r => r.status === 'rejected')).toHaveLength(1);
    });
    it('scopes clients and tasks to the organization', async () => {
        await expect(service.create(org, owner, { title: 'Bad link', contactId: foreignContact }, randomUUID())).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
        const task = await create();
        await expect(service.transition(otherOrg, outsider, task.id, 1, 'completed', randomUUID())).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    });
    it('rejects viewers, invitees, other assignees and cross-organization membership', async () => {
        for (const actor of [viewer, invitee, outsider])
            await expect(service.create(org, actor, { title: 'No access' }, randomUUID())).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
        for (const assignee of [viewer, invitee, outsider])
            await expect(create(assignee)).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
        const task = await create();
        await expect(service.transition(org, member2, task.id, 1, 'completed', randomUUID())).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
        await expect(service.update(org, member, task.id, 1, { assignedToId: member2 }, randomUUID())).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
        expect((await service.list(org, viewer)).canCreate).toBe(false);
        await expect(service.list(org, invitee)).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });
    it('rejects a role revoked while a mutation is waiting for its membership lock', async () => {
        const task = await create(member2), client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("UPDATE organization_members SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [org, member2]);
            const result = service.transition(org, member2, task.id, task.version, 'completed', randomUUID()).then(() => null, error => error);
            await client.query('COMMIT');
            expect(await result).toMatchObject({ extensions: { code: 'FORBIDDEN' } });
        }
        finally {
            client.release();
            await pool.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2", [org, member2]);
        }
    });
    it('rolls back a task when audit persistence fails', async () => {
        const before = await pool.query('SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id=$1', [org]);
        await pool.query(`CREATE OR REPLACE FUNCTION task_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER task_test_audit_failure BEFORE INSERT ON client_task_audit FOR EACH ROW WHEN (NEW.organization_id=${org}) EXECUTE FUNCTION task_test_reject_audit()`);
        try {
            await expect(create()).rejects.toThrow('synthetic audit failure');
        }
        finally {
            await pool.query('DROP TRIGGER task_test_audit_failure ON client_task_audit; DROP FUNCTION task_test_reject_audit()');
        }
        expect((await pool.query('SELECT COUNT(*)::int AS count FROM tasks WHERE organization_id=$1', [org])).rows).toEqual(before.rows);
    });
    it('supports overdue, mine and unlinked views with deterministic pagination', async () => {
        const task = await service.create(org, owner, { title: 'Unknown caller', assignedToId: member, dueAt: '2020-01-01T00:00:00.000Z' }, randomUUID());
        expect((await service.list(org, member, { view: 'overdue' })).nodes.some(t => t.id === task.id)).toBe(true);
        expect((await service.list(org, member, { view: 'unlinked' })).nodes.some(t => t.id === task.id)).toBe(true);
        const list = await service.list(org, member, { view: 'mine' }, { page: 1, pageSize: 1 });
        expect(list.nodes).toHaveLength(1);
        expect(list.pageInfo.hasNextPage).toBe(true);
    });
    it('rejects malformed input before persistence and terminal-to-terminal changes', async () => {
        await expect(service.create(org, owner, { title: '   ' }, randomUUID())).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
        await expect(service.create(org, owner, { title: 'Invalid date', dueAt: 'tomorrow' }, randomUUID())).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
        const task = await create(), done = await service.transition(org, owner, task.id, 1, 'completed', randomUUID());
        await expect(service.transition(org, owner, task.id, done.version, 'cancelled', randomUUID())).rejects.toMatchObject({ extensions: { code: 'CONFLICT' } });
    });
});
