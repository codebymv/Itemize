import { getApiUrl } from '@/lib/api';
import type {
  SignatureDocument,
  SignatureDocumentDetails,
  SignatureField,
  SignatureRecipient,
  SignatureStatus,
  SignatureTemplate,
  SignatureTemplateField,
  SignatureTemplateRole,
} from './signaturesApi';
import { graphqlRequest } from './graphqlClient';

type GqlDocumentStatus =
  | 'DRAFT'
  | 'SENT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

type GqlDocument = {
  id: number;
  organizationId: number;
  title: string;
  documentNumber: string | null;
  description: string | null;
  message: string | null;
  status: GqlDocumentStatus;
  recipientCount: number;
  routingMode: 'parallel' | 'sequential';
  templateId: number | null;
  expirationDays: number;
  expiresAt: string | null;
  senderName: string | null;
  senderEmail: string | null;
  createdById: number | null;
  sentAt: string | null;
  completedAt: string | null;
  hasFile: boolean;
  hasSignedFile: boolean;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
};

type GqlRecipient = {
  id: number;
  documentId: number;
  organizationId: number;
  contactId: number | null;
  name: string | null;
  email: string;
  signingOrder: number;
  roleName: string | null;
  routingStatus: 'locked' | 'active';
  status: SignatureRecipient['status'];
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  identityMethod: SignatureRecipient['identity_method'];
  identityVerifiedAt: string | null;
};

type GqlField = {
  id: number;
  documentId: number;
  recipientId: number | null;
  roleName: string | null;
  fieldType: SignatureField['field_type'];
  pageNumber: number;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  label: string | null;
  isRequired: boolean;
  value: string | null;
  fontSize: number | null;
  fontFamily: string | null;
  textAlign: string | null;
  locked: boolean;
};

type GqlAudit = {
  id: number;
  documentId: number;
  recipientId: number | null;
  eventType: string;
  description: string | null;
  createdAt: string;
};

