import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { hasPaidEntitlement, PaidEntitlementState, signatureDocumentLimit } from '../billing/billing-entitlement';
import { SignatureDocumentRow, SignatureQuotaExceededError, SignatureRecipientWrite, SignatureReferenceError } from '../signature-documents/signature-documents.repository';
import {
  SignatureCreationOutcome,
  SignatureCreationReceiptRow,
} from '../signature-creation/signature-creation.idempotency';

export type SignatureTemplateRow = {
  id: number;
  organization_id: number;
  title: string;
  description: string | null;
  message: string | null;
  has_file: boolean;
  file_name: string | null;
  file_type: string | null;
  file_size: number | string | null;
  page_count: number | null;
  is_ready: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};

export type SignatureTemplateRoleRow = {
  id: number;
  template_id: number;
  role_name: string;
  signing_order: number;
};

export type SignatureTemplateFieldRow = {
  id: number;
  template_id: number;
  role_name: string | null;
  field_type: string;
  page_number: number;
  x_position: number | string;
  y_position: number | string;
  width: number | string;
  height: number | string;
  label: string | null;
  is_required: boolean;
  font_size: number | null;
  font_family: string | null;
  text_align: string | null;
  locked: boolean;
};

export type SignatureTemplateRoleWrite={roleName:string;signingOrder:number};
export type SignatureTemplateFieldWrite={roleName:string|null;fieldType:string;pageNumber:number;xPosition:number;yPosition:number;width:number;height:number;label:string|null;isRequired:boolean;fontSize:number|null;fontFamily:string|null;textAlign:string|null;locked:boolean};
export type SignatureTemplateValues={title:string;description:string|null;message:string|null;roles?:SignatureTemplateRoleWrite[];fields?:SignatureTemplateFieldWrite[]};
export type SignatureTemplateUpdates=Partial<Omit<SignatureTemplateValues,'roles'|'fields'>>&{roles?:SignatureTemplateRoleWrite[];fields?:SignatureTemplateFieldWrite[]};
export type InstantiateSignatureTemplateValues={title:string|null;description:string|null|undefined;message:string|null|undefined;routingMode:string;expirationDays:number;senderName:string|null;senderEmail:string|null;recipients:SignatureRecipientWrite[]};
export type SignatureTemplateInstantiationOutcome =
  | SignatureCreationOutcome<SignatureDocumentRow>
  | { kind: 'not_found' };
export class SignatureTemplateNotReadyError extends Error {}

const columns = `t.id,t.organization_id,t.title,t.description,t.message,
  t.file_url IS NOT NULL AS has_file,t.file_name,t.file_type,t.file_size,t.page_count,
  (t.file_url IS NOT NULL AND t.page_count IS NOT NULL
    AND EXISTS (SELECT 1 FROM signature_template_roles readiness_role
      WHERE readiness_role.template_id=t.id)
    AND NOT EXISTS (
      SELECT 1 FROM signature_template_roles readiness_role
      WHERE readiness_role.template_id=t.id AND NOT EXISTS (
        SELECT 1 FROM signature_template_fields readiness_signature
        WHERE readiness_signature.template_id=t.id
          AND LOWER(readiness_signature.role_name)=LOWER(readiness_role.role_name)
          AND readiness_signature.field_type IN ('signature','initials')
          AND readiness_signature.is_required=true AND readiness_signature.locked=false
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM signature_template_fields readiness_field
      WHERE readiness_field.template_id=t.id
        AND (readiness_field.page_number>t.page_count
          OR (readiness_field.locked=false AND readiness_field.role_name IS NULL))
    )
  ) AS is_ready,
  t.created_by,t.created_at,t.updated_at`;
const documentColumns=`d.id,d.organization_id,d.title,d.document_number,d.description,d.message,d.status,d.routing_mode,d.template_id,d.expiration_days,d.expires_at,d.sender_name,d.sender_email,d.created_by,d.sent_at,d.completed_at,d.file_url IS NOT NULL AS has_file,d.signed_file_url IS NOT NULL AS has_signed_file,d.file_name,d.file_type,d.file_size,d.page_count,NULL::text AS delivery_state,NULL::text AS completion_state,d.created_at,d.updated_at`;

