import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SignatureDocumentStatus } from './signature-document.enums';

export type SignatureDocumentRow = {
  id: number; organization_id: number; title: string; document_number: string | null;
  description: string | null; message: string | null; status: SignatureDocumentStatus;
  recipient_count: number | string; routing_mode: string; template_id: number | null;
  expiration_days: number; expires_at: Date | null; sender_name: string | null;
  sender_email: string | null; created_by: number | null; sent_at: Date | null;
  completed_at: Date | null; has_file: boolean; has_signed_file: boolean;
  file_name: string | null; file_type: string | null; file_size: number | string | null;
  created_at: Date; updated_at: Date;
};

export type SignatureRecipientRow = {
  id: number; document_id: number; organization_id: number; contact_id: number | null;
  name: string | null; email: string; signing_order: number; role_name: string | null;
  routing_status: string; status: string; sent_at: Date | null; viewed_at: Date | null;
  signed_at: Date | null; declined_at: Date | null; decline_reason: string | null;
  identity_method: string; identity_verified_at: Date | null;
};

export type SignatureFieldRow = {
  id: number; document_id: number; recipient_id: number | null; role_name: string | null;
  field_type: string; page_number: number; x_position: number | string; y_position: number | string;
  width: number | string; height: number | string; label: string | null; is_required: boolean;
  value: string | null; font_size: number | null; font_family: string | null;
  text_align: string | null; locked: boolean;
};

export type SignatureAuditRow = {
  id: number; document_id: number; recipient_id: number | null; event_type: string;
  description: string | null; created_at: Date;
};

export type SignatureRecipientWrite = {
  contactId: number | null; name: string | null; email: string; signingOrder: number;
  roleName: string | null; identityMethod: string;
};

export type SignatureFieldWrite = {
  recipientId: number | null; roleName: string | null; fieldType: string; pageNumber: number;
  xPosition: number; yPosition: number; width: number; height: number; label: string | null;
  isRequired: boolean; value: string | null; fontSize: number | null;
  fontFamily: string | null; textAlign: string | null; locked: boolean;
};

export type SignatureDocumentValues = {
  title: string; documentNumber: string | null; description: string | null; message: string | null;
  expirationDays: number; senderName: string | null; senderEmail: string | null;
  timezone: string | null; locale: string | null; routingMode: string; templateId: number | null;
  recipients?: SignatureRecipientWrite[]; fields?: SignatureFieldWrite[];
};

export type SignatureDocumentUpdates = Partial<Omit<SignatureDocumentValues, 'recipients' | 'fields'>> & {
  recipients?: SignatureRecipientWrite[]; fields?: SignatureFieldWrite[];
};

export class SignatureQuotaExceededError extends Error {}
export class SignatureReferenceError extends Error {}

const documentColumns = `d.id, d.organization_id, d.title, d.document_number,
  d.description, d.message, d.status, d.routing_mode, d.template_id,
  d.expiration_days, d.expires_at, d.sender_name, d.sender_email, d.created_by,
  d.sent_at, d.completed_at, d.file_url IS NOT NULL AS has_file,
  d.signed_file_url IS NOT NULL AS has_signed_file, d.file_name, d.file_type,
  d.file_size, d.created_at, d.updated_at`;