type GqlTemplate = {
  id: number;
  organizationId: number;
  title: string;
  description: string | null;
  message: string | null;
  hasFile: boolean;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

type GqlTemplateRole = {
  id: number;
  templateId: number;
  roleName: string;
  signingOrder: number;
};

type GqlTemplateField = {
  id: number;
  templateId: number;
  roleName: string | null;
  fieldType: SignatureTemplateField['field_type'];
  pageNumber: number;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  label: string | null;
  isRequired: boolean;
  fontSize: number | null;
  fontFamily: string | null;
  textAlign: string | null;
  locked: boolean;
};

const documentFields = `id organizationId title documentNumber description message
  status recipientCount routingMode templateId expirationDays expiresAt senderName
  senderEmail createdById sentAt completedAt hasFile hasSignedFile fileName fileType
  fileSize createdAt updatedAt`;
const recipientFields = `id documentId organizationId contactId name email signingOrder
  roleName routingStatus status sentAt viewedAt signedAt declinedAt declineReason
  identityMethod identityVerifiedAt`;
const fieldFields = `id documentId recipientId roleName fieldType pageNumber xPosition
  yPosition width height label isRequired value fontSize fontFamily textAlign locked`;
const auditFields = 'id documentId recipientId eventType description createdAt';
const templateFields = `id organizationId title description message hasFile fileName
  fileType fileSize createdById createdAt updatedAt`;

const mapDocument = (document: GqlDocument): SignatureDocument => ({
  id: document.id,
  organization_id: document.organizationId,
  title: document.title,
  ...(document.documentNumber === null ? {} : { document_number: document.documentNumber }),
  ...(document.description === null ? {} : { description: document.description }),
  ...(document.message === null ? {} : { message: document.message }),
  status: document.status.toLowerCase() as SignatureStatus,
  recipient_count: document.recipientCount,
  routing_mode: document.routingMode,
  ...(document.templateId === null ? {} : { template_id: document.templateId }),
  expiration_days: document.expirationDays,
  ...(document.expiresAt === null ? {} : { expires_at: document.expiresAt }),
  ...(document.senderName === null ? {} : { sender_name: document.senderName }),
  ...(document.senderEmail === null ? {} : { sender_email: document.senderEmail }),
  ...(document.createdById === null ? {} : { created_by: document.createdById }),
  ...(document.sentAt === null ? {} : { sent_at: document.sentAt }),
  ...(document.completedAt === null ? {} : { completed_at: document.completedAt }),
  ...(document.hasFile
    ? { file_url: `${getApiUrl()}/api/signatures/documents/${document.id}/file` }
    : {}),
  ...(document.hasSignedFile
    ? { signed_file_url: `${getApiUrl()}/api/signatures/documents/${document.id}/download` }
    : {}),
  ...(document.fileName === null ? {} : { file_name: document.fileName }),
  created_at: document.createdAt,
  updated_at: document.updatedAt,
});

const mapRecipient = (recipient: GqlRecipient): SignatureRecipient => ({
  id: recipient.id,
  document_id: recipient.documentId,
  organization_id: recipient.organizationId,
  ...(recipient.contactId === null ? {} : { contact_id: recipient.contactId }),
  ...(recipient.name === null ? {} : { name: recipient.name }),
  email: recipient.email,
  signing_order: recipient.signingOrder,
  ...(recipient.roleName === null ? {} : { role_name: recipient.roleName }),
  routing_status: recipient.routingStatus,
  status: recipient.status,
  ...(recipient.sentAt === null ? {} : { sent_at: recipient.sentAt }),
  ...(recipient.viewedAt === null ? {} : { viewed_at: recipient.viewedAt }),
  ...(recipient.signedAt === null ? {} : { signed_at: recipient.signedAt }),
  ...(recipient.declinedAt === null ? {} : { declined_at: recipient.declinedAt }),
  ...(recipient.declineReason === null ? {} : { decline_reason: recipient.declineReason }),
  identity_method: recipient.identityMethod,
  ...(recipient.identityVerifiedAt === null
    ? {}
    : { identity_verified_at: recipient.identityVerifiedAt }),
});

const mapField = (field: GqlField): SignatureField => ({
  id: field.id,
  document_id: field.documentId,
  ...(field.recipientId === null ? {} : { recipient_id: field.recipientId }),
  ...(field.roleName === null ? {} : { role_name: field.roleName }),
  field_type: field.fieldType,
  page_number: field.pageNumber,
  x_position: field.xPosition,
  y_position: field.yPosition,
  width: field.width,
  height: field.height,
  ...(field.label === null ? {} : { label: field.label }),
  is_required: field.isRequired,
  ...(field.value === null ? {} : { value: field.value }),
  ...(field.fontSize === null ? {} : { font_size: field.fontSize }),
  ...(field.fontFamily === null ? {} : { font_family: field.fontFamily }),
  ...(field.textAlign === null ? {} : { text_align: field.textAlign }),
  locked: field.locked,
});

const mapAudit = (event: GqlAudit): SignatureDocumentDetails['audit'][number] => ({
  id: event.id,
  document_id: event.documentId,
  ...(event.recipientId === null ? {} : { recipient_id: event.recipientId }),
  event_type: event.eventType,
  ...(event.description === null ? {} : { description: event.description }),
  created_at: event.createdAt,
});

const mapTemplate = (template: GqlTemplate): SignatureTemplate => ({
  id: template.id,
  organization_id: template.organizationId,
  title: template.title,
  ...(template.description === null ? {} : { description: template.description }),
  ...(template.message === null ? {} : { message: template.message }),
  ...(template.hasFile
    ? { file_url: `${getApiUrl()}/api/signatures/templates/${template.id}/file` }
    : {}),
  ...(template.fileName === null ? {} : { file_name: template.fileName }),
  ...(template.fileType === null ? {} : { file_type: template.fileType }),
  created_at: template.createdAt,
});

export const listSignatureDocumentsViaGraphql = async (
  params: { status?: SignatureStatus; page?: number; limit?: number } = {},
  organizationId?: number,
) => {
  const data = await graphqlRequest<
    {
      signatureDocuments: {
        nodes: GqlDocument[];
        pageInfo: {
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
          hasNextPage: boolean;
          hasPreviousPage: boolean;
        };
      };
    },
    { filter: { status?: GqlDocumentStatus }; page: { page: number; pageSize: number } }
  >(
    `query SignatureDocumentReads($filter:SignatureDocumentFilterInput,$page:PageInput){
      signatureDocuments(filter:$filter,page:$page){
        nodes{${documentFields}}
        pageInfo{page pageSize total totalPages hasNextPage hasPreviousPage}
      }
    }`,
    {
      filter: params.status
        ? { status: params.status.toUpperCase() as GqlDocumentStatus }
        : {},
      page: { page: params.page ?? 1, pageSize: params.limit ?? 20 },
    },
    organizationId,
  );

  return {
    items: data.signatureDocuments.nodes.map(mapDocument),
    pagination: {
      page: data.signatureDocuments.pageInfo.page,
      limit: data.signatureDocuments.pageInfo.pageSize,
      total: data.signatureDocuments.pageInfo.total,
      totalPages: data.signatureDocuments.pageInfo.totalPages,
    },
  };
};

export const getSignatureDocumentViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<SignatureDocumentDetails> => {
  const data = await graphqlRequest<
    {
      signatureDocument: {
        document: GqlDocument;
        recipients: GqlRecipient[];
        fields: GqlField[];
        audit: GqlAudit[];
      };
    },
    { id: number }
  >(
    `query SignatureDocumentRead($id:Int!){
      signatureDocument(id:$id){
        document{${documentFields}}
        recipients{${recipientFields}}
        fields{${fieldFields}}
        audit{${auditFields}}
      }
    }`,
    { id },
    organizationId,
  );

  return {
    document: mapDocument(data.signatureDocument.document),
    recipients: data.signatureDocument.recipients.map(mapRecipient),
    fields: data.signatureDocument.fields.map(mapField),
    audit: data.signatureDocument.audit.map(mapAudit),
  };
};

export const getSignatureAuditViaGraphql = async (
  id: number,
  organizationId?: number,
) => {
  const data = await graphqlRequest<{ signatureAuditTrail: GqlAudit[] }, { id: number }>(
    `query SignatureAuditTrail($id:Int!){signatureAuditTrail(id:$id){${auditFields}}}`,
    { id },
    organizationId,
  );
  return data.signatureAuditTrail.map(mapAudit);
};

export const listSignatureTemplatesViaGraphql = async (
  organizationId?: number,
): Promise<SignatureTemplate[]> => {
  const data = await graphqlRequest<
    { signatureTemplates: GqlTemplate[] },
    Record<string, never>
  >(
    `query SignatureTemplateReads{signatureTemplates{${templateFields}}}`,
    {},
    organizationId,
  );
  return data.signatureTemplates.map(mapTemplate);
};

export const getSignatureTemplateViaGraphql = async (
  id: number,
  organizationId?: number,
) => {
  const data = await graphqlRequest<
    {
      signatureTemplate: {
        template: GqlTemplate;
        roles: GqlTemplateRole[];
        fields: GqlTemplateField[];
      };
    },
    { id: number }
  >(
    `query SignatureTemplateRead($id:Int!){
      signatureTemplate(id:$id){
        template{${templateFields}}
        roles{id templateId roleName signingOrder}
        fields{id templateId roleName fieldType pageNumber xPosition yPosition
          width height label isRequired fontSize fontFamily textAlign locked}
      }
    }`,
    { id },
    organizationId,
  );

  return {
    template: mapTemplate(data.signatureTemplate.template),
    roles: data.signatureTemplate.roles.map((role): SignatureTemplateRole => ({
      id: role.id,
      template_id: role.templateId,
      role_name: role.roleName,
      signing_order: role.signingOrder,
    })),
    fields: data.signatureTemplate.fields.map((field): SignatureTemplateField => ({
      id: field.id,
      template_id: field.templateId,
      ...(field.roleName === null ? {} : { role_name: field.roleName }),
      field_type: field.fieldType,
      page_number: field.pageNumber,
      x_position: field.xPosition,
      y_position: field.yPosition,
      width: field.width,
      height: field.height,
      ...(field.label === null ? {} : { label: field.label }),
      is_required: field.isRequired,
      ...(field.fontSize === null ? {} : { font_size: field.fontSize }),
      ...(field.fontFamily === null ? {} : { font_family: field.fontFamily }),
      ...(field.textAlign === null ? {} : { text_align: field.textAlign }),
      locked: field.locked,
    })),
  };
};
