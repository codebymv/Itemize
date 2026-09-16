import { gleamOrganizationAllowed } from './gleam-rollout';
﻿import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { PG_POOL } from '../database/database.module';
import { hasPlanEntitlement, PaidEntitlementState } from '../billing/billing-entitlement';
import { clientWorkEventSchema, handoffAppliedReceiptSchema, HandoffAppliedReceipt } from '../integrations/client-work.contract';
import { GleamConnection, GleamPrincipal, GleamScope } from './gleam-integration.guard';
import { gleamFingerprint, gleamKeyFingerprint } from './gleam-fingerprint';
import { gleamError } from './gleam-errors';
import { itemizeTaskSnapshotSchema } from '../integrations/itemize-task-status.contract';
import { itemizeNotificationReceiptSchema } from '../integrations/itemize-notification.contract';
import { NotificationsService } from '../notifications/notifications.service';

type Source = { task_id: number | null; contact_id: number | null; call_id: string; source_fingerprint: string };

@Injectable()
export class GleamHandoffReceiverService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool, private readonly notifications: NotificationsService) {}

  async receive(principal: GleamPrincipal, input: unknown): Promise<HandoffAppliedReceipt> {
    const parsed = clientWorkEventSchema.safeParse(input);
    if (!parsed.success || parsed.data.type !== 'gleam.handoff.requested') gleamError(400, 'INVALID_EVENT');
    const event = parsed.data;
    if (event.connectionId !== principal.connectionId || event.connectionGeneration !== principal.generation) gleamError(403, 'CONNECTION_MISMATCH');
    const fingerprint = gleamFingerprint(event);
    const sourceFingerprint = gleamFingerprint(event.data);
    return this.transaction(async client => {
      const connection = await this.lockConnection(client, principal, 'handoffs:write');
      await this.assertApprover(client, connection);
      const previous = await client.query<{fingerprint: string; receipt: HandoffAppliedReceipt}>(
        'SELECT fingerprint,receipt FROM gleam_handoff_inbox WHERE connection_id=$1 AND generation=$2 AND event_id=$3',
        [connection.id, connection.generation, event.eventId]);
      if (previous.rows[0]) {
        if (previous.rows[0].fingerprint !== fingerprint) gleamError(409, 'EVENT_PAYLOAD_CONFLICT');
        return handoffAppliedReceiptSchema.parse(previous.rows[0].receipt);
      }
      const organization = await client.query<PaidEntitlementState>(
        'SELECT plan,subscription_status,trial_ends_at FROM organizations WHERE id=$1 FOR SHARE', [connection.organization_id]);
      if (!hasPlanEntitlement(organization.rows[0], 'starter')) gleamError(403, 'ENTITLEMENT_REQUIRED');
      const mapped = await client.query<Source>(
        'SELECT * FROM gleam_handoff_sources WHERE connection_id=$1 AND handoff_id=$2', [connection.id, event.data.handoffId]);
      let taskId: number;
      let contactId: number | null;
      if (mapped.rows[0]) {
        const source = mapped.rows[0];
        if (source.call_id !== event.data.callId || source.source_fingerprint !== sourceFingerprint) gleamError(409, 'SOURCE_IDENTITY_CONFLICT');
        if (source.task_id === null) gleamError(410, 'HANDOFF_REMOVED');
        const existing = await client.query('SELECT id FROM tasks WHERE organization_id=$1 AND id=$2 FOR SHARE', [connection.organization_id, source.task_id]);
        if (!existing.rowCount) gleamError(409, 'SOURCE_IDENTITY_CONFLICT');
        // Re-emitting the source never rewrites a human-edited task or resurrects a deleted one.
        taskId = source.task_id;
        contactId = source.contact_id;
      } else {
        contactId = event.data.itemizeContactId === null ? null : Number(event.data.itemizeContactId);
        if (contactId !== null) {
          const contact = await client.query('SELECT id FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE', [connection.organization_id, contactId]);
          if (!contact.rowCount) gleamError(409, 'CONTACT_REFERENCE_INVALID');
        }
        await this.assertAssignee(client, connection);
        const candidate = event.data.contactCandidate;
        const caller = candidate ? [candidate.name && `Caller: ${candidate.name}`, candidate.phone && `Phone: ${candidate.phone}`, candidate.email && `Email: ${candidate.email}`].filter(Boolean).join('\n') : '';
        // Keep callback details visible even when the summary reaches its limit.
        const description = [caller, event.data.summary].filter(Boolean).join('\n\n').slice(0,4000);
        const dueAt = new Date(new Date(event.data.requestedAt).getTime() + connection.due_after_minutes * 60000);
        const task = await client.query<{id: number; version: number} & Record<string,unknown>>(`INSERT INTO tasks
          (organization_id,contact_id,title,description,priority,due_date,assigned_to,status,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,'pending',NULL) RETURNING *`,
        [connection.organization_id,contactId,event.data.title,description,event.data.priority,dueAt,connection.default_assignee_id]);
        taskId = task.rows[0].id;
        let activityId: number | null = null;
        if (contactId !== null) {
          const activity = await client.query<{id:number}>(`INSERT INTO contact_activities(contact_id,user_id,type,title,content,metadata)
            VALUES($1,NULL,'call',$2,$3::jsonb,$4::jsonb) RETURNING id`,
          [contactId,'Gleam call follow-up',JSON.stringify({summary:event.data.summary}),JSON.stringify({source:'gleam',callId:event.data.callId,handoffId:event.data.handoffId})]);
          activityId = activity.rows[0].id;
        }
        await client.query(`INSERT INTO client_task_audit(organization_id,task_id,actor_id,action,task_version,before_state,after_state)
          VALUES($1,$2,NULL,'gleam_handoff_created',$3,NULL,$4::jsonb)`,
        [connection.organization_id,taskId,task.rows[0].version,JSON.stringify(task.rows[0])]);
        await client.query(`INSERT INTO gleam_handoff_sources(connection_id,handoff_id,source_fingerprint,call_id,task_id,contact_id,activity_id)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [connection.id,event.data.handoffId,sourceFingerprint,event.data.callId,taskId,contactId,activityId]);
      }
      const receipt = handoffAppliedReceiptSchema.parse({schemaVersion:1,status:'applied',eventId:event.eventId,
        connectionId:connection.id,connectionGeneration:connection.generation,appliedAt:new Date().toISOString(),
        result:{handoffId:event.data.handoffId,taskId:String(taskId),itemizeContactId:contactId === null ? null : String(contactId)}});
      await client.query(`INSERT INTO gleam_handoff_inbox(connection_id,generation,event_id,fingerprint,receipt)
        VALUES($1,$2,$3,$4,$5::jsonb)`, [connection.id,connection.generation,event.eventId,fingerprint,JSON.stringify(receipt)]);
      return receipt;
    });
  }

  async receipt(principal: GleamPrincipal, eventId: string): Promise<HandoffAppliedReceipt> {
    if (!z.string().uuid().safeParse(eventId).success) gleamError(400, 'INVALID_EVENT_ID');
    return this.transaction(async client => {
      const connection = await this.lockConnection(client, principal, 'receipts:read');
      await this.assertApprover(client, connection);
      // Reading an existing receipt after plan expiry is allowed; creating new work is not.
      const result = await client.query<{receipt:HandoffAppliedReceipt}>(
        'SELECT receipt FROM gleam_handoff_inbox WHERE connection_id=$1 AND generation=$2 AND event_id=$3',
        [connection.id,connection.generation,eventId]);
      if (!result.rows[0]) gleamError(404, 'RECEIPT_NOT_FOUND');
      return handoffAppliedReceiptSchema.parse(result.rows[0].receipt);
    });
  }

  async taskStatus(principal: GleamPrincipal, eventId: string) {
    if (!z.string().uuid().safeParse(eventId).success) gleamError(400, 'INVALID_EVENT_ID');
    return this.transaction(async client => {
      const connection = await this.lockConnection(client, principal, 'task-status:read');
      await this.assertApprover(client, connection);
      // Like receipt reconciliation, existing task status remains readable after plan expiry.
      // One statement observes the mapping and task together, including ON DELETE SET NULL tombstones.
      const result = await client.query(`SELECT i.receipt,s.call_id,s.task_id,t.version,t.status,t.completed_at
        FROM gleam_handoff_inbox i
        JOIN gleam_handoff_sources s ON s.connection_id=i.connection_id AND s.handoff_id=i.receipt->'result'->>'handoffId'
        LEFT JOIN tasks t ON t.id=s.task_id AND t.organization_id=$4
        WHERE i.connection_id=$1 AND i.generation=$2 AND i.event_id=$3`,
      [connection.id,connection.generation,eventId,connection.organization_id]);
      const row = result.rows[0];
      if (!row) gleamError(404, 'RECEIPT_NOT_FOUND');
      const receipt = handoffAppliedReceiptSchema.parse(row.receipt);
      if (row.task_id !== null && (!row.version || String(row.task_id) !== receipt.result.taskId)) gleamError(409, 'SOURCE_IDENTITY_CONFLICT');
      return itemizeTaskSnapshotSchema.parse({schemaVersion:1,connectionId:connection.id,
        connectionGeneration:connection.generation,eventId,handoffId:receipt.result.handoffId,
        callId:row.call_id,taskId:receipt.result.taskId,task:row.task_id === null ? null : {
          version:row.version,status:row.status,completedAt:row.completed_at ? new Date(row.completed_at).toISOString() : null,
        }});
    });
  }

  async notifyAssignee(principal: GleamPrincipal, eventId: string) {
    if (!z.string().uuid().safeParse(eventId).success) gleamError(400,'INVALID_EVENT_ID');
    return this.transaction(async client => {
      const connection = await this.lockConnection(client,principal,'notifications:write');
      const members = await client.query<{user_id:number;role:string;joined_at:Date|null}>(
        'SELECT user_id,role,joined_at FROM organization_members WHERE organization_id=$1 ORDER BY user_id FOR SHARE',[connection.organization_id]);
      if (!members.rows.some(row => row.user_id === connection.target_approved_by && row.joined_at && ['owner','admin'].includes(row.role))) gleamError(403,'APPROVAL_REQUIRED');
      const inbox = await client.query('SELECT receipt FROM gleam_handoff_inbox WHERE connection_id=$1 AND generation=$2 AND event_id=$3',
        [connection.id,connection.generation,eventId]);
      if (!inbox.rows[0]) gleamError(404,'RECEIPT_NOT_FOUND');
      const applied = handoffAppliedReceiptSchema.parse(inbox.rows[0].receipt);
      const old = await client.query('SELECT receipt FROM gleam_handoff_notifications WHERE connection_id=$1 AND handoff_id=$2',
        [connection.id,applied.result.handoffId]);
      if (old.rows[0]) return itemizeNotificationReceiptSchema.parse({...old.rows[0].receipt,eventId,connectionGeneration:connection.generation});
      const source = await client.query('SELECT task_id FROM gleam_handoff_sources WHERE connection_id=$1 AND handoff_id=$2',
        [connection.id,applied.result.handoffId]);
      if (!source.rows[0]) gleamError(409,'SOURCE_IDENTITY_CONFLICT');
      const taskId = source.rows[0].task_id;
      let status:'notified'|'not_needed' = 'not_needed';
      if (taskId !== null) {
        if (String(taskId) !== applied.result.taskId) gleamError(409,'SOURCE_IDENTITY_CONFLICT');
        const tasks = await client.query('SELECT id,status,assigned_to FROM tasks WHERE id=$1 AND organization_id=$2 FOR SHARE',
          [taskId,connection.organization_id]);
        const task = tasks.rows[0];
        if (!task) gleamError(409,'SOURCE_IDENTITY_CONFLICT');
        if (['pending','in_progress'].includes(task.status)) {
          if (!members.rows.some(row => row.user_id === task.assigned_to && row.joined_at && ['owner','admin','member'].includes(row.role))) gleamError(409,'ASSIGNEE_UNAVAILABLE');
          await this.notifications.createWithClient(client,{organizationId:connection.organization_id,recipientUserId:task.assigned_to,
            eventType:'gleam.follow_up_assigned',entityType:'task',entityId:task.id,
            dedupeKey:`gleam-follow-up:${connection.id}:${applied.result.handoffId}`,payload:{taskId:String(task.id)},
            category:'business',priority:'normal',title:'A caller needs follow-up',
            body:'A Gleam call follow-up is assigned to you. Review the task before contacting the caller.',
            href:`/contacts?view=follow-ups&taskId=${task.id}&organizationId=${connection.organization_id}`});
          status = 'notified';
        }
      }
      // The inbox notification, realtime outbox and receipt commit together. No external email is sent here.
      const receipt = itemizeNotificationReceiptSchema.parse({schemaVersion:1,connectionId:connection.id,
        connectionGeneration:connection.generation,eventId,handoffId:applied.result.handoffId,taskId:applied.result.taskId,
        status,recordedAt:new Date().toISOString()});
      await client.query('INSERT INTO gleam_handoff_notifications(connection_id,handoff_id,receipt) VALUES($1,$2,$3::jsonb)',
        [connection.id,applied.result.handoffId,JSON.stringify(receipt)]);
      return receipt;
    });
  }

  private async lockConnection(client: PoolClient, principal: GleamPrincipal, scope: GleamScope): Promise<GleamConnection> {
    if (!gleamOrganizationAllowed(principal.organizationId)) gleamError(403, 'ROLLOUT_DISABLED');
    if (principal.scope !== scope) gleamError(403, 'SCOPE_FORBIDDEN');
    const result = await client.query<GleamConnection>('SELECT * FROM gleam_connections WHERE id=$1 FOR UPDATE', [principal.connectionId]);
    const row = result.rows[0];
    if (!row || row.state !== 'active' || !row.source_approved_at || !row.target_approved_at
      || row.generation !== principal.generation || row.source_organization_id !== principal.sourceOrganizationId
      || row.organization_id !== principal.organizationId
      || row.key_id !== principal.keyId || gleamKeyFingerprint(row.public_key) !== principal.keyFingerprint
      || principal.expiresAt <= Math.floor(Date.now()/1000)) gleamError(401, 'CONNECTION_REVOKED');
    return row;
  }

  private async assertApprover(client: PoolClient, connection: GleamConnection): Promise<void> {
    // Lock all relevant memberships in user-ID order, matching the task lifecycle's lock order.
    const members = await client.query<{user_id:number;role:string;joined_at:Date|null}>(`SELECT user_id,role,joined_at FROM organization_members
      WHERE organization_id=$1 AND user_id=ANY($2::int[]) ORDER BY user_id FOR SHARE`,
    [connection.organization_id,[connection.target_approved_by,connection.default_assignee_id].filter(id=>id!==null)]);
    if (!members.rows.some(row=>row.user_id===connection.target_approved_by && row.joined_at && ['owner','admin'].includes(row.role))) gleamError(403, 'APPROVAL_REQUIRED');
  }

  private async assertAssignee(client: PoolClient, connection: GleamConnection): Promise<void> {
    if (connection.default_assignee_id === null) gleamError(409, 'ASSIGNEE_UNAVAILABLE');
    const result = await client.query(`SELECT user_id FROM organization_members WHERE organization_id=$1 AND user_id=$2
      AND joined_at IS NOT NULL AND role IN ('owner','admin','member') FOR SHARE`, [connection.organization_id,connection.default_assignee_id]);
    if (!result.rowCount) gleamError(409, 'ASSIGNEE_UNAVAILABLE');
  }

  private async transaction<T>(action:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