@Injectable()
export class SignatureDocumentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<{ plan: string | null }>(
      'SELECT plan FROM organizations WHERE id = $1', [organizationId],
    );
    const organization = result.rows[0];
    return organization !== undefined
      && ['starter', 'unlimited', 'pro'].includes(organization.plan ?? 'starter');
  }

  async findPage(input: { organizationId: number; status?: SignatureDocumentStatus; pageSize: number; offset: number }): Promise<{ rows: SignatureDocumentRow[]; total: number }> {
    return this.snapshot(async (client) => {
      const params: unknown[] = [input.organizationId];
      const conditions = ['d.organization_id = $1'];
      if (input.status !== undefined) { params.push(input.status); conditions.push(`d.status = $${params.length}`); }
      const where = conditions.join(' AND ');
      const count = await client.query<{ total: string }>(`SELECT COUNT(*) AS total FROM signature_documents d WHERE ${where}`, params);
      params.push(input.pageSize, input.offset);
      const rows = await client.query<SignatureDocumentRow>(
        `SELECT ${documentColumns},
           (SELECT COUNT(*)::int FROM signature_recipients r
            WHERE r.document_id=d.id AND r.organization_id=d.organization_id) AS recipient_count
         FROM signature_documents d
         WHERE ${where}
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
      );
      return { rows: rows.rows, total: Number(count.rows[0]?.total ?? 0) };
    });
  }

  async findDetail(organizationId: number, id: number): Promise<{ document: SignatureDocumentRow; recipients: SignatureRecipientRow[]; fields: SignatureFieldRow[]; audit: SignatureAuditRow[] } | null> {
    return this.snapshot(async (client) => {
      const document = await client.query<SignatureDocumentRow>(
        `SELECT ${documentColumns},
           (SELECT COUNT(*)::int FROM signature_recipients r
            WHERE r.document_id=d.id AND r.organization_id=d.organization_id) AS recipient_count
         FROM signature_documents d WHERE d.id=$1 AND d.organization_id=$2`, [id, organizationId],
      );
      if (!document.rows[0]) return null;
      const recipients = await client.query<SignatureRecipientRow>(
        `SELECT r.id,r.document_id,r.organization_id,r.contact_id,r.name,r.email,r.signing_order,
           r.role_name,r.routing_status,r.status,r.sent_at,r.viewed_at,r.signed_at,r.declined_at,
           r.decline_reason,r.identity_method,r.identity_verified_at
         FROM signature_recipients r WHERE r.document_id=$1 AND r.organization_id=$2
         ORDER BY r.signing_order ASC, r.id ASC`, [id, organizationId],
      );
      const fields = await client.query<SignatureFieldRow>(
        `SELECT f.id,f.document_id,f.recipient_id,f.role_name,f.field_type,f.page_number,
           f.x_position,f.y_position,f.width,f.height,f.label,f.is_required,f.value,
           f.font_size,f.font_family,f.text_align,f.locked
         FROM signature_fields f JOIN signature_documents d ON d.id=f.document_id
         WHERE f.document_id=$1 AND d.organization_id=$2 ORDER BY f.id ASC`, [id, organizationId],
      );
      const audit = await client.query<SignatureAuditRow>(
        `SELECT a.id,a.document_id,a.recipient_id,a.event_type,a.description,a.created_at
         FROM signature_audit_log a JOIN signature_documents d ON d.id=a.document_id
         WHERE a.document_id=$1 AND d.organization_id=$2 ORDER BY a.created_at ASC,a.id ASC`, [id, organizationId],
      );
      return { document: document.rows[0], recipients: recipients.rows, fields: fields.rows, audit: audit.rows };
    });
  }

  async findAudit(organizationId: number, id: number): Promise<SignatureAuditRow[] | null> {
    return this.snapshot(async (client) => {
      const exists = await client.query(
        'SELECT id FROM signature_documents WHERE id=$1 AND organization_id=$2',
        [id, organizationId],
      );
      if (!exists.rows[0]) return null;
      const result = await client.query<SignatureAuditRow>(
        `SELECT a.id,a.document_id,a.recipient_id,a.event_type,a.description,a.created_at
         FROM signature_audit_log a
         JOIN signature_documents d ON d.id=a.document_id
         WHERE a.document_id=$1 AND d.organization_id=$2
         ORDER BY a.created_at ASC,a.id ASC`,
        [id, organizationId],
      );
      return result.rows;
    });
  }

  async createDraft(organizationId: number, userId: number, values: SignatureDocumentValues): Promise<SignatureDocumentRow> {
    return this.transaction(async (client) => {
      await this.lockQuota(client, organizationId);
      if (values.templateId !== null) {
        const template = await client.query('SELECT id FROM signature_templates WHERE id=$1 AND organization_id=$2', [values.templateId, organizationId]);
        if (!template.rows[0]) throw new SignatureReferenceError('Template must belong to the active organization');
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO signature_documents (
           organization_id,title,document_number,description,message,expiration_days,
           sender_name,sender_email,timezone,locale,routing_mode,template_id,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [organizationId,values.title,values.documentNumber,values.description,values.message,
          values.expirationDays,values.senderName,values.senderEmail,values.timezone,values.locale,
          values.routingMode,values.templateId,userId],
      );
      const id = Number(inserted.rows[0].id);
      const recipients = values.recipients === undefined ? undefined : await this.replaceRecipients(client, organizationId, id, values.recipients);
      if (values.fields !== undefined) await this.replaceFields(client, organizationId, id, values.fields, recipients);
      return this.selectDocument(client, organizationId, id);
    });
  }

  async updateDraft(organizationId: number, id: number, values: SignatureDocumentUpdates): Promise<SignatureDocumentRow | null> {
    return this.transaction(async (client) => {
      const locked = await client.query('SELECT id FROM signature_documents WHERE id=$1 AND organization_id=$2 AND status=\'draft\' FOR UPDATE', [id, organizationId]);
      if (!locked.rows[0]) return null;
      const assignments: string[] = [];
      const parameters: unknown[] = [id, organizationId];
      const set = (column:string,value:unknown) => { parameters.push(value); assignments.push(`${column}=$${parameters.length}`); };
      if (values.title !== undefined) set('title', values.title);
      if (values.documentNumber !== undefined) set('document_number', values.documentNumber);
      if (values.description !== undefined) set('description', values.description);
      if (values.message !== undefined) set('message', values.message);
      if (values.expirationDays !== undefined) set('expiration_days', values.expirationDays);
      if (values.senderName !== undefined) set('sender_name', values.senderName);
      if (values.senderEmail !== undefined) set('sender_email', values.senderEmail);
      if (values.timezone !== undefined) set('timezone', values.timezone);
      if (values.locale !== undefined) set('locale', values.locale);
      if (values.routingMode !== undefined) set('routing_mode', values.routingMode);
      if (assignments.length > 0) await client.query(`UPDATE signature_documents SET ${assignments.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`, parameters);
      const recipients = values.recipients === undefined ? undefined : await this.replaceRecipients(client, organizationId, id, values.recipients);
      if (values.fields !== undefined) await this.replaceFields(client, organizationId, id, values.fields, recipients);
      else if (recipients !== undefined) await this.remapFieldsByRole(client, id, recipients);
      return this.selectDocument(client, organizationId, id);
    });
  }

  async deleteDraft(organizationId: number, id: number): Promise<{ row: SignatureDocumentRow | null; status: string | null }> {
    return this.transaction(async (client) => {
      const current = await client.query<{ status:string; file_url:string|null }>('SELECT status,file_url FROM signature_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE', [id, organizationId]);
      if (!current.rows[0]) return { row:null, status:null };
      if (current.rows[0].status !== 'draft') return { row:null, status:current.rows[0].status };
      const row = await this.selectDocument(client, organizationId, id);
      await this.enqueueFileDeletion(client, organizationId, id, current.rows[0].file_url);
      await client.query('DELETE FROM signature_documents WHERE id=$1 AND organization_id=$2 AND status=\'draft\'', [id, organizationId]);
      return { row, status:'draft' };
    });
  }

  async removeDraftFile(organizationId:number,id:number):Promise<{row:SignatureDocumentRow|null;status:string|null}>{
    return this.transaction(async client=>{
      const current=await client.query<{status:string;file_url:string|null}>(
        'SELECT status,file_url FROM signature_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id,organizationId],
      );
      if(!current.rows[0])return{row:null,status:null};
      if(current.rows[0].status!=='draft')return{row:null,status:current.rows[0].status};
      if(current.rows[0].file_url===null){
        return{row:await this.selectDocument(client,organizationId,id),status:'draft'};
      }
      await this.enqueueFileDeletion(client,organizationId,id,current.rows[0].file_url);
      await client.query(
        `UPDATE signature_documents SET file_url=NULL,file_name=NULL,file_size=NULL,
           file_type=NULL,original_sha256=NULL,signed_file_url=NULL,signed_sha256=NULL,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 AND status='draft'`,
        [id,organizationId],
      );
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,event_type,description,created_at)
         VALUES ($1,'file_removed','Document file removed',CURRENT_TIMESTAMP)`,
        [id],
      );
      return{row:await this.selectDocument(client,organizationId,id),status:'draft'};
    });
  }

  async cancelDocument(organizationId: number, id: number): Promise<{ row: SignatureDocumentRow | null; status: string | null }> {
    return this.transaction(async (client) => {
      const current = await client.query<{ status: string }>(
        'SELECT status FROM signature_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, organizationId],
      );
      if (!current.rows[0]) return { row: null, status: null };
      const status = current.rows[0].status;
      if (status === 'completed' || status === 'cancelled') {
        return { row: await this.selectDocument(client, organizationId, id), status };
      }

      await client.query(
        `UPDATE signature_recipients
         SET signing_token_hash=NULL, token_expires_at=NULL, routing_status='locked'
         WHERE document_id=$1 AND organization_id=$2
           AND status IN ('pending','sent','viewed')`,
        [id, organizationId],
      );
      await client.query(
        `UPDATE signature_reminders SET status='cancelled'
         WHERE document_id=$1 AND status='pending'`,
        [id],
      );
      await client.query(
        `UPDATE signature_delivery_outbox
         SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,
           cancellation_reason='document_cancelled',updated_at=CURRENT_TIMESTAMP
         WHERE document_id=$1 AND status IN ('queued','retry','processing')`,
        [id],
      );
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,event_type,description,created_at)
         VALUES ($1,'cancelled','Signature document cancelled',CURRENT_TIMESTAMP)`,
        [id],
      );
      await client.query(
        `UPDATE signature_documents
         SET status='cancelled',updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [id, organizationId],
      );
      return {
        row: await this.selectDocument(client, organizationId, id),
        status: 'cancelled',
      };
    });
  }

  private async lockQuota(client: PoolClient, organizationId:number):Promise<void>{
    const organization = await client.query<{plan:string|null}>('SELECT plan FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
    if (!organization.rows[0]) throw new SignatureReferenceError('Organization not found');
    const plan=organization.rows[0].plan??'starter'; const limit=plan==='starter'?5:plan==='unlimited'?50:Number.POSITIVE_INFINITY;
    if(Number.isFinite(limit)){
      const count=await client.query<{total:string}>("SELECT COUNT(*) AS total FROM signature_documents WHERE organization_id=$1 AND created_at>=(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",[organizationId]);
      if(Number(count.rows[0]?.total??0)>=limit)throw new SignatureQuotaExceededError('Monthly signature document limit reached');
    }
  }

  private async replaceRecipients(client:PoolClient,organizationId:number,documentId:number,recipients:SignatureRecipientWrite[]):Promise<Map<string,number>>{
    const contactIds=[...new Set(recipients.map(r=>r.contactId).filter((id):id is number=>id!==null))];
    if(contactIds.length){const found=await client.query('SELECT id FROM contacts WHERE organization_id=$1 AND id=ANY($2::int[])',[organizationId,contactIds]);if(found.rows.length!==contactIds.length)throw new SignatureReferenceError('Recipient contact must belong to the active organization');}
    await client.query('DELETE FROM signature_recipients WHERE document_id=$1 AND organization_id=$2',[documentId,organizationId]);
    const roleMap=new Map<string,number>();
    for(const recipient of recipients){
      const result=await client.query<{id:number}>(`INSERT INTO signature_recipients (document_id,organization_id,contact_id,name,email,signing_order,identity_method,role_name,routing_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'locked') RETURNING id`,[documentId,organizationId,recipient.contactId,recipient.name,recipient.email,recipient.signingOrder,recipient.identityMethod,recipient.roleName]);
      if(recipient.roleName!==null)roleMap.set(recipient.roleName,Number(result.rows[0].id));
    }
    return roleMap;
  }

  private async replaceFields(client:PoolClient,organizationId:number,documentId:number,fields:SignatureFieldWrite[],newRecipients?:Map<string,number>):Promise<void>{
    const existing=await client.query<{id:number;role_name:string|null}>('SELECT id,role_name FROM signature_recipients WHERE document_id=$1 AND organization_id=$2',[documentId,organizationId]);
    const ids=new Set(existing.rows.map(r=>Number(r.id))); const roles=new Map(existing.rows.filter(r=>r.role_name!==null).map(r=>[r.role_name as string,Number(r.id)]));
    if(newRecipients)for(const [role,id]of newRecipients)roles.set(role,id);
    await client.query('DELETE FROM signature_fields WHERE document_id=$1',[documentId]);
    for(const field of fields){
      const mapped=field.roleName===null?field.recipientId:(roles.get(field.roleName)??field.recipientId);
      if(mapped!==null&&!ids.has(mapped)&&![...roles.values()].includes(mapped))throw new SignatureReferenceError('Signature field recipient must belong to the document');
      if(field.roleName!==null&&!roles.has(field.roleName))throw new SignatureReferenceError('Signature field role must belong to a document recipient');
      await client.query(`INSERT INTO signature_fields (document_id,recipient_id,role_name,field_type,page_number,x_position,y_position,width,height,label,is_required,value,font_size,font_family,text_align,locked) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[documentId,mapped,field.roleName,field.fieldType,field.pageNumber,field.xPosition,field.yPosition,field.width,field.height,field.label,field.isRequired,field.value,field.fontSize,field.fontFamily,field.textAlign,field.locked]);
    }
  }

  private async remapFieldsByRole(client:PoolClient,documentId:number,recipients:Map<string,number>):Promise<void>{
    await client.query('UPDATE signature_fields SET recipient_id=NULL WHERE document_id=$1',[documentId]);
    for(const [role,id]of recipients)await client.query('UPDATE signature_fields SET recipient_id=$1 WHERE document_id=$2 AND role_name=$3',[id,documentId,role]);
  }

  private async enqueueFileDeletion(
    client:PoolClient,
    organizationId:number,
    documentId:number,
    fileUrl:string|null,
  ):Promise<void>{
    if(!fileUrl)return;
    await client.query(
      `INSERT INTO signature_file_deletion_jobs
         (organization_id,document_id,file_url)
       VALUES ($1,$2,$3)
       ON CONFLICT (organization_id,file_url) DO UPDATE SET
         document_id=EXCLUDED.document_id,
         status=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN 'queued' ELSE signature_file_deletion_jobs.status END,
         next_attempt_at=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN CURRENT_TIMESTAMP ELSE signature_file_deletion_jobs.next_attempt_at END,
         deleted_at=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.deleted_at END,
         last_error=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.last_error END,
         updated_at=CURRENT_TIMESTAMP`,
      [organizationId,documentId,fileUrl],
    );
  }

  private async selectDocument(client:PoolClient,organizationId:number,id:number):Promise<SignatureDocumentRow>{
    const result=await client.query<SignatureDocumentRow>(`SELECT ${documentColumns},(SELECT COUNT(*)::int FROM signature_recipients r WHERE r.document_id=d.id AND r.organization_id=d.organization_id) AS recipient_count FROM signature_documents d WHERE d.id=$1 AND d.organization_id=$2`,[id,organizationId]);
    return result.rows[0];
  }

  private async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }

  private async snapshot<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
