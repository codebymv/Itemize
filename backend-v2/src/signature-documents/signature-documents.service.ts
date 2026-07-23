import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { CreateSignatureDocumentInput, SignatureDocumentFilterInput, SignatureFieldInput, SignatureRecipientInput, UpdateSignatureDraftInput } from './signature-document.inputs';
import { SignatureAuditEvent, SignatureDocument, SignatureDocumentDetail, SignatureDocumentPage, SignatureField, SignatureRecipient } from './signature-document.types';
import { SignatureAuditRow, SignatureDocumentRow, SignatureDocumentsRepository, SignatureFieldRow, SignatureFieldWrite, SignatureQuotaExceededError, SignatureRecipientRow, SignatureRecipientWrite, SignatureReferenceError } from './signature-documents.repository';

const FIELD_TYPES=new Set(['signature','initials','text','date','checkbox']);
const ROUTING_MODES=new Set(['parallel','sequential']);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class SignatureDocumentsService {
  constructor(private readonly repository: SignatureDocumentsRepository) {}

  async list(organizationId: number, filter: SignatureDocumentFilterInput = {}, page: PageInput = new PageInput()): Promise<SignatureDocumentPage> {
    await this.access(organizationId); const normalized = this.page(page);
    const result = await this.repository.findPage({ organizationId, status: filter.status, pageSize: normalized.pageSize, offset: normalized.offset });
    return { nodes: result.rows.map((row) => this.document(row)), pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total) };
  }

  async detail(organizationId: number, id: number): Promise<SignatureDocumentDetail> {
    await this.access(organizationId); this.id(id);
    const result = await this.repository.findDetail(organizationId, id);
    if (!result) throw itemizeGraphqlError('Signature document not found', 'NOT_FOUND');
    return { document: this.document(result.document), recipients: result.recipients.map((row) => this.recipient(row)), fields: result.fields.map((row) => this.field(row)), audit: result.audit.map((row) => this.audit(row)) };
  }

  async auditTrail(organizationId: number, id: number): Promise<SignatureAuditEvent[]> {
    await this.access(organizationId); this.id(id);
    const rows = await this.repository.findAudit(organizationId, id);
    if (!rows) throw itemizeGraphqlError('Signature document not found', 'NOT_FOUND');
    return rows.map((row) => this.audit(row));
  }

  async create(organizationId:number,userId:number,input:CreateSignatureDocumentInput):Promise<SignatureDocument>{
    await this.access(organizationId);
    const values={title:this.requiredText(input.title,'title',255),documentNumber:this.optionalText(input.documentNumber,'documentNumber',100),description:this.optionalText(input.description,'description',10000),message:this.optionalText(input.message,'message',50000),expirationDays:this.expiration(input.expirationDays??30),senderName:this.optionalText(input.senderName,'senderName',255),senderEmail:this.optionalEmail(input.senderEmail),timezone:this.optionalText(input.timezone,'timezone',100),locale:this.optionalText(input.locale,'locale',20),routingMode:this.routing(input.routingMode??'parallel'),templateId:input.templateId===undefined||input.templateId===null?null:this.positiveId(input.templateId,'templateId'),...(input.recipients===undefined?{}:{recipients:this.recipients(input.recipients)}),...(input.fields===undefined?{}:{fields:this.fields(input.fields)})};
    try{return this.document(await this.repository.createDraft(organizationId,userId,values));}catch(error){this.writeError(error);}
  }

  async update(organizationId:number,id:number,input:UpdateSignatureDraftInput):Promise<SignatureDocument>{
    await this.access(organizationId);this.id(id);
    if(input.title===null)throw this.bad('title cannot be null','title','NULL_SIGNATURE_TITLE');
    if(input.expirationDays===null)throw this.bad('expirationDays cannot be null','expirationDays','NULL_SIGNATURE_EXPIRATION');
    if(input.routingMode===null)throw this.bad('routingMode cannot be null','routingMode','NULL_SIGNATURE_ROUTING_MODE');
    if(input.recipients===null)throw this.bad('recipients cannot be null','recipients','NULL_SIGNATURE_RECIPIENTS');
    if(input.fields===null)throw this.bad('fields cannot be null','fields','NULL_SIGNATURE_FIELDS');
    const values={...(input.title===undefined?{}:{title:this.requiredText(input.title as string,'title',255)}),...(Object.prototype.hasOwnProperty.call(input,'documentNumber')?{documentNumber:this.optionalText(input.documentNumber,'documentNumber',100)}:{}),...(Object.prototype.hasOwnProperty.call(input,'description')?{description:this.optionalText(input.description,'description',10000)}:{}),...(Object.prototype.hasOwnProperty.call(input,'message')?{message:this.optionalText(input.message,'message',50000)}:{}),...(input.expirationDays===undefined?{}:{expirationDays:this.expiration(input.expirationDays as number)}),...(Object.prototype.hasOwnProperty.call(input,'senderName')?{senderName:this.optionalText(input.senderName,'senderName',255)}:{}),...(Object.prototype.hasOwnProperty.call(input,'senderEmail')?{senderEmail:this.optionalEmail(input.senderEmail)}:{}),...(Object.prototype.hasOwnProperty.call(input,'timezone')?{timezone:this.optionalText(input.timezone,'timezone',100)}:{}),...(Object.prototype.hasOwnProperty.call(input,'locale')?{locale:this.optionalText(input.locale,'locale',20)}:{}),...(input.routingMode===undefined?{}:{routingMode:this.routing(input.routingMode as string)}),...(input.recipients===undefined?{}:{recipients:this.recipients(input.recipients as SignatureRecipientInput[])}),...(input.fields===undefined?{}:{fields:this.fields(input.fields as SignatureFieldInput[])})};
    try{const row=await this.repository.updateDraft(organizationId,id,values);if(!row)throw itemizeGraphqlError('Draft signature document not found','NOT_FOUND');return this.document(row);}catch(error){this.writeError(error);}
  }

  async delete(organizationId:number,id:number):Promise<SignatureDocument>{
    await this.access(organizationId);this.id(id);const result=await this.repository.deleteDraft(organizationId,id);
    if(result.status===null)throw itemizeGraphqlError('Signature document not found','NOT_FOUND');
    if(result.status!=='draft')throw itemizeGraphqlError('Only draft documents can be deleted','CONFLICT',{reason:'SIGNATURE_DOCUMENT_NOT_DRAFT'});
    if(!result.row)throw new Error('Deleted signature draft snapshot is unavailable');
    return this.document(result.row);
  }

  async cancel(organizationId:number,id:number):Promise<SignatureDocument>{
    await this.access(organizationId);this.id(id);
    const result=await this.repository.cancelDocument(organizationId,id);
    if(result.status===null||!result.row)throw itemizeGraphqlError('Signature document not found','NOT_FOUND');
    if(result.status==='completed')throw itemizeGraphqlError('Completed documents cannot be cancelled','CONFLICT',{reason:'SIGNATURE_DOCUMENT_COMPLETED'});
    return this.document(result.row);
  }

  private async access(organizationId: number): Promise<void> { if (!(await this.repository.hasFeatureAccess(organizationId))) throw itemizeGraphqlError('E-Signatures require an upgrade.', 'FORBIDDEN', { reason: 'FEATURE_NOT_AVAILABLE' }); }
  private id(value: number): void { if (!Number.isInteger(value) || value < 1) throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT', { field: 'id' }); }
  private page(input: PageInput): { page: number; pageSize: number; offset: number } { const page=input.page??1,pageSize=input.pageSize??20; if(!Number.isInteger(page)||page<1)throw itemizeGraphqlError('page must be a positive integer','BAD_USER_INPUT',{field:'page'}); if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw itemizeGraphqlError('pageSize must be between 1 and 100','BAD_USER_INPUT',{field:'pageSize'}); return {page,pageSize,offset:(page-1)*pageSize}; }
  private document(row: SignatureDocumentRow): SignatureDocument { return { id:row.id,organizationId:row.organization_id,title:row.title,documentNumber:row.document_number,description:row.description,message:row.message,status:row.status,recipientCount:Number(row.recipient_count),routingMode:row.routing_mode,templateId:row.template_id,expirationDays:row.expiration_days,expiresAt:row.expires_at,senderName:row.sender_name,senderEmail:row.sender_email,createdById:row.created_by,sentAt:row.sent_at,completedAt:row.completed_at,hasFile:row.has_file,hasSignedFile:row.has_signed_file,fileName:row.file_name,fileType:row.file_type,fileSize:row.file_size===null?null:Number(row.file_size),createdAt:row.created_at,updatedAt:row.updated_at }; }
  private recipient(row: SignatureRecipientRow): SignatureRecipient { return { id:row.id,documentId:row.document_id,organizationId:row.organization_id,contactId:row.contact_id,name:row.name,email:row.email,signingOrder:row.signing_order,roleName:row.role_name,routingStatus:row.routing_status,status:row.status,sentAt:row.sent_at,viewedAt:row.viewed_at,signedAt:row.signed_at,declinedAt:row.declined_at,declineReason:row.decline_reason,identityMethod:row.identity_method,identityVerifiedAt:row.identity_verified_at }; }
  private field(row: SignatureFieldRow): SignatureField { return { id:row.id,documentId:row.document_id,recipientId:row.recipient_id,roleName:row.role_name,fieldType:row.field_type,pageNumber:row.page_number,xPosition:Number(row.x_position),yPosition:Number(row.y_position),width:Number(row.width),height:Number(row.height),label:row.label,isRequired:row.is_required,value:row.value,fontSize:row.font_size,fontFamily:row.font_family,textAlign:row.text_align,locked:row.locked }; }
  private audit(row: SignatureAuditRow): SignatureAuditEvent { return { id:row.id,documentId:row.document_id,recipientId:row.recipient_id,eventType:row.event_type,description:row.description,createdAt:row.created_at }; }
  private recipients(input:SignatureRecipientInput[]):SignatureRecipientWrite[]{
    if(input.length>50)throw this.bad('At most 50 recipients are allowed','recipients','SIGNATURE_RECIPIENT_LIMIT');
    const emails=new Set<string>();const roles=new Set<string>();
    return input.map((r,index)=>{const email=String(r.email??'').trim().toLowerCase();if(email.length>255||!EMAIL.test(email))throw this.bad('Recipient email is invalid',`recipients.${index}.email`,'INVALID_SIGNATURE_RECIPIENT_EMAIL');if(emails.has(email))throw this.bad('Recipient emails must be unique',`recipients.${index}.email`,'DUPLICATE_SIGNATURE_RECIPIENT_EMAIL');emails.add(email);const roleName=this.optionalText(r.roleName,`recipients.${index}.roleName`,100);if(roleName!==null){const key=roleName.toLowerCase();if(roles.has(key))throw this.bad('Recipient roles must be unique',`recipients.${index}.roleName`,'DUPLICATE_SIGNATURE_RECIPIENT_ROLE');roles.add(key);}const contactId=r.contactId===undefined||r.contactId===null?null:this.positiveId(r.contactId,`recipients.${index}.contactId`);const signingOrder=r.signingOrder??1;if(!Number.isSafeInteger(signingOrder)||signingOrder<1)throw this.bad('signingOrder must be a positive integer',`recipients.${index}.signingOrder`,'INVALID_SIGNATURE_SIGNING_ORDER');const identityMethod=r.identityMethod??'none';if(identityMethod!=='none')throw this.bad('Only link-based signing is currently supported',`recipients.${index}.identityMethod`,'UNSUPPORTED_SIGNATURE_IDENTITY_METHOD');return{contactId,name:this.optionalText(r.name,`recipients.${index}.name`,255),email,signingOrder,roleName,identityMethod};});
  }
  private fields(input:SignatureFieldInput[]):SignatureFieldWrite[]{
    if(input.length>500)throw this.bad('At most 500 fields are allowed','fields','SIGNATURE_FIELD_LIMIT');
    return input.map((f,index)=>{if(!FIELD_TYPES.has(f.fieldType))throw this.bad('fieldType is invalid',`fields.${index}.fieldType`,'INVALID_SIGNATURE_FIELD_TYPE');if(!Number.isSafeInteger(f.pageNumber)||f.pageNumber<1||f.pageNumber>10000)throw this.bad('pageNumber is invalid',`fields.${index}.pageNumber`,'INVALID_SIGNATURE_FIELD_PAGE');for(const [name,value]of [['xPosition',f.xPosition],['yPosition',f.yPosition],['width',f.width],['height',f.height]] as const)if(!Number.isFinite(value))throw this.bad(`${name} is invalid`,`fields.${index}.${name}`,'INVALID_SIGNATURE_FIELD_GEOMETRY');if(f.xPosition<0||f.yPosition<0||f.width<=0||f.height<=0||f.xPosition+f.width>100||f.yPosition+f.height>100)throw this.bad('Field geometry must fit within the page',`fields.${index}`,'INVALID_SIGNATURE_FIELD_GEOMETRY');const fontSize=f.fontSize===undefined||f.fontSize===null?null:f.fontSize;if(fontSize!==null&&(!Number.isSafeInteger(fontSize)||fontSize<1||fontSize>200))throw this.bad('fontSize is invalid',`fields.${index}.fontSize`,'INVALID_SIGNATURE_FONT_SIZE');return{recipientId:f.recipientId===undefined||f.recipientId===null?null:this.positiveId(f.recipientId,`fields.${index}.recipientId`),roleName:this.optionalText(f.roleName,`fields.${index}.roleName`,100),fieldType:f.fieldType,pageNumber:f.pageNumber,xPosition:f.xPosition,yPosition:f.yPosition,width:f.width,height:f.height,label:this.optionalText(f.label,`fields.${index}.label`,255),isRequired:f.isRequired??true,value:this.optionalText(f.value,`fields.${index}.value`,50000),fontSize,fontFamily:this.optionalText(f.fontFamily,`fields.${index}.fontFamily`,100),textAlign:this.optionalText(f.textAlign,`fields.${index}.textAlign`,10),locked:f.locked??false};});
  }
  private requiredText(value:string,field:string,max:number):string{const normalized=String(value??'').trim();if(!normalized||normalized.length>max)throw this.bad(`${field} must be between 1 and ${max} characters`,field,`INVALID_SIGNATURE_${field.toUpperCase()}`);return normalized;}
  private optionalText(value:string|null|undefined,field:string,max:number):string|null{if(value===undefined||value===null)return null;const normalized=String(value).trim();if(!normalized)return null;if(normalized.length>max)throw this.bad(`${field} is too long`,field,`INVALID_SIGNATURE_${field.toUpperCase()}`);return normalized;}
  private optionalEmail(value:string|null|undefined):string|null{const normalized=this.optionalText(value,'senderEmail',255);if(normalized!==null&&!EMAIL.test(normalized))throw this.bad('senderEmail is invalid','senderEmail','INVALID_SIGNATURE_SENDER_EMAIL');return normalized?.toLowerCase()??null;}
  private expiration(value:number):number{if(!Number.isSafeInteger(value)||value<1||value>3650)throw this.bad('expirationDays must be between 1 and 3650','expirationDays','INVALID_SIGNATURE_EXPIRATION');return value;}
  private routing(value:string):string{if(!ROUTING_MODES.has(value))throw this.bad('routingMode is invalid','routingMode','INVALID_SIGNATURE_ROUTING_MODE');return value;}
  private positiveId(value:number,field:string):number{if(!Number.isSafeInteger(value)||value<1)throw this.bad(`${field} must be a positive integer`,field,'INVALID_SIGNATURE_REFERENCE');return value;}
  private bad(message:string,field:string,reason:string){return itemizeGraphqlError(message,'BAD_USER_INPUT',{field,reason});}
  private writeError(error:unknown):never{if(error instanceof SignatureQuotaExceededError)throw itemizeGraphqlError(error.message,'FORBIDDEN',{reason:'SIGNATURE_MONTHLY_LIMIT'});if(error instanceof SignatureReferenceError)throw itemizeGraphqlError(error.message,'BAD_USER_INPUT',{reason:'INVALID_SIGNATURE_REFERENCE'});throw error;}
}
