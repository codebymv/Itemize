import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { SignatureDocumentFilterInput } from './signature-document.inputs';
import { SignatureAuditEvent, SignatureDocument, SignatureDocumentDetail, SignatureDocumentPage, SignatureField, SignatureRecipient } from './signature-document.types';
import { SignatureAuditRow, SignatureDocumentRow, SignatureDocumentsRepository, SignatureFieldRow, SignatureRecipientRow } from './signature-documents.repository';

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

  private async access(organizationId: number): Promise<void> { if (!(await this.repository.hasFeatureAccess(organizationId))) throw itemizeGraphqlError('E-Signatures require an upgrade.', 'FORBIDDEN', { reason: 'FEATURE_NOT_AVAILABLE' }); }
  private id(value: number): void { if (!Number.isInteger(value) || value < 1) throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT', { field: 'id' }); }
  private page(input: PageInput): { page: number; pageSize: number; offset: number } { const page=input.page??1,pageSize=input.pageSize??20; if(!Number.isInteger(page)||page<1)throw itemizeGraphqlError('page must be a positive integer','BAD_USER_INPUT',{field:'page'}); if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw itemizeGraphqlError('pageSize must be between 1 and 100','BAD_USER_INPUT',{field:'pageSize'}); return {page,pageSize,offset:(page-1)*pageSize}; }
  private document(row: SignatureDocumentRow): SignatureDocument { return { id:row.id,organizationId:row.organization_id,title:row.title,documentNumber:row.document_number,description:row.description,message:row.message,status:row.status,recipientCount:Number(row.recipient_count),routingMode:row.routing_mode,templateId:row.template_id,expirationDays:row.expiration_days,expiresAt:row.expires_at,senderName:row.sender_name,senderEmail:row.sender_email,createdById:row.created_by,sentAt:row.sent_at,completedAt:row.completed_at,hasFile:row.has_file,hasSignedFile:row.has_signed_file,fileName:row.file_name,fileType:row.file_type,fileSize:row.file_size===null?null:Number(row.file_size),createdAt:row.created_at,updatedAt:row.updated_at }; }
  private recipient(row: SignatureRecipientRow): SignatureRecipient { return { id:row.id,documentId:row.document_id,organizationId:row.organization_id,contactId:row.contact_id,name:row.name,email:row.email,signingOrder:row.signing_order,roleName:row.role_name,routingStatus:row.routing_status,status:row.status,sentAt:row.sent_at,viewedAt:row.viewed_at,signedAt:row.signed_at,declinedAt:row.declined_at,declineReason:row.decline_reason,identityMethod:row.identity_method,identityVerifiedAt:row.identity_verified_at }; }
  private field(row: SignatureFieldRow): SignatureField { return { id:row.id,documentId:row.document_id,recipientId:row.recipient_id,roleName:row.role_name,fieldType:row.field_type,pageNumber:row.page_number,xPosition:Number(row.x_position),yPosition:Number(row.y_position),width:Number(row.width),height:Number(row.height),label:row.label,isRequired:row.is_required,value:row.value,fontSize:row.font_size,fontFamily:row.font_family,textAlign:row.text_align,locked:row.locked }; }
  private audit(row: SignatureAuditRow): SignatureAuditEvent { return { id:row.id,documentId:row.document_id,recipientId:row.recipient_id,eventType:row.event_type,description:row.description,createdAt:row.created_at }; }
}