@Injectable()
export class SignatureTemplatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<PaidEntitlementState>(
      'SELECT plan, subscription_status, trial_ends_at FROM organizations WHERE id=$1',
      [organizationId],
    );
    return hasPaidEntitlement(result.rows[0]);
  }

  async findAll(organizationId: number): Promise<SignatureTemplateRow[]> {
    const result = await this.pool.query<SignatureTemplateRow>(
      `SELECT ${columns} FROM signature_templates t
       WHERE t.organization_id=$1 ORDER BY t.created_at DESC,t.id DESC`,
      [organizationId],
    );
    return result.rows;
  }

  async findDetail(
    organizationId: number,
    id: number,
  ): Promise<{
    template: SignatureTemplateRow;
    roles: SignatureTemplateRoleRow[];
    fields: SignatureTemplateFieldRow[];
  } | null> {
    return this.snapshot(async (client) => {
      const template = await client.query<SignatureTemplateRow>(
        `SELECT ${columns} FROM signature_templates t
         WHERE t.id=$1 AND t.organization_id=$2`,
        [id, organizationId],
      );
      if (!template.rows[0]) return null;

      const roles = await client.query<SignatureTemplateRoleRow>(
        `SELECT r.id,r.template_id,r.role_name,r.signing_order
         FROM signature_template_roles r
         JOIN signature_templates t ON t.id=r.template_id
         WHERE r.template_id=$1 AND t.organization_id=$2
         ORDER BY r.signing_order ASC,r.id ASC`,
        [id, organizationId],
      );
      const fields = await client.query<SignatureTemplateFieldRow>(
        `SELECT f.id,f.template_id,f.role_name,f.field_type,f.page_number,
           f.x_position,f.y_position,f.width,f.height,f.label,f.is_required,
           f.font_size,f.font_family,f.text_align,f.locked
         FROM signature_template_fields f
         JOIN signature_templates t ON t.id=f.template_id
         WHERE f.template_id=$1 AND t.organization_id=$2 ORDER BY f.id ASC`,
        [id, organizationId],
      );

      return {
        template: template.rows[0],
        roles: roles.rows,
        fields: fields.rows,
      };
    });
  }

  async create(organizationId:number,userId:number,values:SignatureTemplateValues,idempotencyKey:string,requestFingerprint:string):Promise<SignatureCreationOutcome<SignatureTemplateRow>>{
    return this.transaction(async client=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const receipt=await client.query<SignatureCreationReceiptRow>(`SELECT action,request_fingerprint,result_document_id,result_template_id FROM signature_creation_receipts WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,[organizationId,idempotencyKey]);
      const replay=receipt.rows[0];
      if(replay){
        if(replay.action!=='create_template'||replay.request_fingerprint!==requestFingerprint)return{kind:'idempotency_conflict'};
        if(replay.result_template_id===null)return{kind:'result_unavailable'};
        const row=await this.selectTemplateOrNull(client,organizationId,replay.result_template_id);
        return row?{kind:'created',row,replayed:true}:{kind:'result_unavailable'};
      }
      const inserted=await client.query<{id:number}>('INSERT INTO signature_templates (organization_id,title,description,message,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',[organizationId,values.title,values.description,values.message,userId]);const id=Number(inserted.rows[0].id);if(values.roles!==undefined)await this.replaceRoles(client,id,values.roles);if(values.fields!==undefined){this.assertFieldRoles(values.fields,values.roles??[]);await this.replaceFields(client,id,values.fields);}const row=await this.selectTemplate(client,organizationId,id);
      await client.query(`INSERT INTO signature_creation_receipts (organization_id,requested_by_user_id,idempotency_key,action,request_fingerprint,result_template_id) VALUES ($1,$2,$3,'create_template',$4,$5)`,[organizationId,userId,idempotencyKey,requestFingerprint,id]);
      return{kind:'created',row,replayed:false};
    });
  }

  async update(organizationId:number,id:number,values:SignatureTemplateUpdates):Promise<SignatureTemplateRow|null>{
    return this.transaction(async client=>{const locked=await client.query('SELECT id FROM signature_templates WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,organizationId]);if(!locked.rows[0])return null;const currentRoles=await client.query<{role_name:string;signing_order:number}>('SELECT role_name,signing_order FROM signature_template_roles WHERE template_id=$1 ORDER BY signing_order,id',[id]);const currentFields=await client.query<SignatureTemplateFieldRow>('SELECT id,template_id,role_name,field_type,page_number,x_position,y_position,width,height,label,is_required,font_size,font_family,text_align,locked FROM signature_template_fields WHERE template_id=$1 ORDER BY id',[id]);const effectiveRoles=values.roles??currentRoles.rows.map(r=>({roleName:r.role_name,signingOrder:r.signing_order}));const effectiveFields=values.fields??currentFields.rows.map(f=>({roleName:f.role_name,fieldType:f.field_type,pageNumber:f.page_number,xPosition:Number(f.x_position),yPosition:Number(f.y_position),width:Number(f.width),height:Number(f.height),label:f.label,isRequired:f.is_required,fontSize:f.font_size,fontFamily:f.font_family,textAlign:f.text_align,locked:f.locked}));this.assertFieldRoles(effectiveFields,effectiveRoles);const assignments:string[]=[];const parameters:unknown[]=[id,organizationId];const set=(column:string,value:unknown)=>{parameters.push(value);assignments.push(`${column}=$${parameters.length}`);};if(values.title!==undefined)set('title',values.title);if(values.description!==undefined)set('description',values.description);if(values.message!==undefined)set('message',values.message);if(assignments.length)await client.query(`UPDATE signature_templates SET ${assignments.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`,parameters);if(values.roles!==undefined)await this.replaceRoles(client,id,values.roles);if(values.fields!==undefined)await this.replaceFields(client,id,values.fields);return this.selectTemplate(client,organizationId,id);});
  }

  async delete(organizationId:number,id:number):Promise<SignatureTemplateRow|null>{
    return this.transaction(async client=>{
      const current=await client.query<{file_url:string|null}>(
        'SELECT file_url FROM signature_templates WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id,organizationId],
      );
      if(!current.rows[0])return null;
      const row=await this.selectTemplate(client,organizationId,id);
      await this.enqueueFileDeletion(client,organizationId,current.rows[0].file_url);
      await client.query(
        'DELETE FROM signature_templates WHERE id=$1 AND organization_id=$2',
        [id,organizationId],
      );
      return row;
    });
  }

  async instantiate(organizationId:number,userId:number,id:number,values:InstantiateSignatureTemplateValues,idempotencyKey:string,requestFingerprint:string):Promise<SignatureTemplateInstantiationOutcome>{
    return this.transaction(async client=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const receipt=await client.query<SignatureCreationReceiptRow>(`SELECT action,request_fingerprint,result_document_id,result_template_id FROM signature_creation_receipts WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,[organizationId,idempotencyKey]);
      const replay=receipt.rows[0];
      if(replay){
        if(replay.action!=='instantiate_template'||replay.request_fingerprint!==requestFingerprint)return{kind:'idempotency_conflict'};
        if(replay.result_document_id===null)return{kind:'result_unavailable'};
        const row=await this.selectDocumentOrNull(client,organizationId,replay.result_document_id);
        return row?{kind:'created',row,replayed:true}:{kind:'result_unavailable'};
      }
      await this.lockQuota(client,organizationId);
      const template=await client.query<{
        id:number;title:string;description:string|null;message:string|null;
        file_url:string|null;file_name:string|null;file_size:number|null;
        file_type:string|null;original_sha256:string|null;page_count:number|null;
      }>(
        `SELECT id,title,description,message,file_url,file_name,file_size,file_type,
           original_sha256,page_count
         FROM signature_templates WHERE id=$1 AND organization_id=$2 FOR SHARE`,
        [id,organizationId],
      );
      if(!template.rows[0])return{kind:'not_found'};
      const t=template.rows[0];
      const roles=await client.query<{role_name:string;signing_order:number}>(
        'SELECT role_name,signing_order FROM signature_template_roles WHERE template_id=$1 ORDER BY signing_order,id',
        [id],
      );
      const fields=await client.query<SignatureTemplateFieldRow>(
        'SELECT id,template_id,role_name,field_type,page_number,x_position,y_position,width,height,label,is_required,font_size,font_family,text_align,locked FROM signature_template_fields WHERE template_id=$1 ORDER BY id',
        [id],
      );
      const signatureRoles=new Set(
        fields.rows
          .filter(field=>field.role_name&&['signature','initials'].includes(field.field_type)&&field.is_required&&!field.locked)
          .map(field=>field.role_name!.toLowerCase()),
      );
      const invalidField=fields.rows.some(field=>
        field.page_number>(t.page_count??0)||(!field.locked&&!field.role_name),
      );
      if(!t.file_url||!t.page_count||roles.rows.length===0||invalidField
        ||roles.rows.some(role=>!signatureRoles.has(role.role_name.toLowerCase()))){
        throw new SignatureTemplateNotReadyError('Finish the PDF, roles, and signer fields before using this template');
      }
      const order=new Map(roles.rows.map(r=>[r.role_name,r.signing_order]));
      const contacts=[...new Set(values.recipients.map(r=>r.contactId).filter((v):v is number=>v!==null))];
      if(contacts.length){
        const found=await client.query(
          'SELECT id FROM contacts WHERE organization_id=$1 AND id=ANY($2::int[])',
          [organizationId,contacts],
        );
        if(found.rows.length!==contacts.length)throw new SignatureReferenceError('Recipient contact must belong to the active organization');
      }
      const inserted=await client.query<{id:number}>(
        `INSERT INTO signature_documents (
           organization_id,title,description,message,file_url,file_name,file_size,
           file_type,original_sha256,page_count,template_id,routing_mode,
           expiration_days,sender_name,sender_email,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [organizationId,values.title??t.title,
          values.description===undefined?t.description:values.description,
          values.message===undefined?t.message:values.message,t.file_url,t.file_name,
          t.file_size,t.file_type,t.original_sha256,t.page_count,t.id,values.routingMode,
          values.expirationDays,values.senderName,values.senderEmail,userId],
      );
      const documentId=Number(inserted.rows[0].id);
      const recipientMap=new Map<string,number>();
      for(const recipient of values.recipients){
        const result=await client.query<{id:number}>(
          `INSERT INTO signature_recipients (
             document_id,organization_id,contact_id,name,email,signing_order,
             role_name,identity_method,routing_status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'locked') RETURNING id`,
          [documentId,organizationId,recipient.contactId,recipient.name,recipient.email,
            order.get(recipient.roleName??'')??recipient.signingOrder,
            recipient.roleName,recipient.identityMethod],
        );
        if(recipient.roleName)recipientMap.set(recipient.roleName,Number(result.rows[0].id));
      }
      for(const field of fields.rows)await client.query(
        `INSERT INTO signature_fields (
           document_id,recipient_id,role_name,field_type,page_number,x_position,
           y_position,width,height,label,is_required,font_size,font_family,text_align,locked
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [documentId,field.role_name?recipientMap.get(field.role_name)??null:null,
          field.role_name,field.field_type,field.page_number,field.x_position,
          field.y_position,field.width,field.height,field.label,field.is_required,
          field.font_size,field.font_family,field.text_align,field.locked],
      );
      const row=await this.selectDocument(client,organizationId,documentId);
      await client.query(`INSERT INTO signature_creation_receipts (organization_id,requested_by_user_id,idempotency_key,action,request_fingerprint,result_document_id) VALUES ($1,$2,$3,'instantiate_template',$4,$5)`,[organizationId,userId,idempotencyKey,requestFingerprint,documentId]);
      return{kind:'created',row,replayed:false};
    });
  }

  private async replaceRoles(client:PoolClient,id:number,roles:SignatureTemplateRoleWrite[]):Promise<void>{await client.query('DELETE FROM signature_template_roles WHERE template_id=$1',[id]);for(const role of roles)await client.query('INSERT INTO signature_template_roles (template_id,role_name,signing_order) VALUES ($1,$2,$3)',[id,role.roleName,role.signingOrder]);}
  private async replaceFields(client:PoolClient,id:number,fields:SignatureTemplateFieldWrite[]):Promise<void>{await client.query('DELETE FROM signature_template_fields WHERE template_id=$1',[id]);for(const field of fields)await client.query(`INSERT INTO signature_template_fields (template_id,role_name,field_type,page_number,x_position,y_position,width,height,label,is_required,font_size,font_family,text_align,locked) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,field.roleName,field.fieldType,field.pageNumber,field.xPosition,field.yPosition,field.width,field.height,field.label,field.isRequired,field.fontSize,field.fontFamily,field.textAlign,field.locked]);}
  private async enqueueFileDeletion(client:PoolClient,organizationId:number,fileUrl:string|null):Promise<void>{
    if(!fileUrl)return;
    await client.query(
      `INSERT INTO signature_file_deletion_jobs
         (organization_id,document_id,file_url)
       VALUES ($1,NULL,$2)
       ON CONFLICT (organization_id,file_url) DO UPDATE SET
         document_id=NULL,
         status=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN 'queued' ELSE signature_file_deletion_jobs.status END,
         next_attempt_at=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN CURRENT_TIMESTAMP ELSE signature_file_deletion_jobs.next_attempt_at END,
         deleted_at=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.deleted_at END,
         last_error=CASE WHEN signature_file_deletion_jobs.status IN ('deleted','dead_letter')
           THEN NULL ELSE signature_file_deletion_jobs.last_error END,
         updated_at=CURRENT_TIMESTAMP`,
      [organizationId,fileUrl],
    );
  }
  private assertFieldRoles(fields:SignatureTemplateFieldWrite[],roles:SignatureTemplateRoleWrite[]):void{const names=new Set(roles.map(r=>r.roleName.toLowerCase()));for(const field of fields)if(field.roleName!==null&&!names.has(field.roleName.toLowerCase()))throw new SignatureReferenceError('Template field role must belong to the template');}
  private async lockQuota(client:PoolClient,organizationId:number):Promise<void>{const organization=await client.query<{plan:string|null}>('SELECT plan FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);if(!organization.rows[0])throw new SignatureReferenceError('Organization not found');const plan=organization.rows[0].plan??'free';const limit=signatureDocumentLimit(plan);if(Number.isFinite(limit)){const count=await client.query<{total:string}>("SELECT COUNT(*) AS total FROM signature_documents WHERE organization_id=$1 AND created_at>=(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",[organizationId]);if(Number(count.rows[0]?.total??0)>=limit)throw new SignatureQuotaExceededError('Monthly signature document limit reached');}}
  private async selectTemplate(client:PoolClient,organizationId:number,id:number):Promise<SignatureTemplateRow>{const row=await this.selectTemplateOrNull(client,organizationId,id);if(!row)throw new SignatureReferenceError('Signature template not found');return row;}
  private async selectTemplateOrNull(client:PoolClient,organizationId:number,id:number,lock=false):Promise<SignatureTemplateRow|null>{const result=await client.query<SignatureTemplateRow>(`SELECT ${columns} FROM signature_templates t WHERE t.id=$1 AND t.organization_id=$2${lock?' FOR UPDATE':''}`,[id,organizationId]);return result.rows[0]??null;}
  private async selectDocument(client:PoolClient,organizationId:number,id:number):Promise<SignatureDocumentRow>{const result=await client.query<SignatureDocumentRow>(`SELECT ${documentColumns},(SELECT COUNT(*)::int FROM signature_recipients r WHERE r.document_id=d.id AND r.organization_id=d.organization_id) AS recipient_count FROM signature_documents d WHERE d.id=$1 AND d.organization_id=$2`,[id,organizationId]);return result.rows[0];}
  private async selectDocumentOrNull(client:PoolClient,organizationId:number,id:number):Promise<SignatureDocumentRow|null>{return(await this.selectDocument(client,organizationId,id))??null;}
  private async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await this.pool.connect();try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}}

  private async snapshot<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
