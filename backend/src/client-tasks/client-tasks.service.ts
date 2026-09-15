import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { PG_POOL } from '../database/database.module';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { ClientTask, ClientTaskFilterInput, ClientTaskPage, CreateClientTaskInput, UpdateClientTaskInput } from './client-task.types';
const idSchema = z.number().int().positive().max(2147483647);
const statusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
const fields = {
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).nullable(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    dueAt: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()).nullable(),
    assignedToId: idSchema.nullable(),
};
const createSchema = z.object({
    ...fields, contactId: idSchema.nullable().optional().default(null),
    description: fields.description.optional().default(null),
    priority: fields.priority.optional().default('medium'),
    dueAt: fields.dueAt.optional().default(null),
    assignedToId: fields.assignedToId.optional().default(null),
}).strict();
const updateSchema = z.object(fields).partial().strict().refine(value => Object.keys(value).length > 0);
const keySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const manager = (role: string) => role === 'owner' || role === 'admin';
const writer = (role: string) => manager(role) || role === 'member';
const fail = (message: string, code: Parameters<typeof itemizeGraphqlError>[1] = 'BAD_USER_INPUT'): never => { throw itemizeGraphqlError(message, code); };
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
    const result = schema.safeParse(input);
    return result.success ? result.data : fail('Invalid task input');
};
const canonical = (value: unknown): unknown => {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
};
type Row = {
    id: number;
    contact_id: number | null;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    assigned_to: number | null;
    assigned_to_name?: string | null;
    due_date: Date | null;
    completed_at: Date | null;
    updated_at: Date;
    version: number;
};
@Injectable()
export class ClientTasksService {
    constructor(
    @Inject(PG_POOL)
    private readonly pool: Pool) { }
    async list(org: number, actor: number, filter: ClientTaskFilterInput = {}, page: PageInput = new PageInput()): Promise<ClientTaskPage> {
        const checked = parse(z.object({
            contactId: idSchema.optional(), view: z.enum(['all', 'mine', 'unassigned', 'overdue', 'unlinked']).optional(),
            status: statusSchema.optional(), taskId:idSchema.optional(),
        }).strict(), filter);
        const paging = parse(z.object({ page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100) }), page);
        return this.transaction(async (client) => {
            const role = await this.membership(client, org, actor);
            const values: unknown[] = [org];
            let where = 't.organization_id=$1';
            if (checked.taskId) where += ` AND t.id=$${values.push(checked.taskId)}`;
            if (checked.contactId) {
                await this.contact(client, org, checked.contactId);
                where += ` AND t.contact_id=$${values.push(checked.contactId)}`;
            }
            if (checked.status)
                where += ` AND t.status=$${values.push(checked.status)}`;
            if (checked.view === 'mine')
                where += ` AND t.assigned_to=$${values.push(actor)}`;
            if (checked.view === 'unassigned')
                where += ` AND (t.assigned_to IS NULL OR NOT EXISTS (SELECT 1 FROM organization_members am WHERE am.organization_id=t.organization_id AND am.user_id=t.assigned_to AND am.joined_at IS NOT NULL AND am.role IN ('owner','admin','member')))`;
            if (checked.view === 'overdue')
                where += ` AND t.due_date<NOW() AND t.status IN ('pending','in_progress')`;
            if (checked.view === 'unlinked')
                where += ' AND t.contact_id IS NULL';
            const total = await client.query<{
                total: number;
            }>(`SELECT COUNT(*)::int AS total FROM tasks t WHERE ${where}`, values);
            const rows = await client.query<Row>(`SELECT t.*, u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE ${where}
        ORDER BY t.due_date ASC NULLS LAST,t.id ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, paging.pageSize, (paging.page - 1) * paging.pageSize]);
            const assignees = await client.query<{
                id: number;
                name: string;
            }>(`SELECT u.id,COALESCE(u.name,u.email) AS name FROM organization_members m JOIN users u ON u.id=m.user_id
        WHERE m.organization_id=$1 AND m.joined_at IS NOT NULL AND m.role IN ('owner','admin','member')
        AND ($2::boolean OR m.user_id=$3) ORDER BY name,u.id`, [org, manager(role), actor]);
            return { nodes: rows.rows.map(row => this.map(row, role, actor)), pageInfo: pageInfo(paging.page, paging.pageSize, total.rows[0].total),
                canCreate: writer(role), canManage: manager(role), viewerId: actor, assignees: assignees.rows };
        });
    }
    async create(org: number, actor: number, input: CreateClientTaskInput, key: string): Promise<ClientTask> {
        const data = parse(createSchema, input);
        return this.mutate(org, actor, key, { operation: 'create', data }, data.assignedToId, async (client, role) => {
            if (!manager(role) && data.assignedToId !== null && data.assignedToId !== actor)
                fail('Members may create tasks for themselves or leave them unassigned', 'FORBIDDEN');
            if (data.contactId !== null)
                await this.contact(client, org, data.contactId);
            const result = await client.query<Row>(`INSERT INTO tasks(organization_id,contact_id,created_by,title,description,priority,due_date,assigned_to,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`, [org, data.contactId, actor, data.title, data.description, data.priority, data.dueAt, data.assignedToId]);
            await this.audit(client, org, actor, 'created', null, result.rows[0]);
            return result.rows[0];
        });
    }
    async update(org: number, actor: number, id: number, expectedVersion: number, input: UpdateClientTaskInput, key: string): Promise<ClientTask> {
        const data = parse(updateSchema, input);
        parse(idSchema, id);
        parse(idSchema, expectedVersion);
        return this.mutate(org, actor, key, { operation: 'update', id, expectedVersion, data }, data.assignedToId, async (client, role) => {
            const before = await this.lockTask(client, org, id, expectedVersion);
            const isClaim = before.assigned_to === null && data.assignedToId === actor && Object.keys(data).length === 1;
            if (!manager(role) && !isClaim && before.assigned_to !== actor)
                fail('Only the assignee or a manager can edit this task', 'FORBIDDEN');
            if (!manager(role) && data.assignedToId !== undefined && data.assignedToId !== actor)
                fail('Only managers can reassign tasks', 'FORBIDDEN');
            const columns: Record<string, string> = { title: 'title', description: 'description', priority: 'priority', dueAt: 'due_date', assignedToId: 'assigned_to' };
            const values: unknown[] = [org, id];
            const sets = Object.entries(data).map(([name, value]) => `${columns[name]}=$${values.push(value)}`);
            const updated = await client.query<Row>(`UPDATE tasks SET ${sets.join(',')},version=version+1,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`, values);
            await this.audit(client, org, actor, isClaim ? 'claimed' : 'updated', before, updated.rows[0]);
            return updated.rows[0];
        });
    }
    async transition(org: number, actor: number, id: number, expectedVersion: number, status: string, key: string): Promise<ClientTask> {
        parse(idSchema, id);
        parse(idSchema, expectedVersion);
        parse(statusSchema, status);
        return this.mutate(org, actor, key, { operation: 'transition', id, expectedVersion, status }, undefined, async (client, role) => {
            const before = await this.lockTask(client, org, id, expectedVersion);
            if (!manager(role) && before.assigned_to !== actor)
                fail('Only the assignee or a manager can change this task', 'FORBIDDEN');
            if (before.status === status)
                return before;
            const terminal = before.status === 'completed' || before.status === 'cancelled';
            if (terminal && status !== 'pending')
                fail('Reopen a finished task before changing its state', 'CONFLICT');
            const result = await client.query<Row>(`UPDATE tasks SET status=$3::varchar,completed_at=CASE WHEN $3::varchar='completed' THEN NOW() ELSE NULL END,
        version=version+1,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`, [org, id, status]);
            await this.audit(client, org, actor, terminal ? 'reopened' : status, before, result.rows[0]);
            return result.rows[0];
        });
    }
    private async mutate(org: number, actor: number, key: string, payload: unknown, assignee: number | null | undefined, action: (client: PoolClient, role: string) => Promise<Row>): Promise<ClientTask> {
        parse(keySchema, key);
        const fingerprint = createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
        return this.transaction(async (client) => {
            // Serialize a replay key before evaluating optimistic versions.
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`client-task:${org}:${actor}:${key}`]);
            const role = await this.membership(client, org, actor, assignee);
            if (!writer(role))
                fail('Task changes require an accepted member or manager', 'FORBIDDEN');
            const receipt = await client.query<{
                fingerprint: string;
                result: ClientTask;
            }>(`SELECT fingerprint,result FROM client_task_mutation_receipts WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3`, [org, actor, key]);
            if (receipt.rows[0]) {
                if (receipt.rows[0].fingerprint !== fingerprint)
                    fail('This retry key was used for a different task change', 'CONFLICT');
                // Permission flags are transient, not trusted from a past role.
                const saved = receipt.rows[0].result;
                return { ...saved, canEdit: manager(role) || saved.assignedToId === actor, canClaim: saved.assignedToId === null };
            }
            const row = await action(client, role);
            const named = row.assigned_to === null ? null : (await client.query<{
                name: string;
            }>('SELECT name FROM users WHERE id=$1', [row.assigned_to])).rows[0]?.name ?? null;
            const result = this.map({ ...row, assigned_to_name: named }, role, actor);
            await client.query(`INSERT INTO client_task_mutation_receipts(organization_id,actor_id,idempotency_key,fingerprint,result) VALUES($1,$2,$3,$4,$5::jsonb)`, [org, actor, key, fingerprint, JSON.stringify(result)]);
            return result;
        });
    }
    private async membership(client: PoolClient, org: number, actor: number, assignee?: number | null): Promise<string> {
        const ids = [...new Set([actor, ...(assignee ? [assignee] : [])])].sort((a, b) => a - b);
        const rows = await client.query<{
            user_id: number;
            role: string;
            joined_at: Date | null;
        }>(`SELECT user_id,role,joined_at FROM organization_members
      WHERE organization_id=$1 AND user_id=ANY($2::int[]) ORDER BY user_id FOR SHARE`, [org, ids]);
        const user = rows.rows.find(row => row.user_id === actor);
        if (!user?.joined_at || !['owner', 'admin', 'member', 'viewer'].includes(user.role))
            fail('Accepted organization membership required', 'FORBIDDEN');
        if (assignee && !rows.rows.some(row => row.user_id === assignee && row.joined_at && writer(row.role)))
            fail('Assignee must be an accepted non-viewer member', 'BAD_USER_INPUT');
        return user!.role;
    }
    private async contact(client: PoolClient, org: number, id: number): Promise<void> {
        const result = await client.query('SELECT id FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE', [org, id]);
        if (!result.rowCount)
            fail('Client not found', 'NOT_FOUND');
    }
    private async lockTask(client: PoolClient, org: number, id: number, version: number): Promise<Row> {
        const result = await client.query<Row>('SELECT * FROM tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE', [org, id]);
        const row = result.rows[0];
        if (!row)
            fail('Task not found', 'NOT_FOUND');
        if (row.version !== version)
            fail('This task changed. Reload it before trying again.', 'CONFLICT');
        return row;
    }
    private async audit(client: PoolClient, org: number, actor: number, action: string, before: Row | null, after: Row): Promise<void> {
        await client.query(`INSERT INTO client_task_audit(organization_id,task_id,actor_id,action,task_version,before_state,after_state)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`, [org, after.id, actor, action, after.version, JSON.stringify(before), JSON.stringify(after)]);
    }
    private map(row: Row, role: string, actor: number): ClientTask {
        return { id: row.id, contactId: row.contact_id, title: row.title, description: row.description, priority: row.priority || 'medium', status: row.status || 'pending',
            assignedToId: row.assigned_to, assignedToName: row.assigned_to_name ?? null, dueAt: row.due_date?.toISOString() ?? null,
            completedAt: row.completed_at?.toISOString() ?? null, updatedAt: (row.updated_at ?? new Date(0)).toISOString(), version: row.version,
            canEdit: manager(role) || (role === 'member' && row.assigned_to === actor), canClaim: writer(role) && row.assigned_to === null };
    }
    private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await action(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
