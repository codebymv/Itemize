import { getApiUrl } from '@/lib/api';
import type {
  SignatureDocument,
  SignatureDocumentDetails,
  SignatureDocumentListParams,
  SignatureDocumentStats,
  SignatureEmailPreviewRequest,
  SignatureEmailPreviewResponse,
  SignatureField,
  SignatureRecipient,
  SignatureStatus,
  SignatureTemplate,
  SignatureTemplateField,
  SignatureTemplateRole,
} from './signaturesApi';
import {
  GraphqlRequestError,
  graphqlMutationRequest,
  graphqlRequest,
} from './graphqlClient';

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
  pageCount?: number | null;
  deliveryState?: SignatureDocument['delivery_state'] | null;
  completionState?: SignatureDocument['completion_state'] | null;
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
  deliveryState?: SignatureRecipient['delivery_state'] | null;
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
  pageCount?: number | null;
  isReady?: boolean;
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
  fileSize pageCount deliveryState completionState createdAt updatedAt`;
const legacyDocumentFields = `id organizationId title documentNumber description message
  status recipientCount routingMode templateId expirationDays expiresAt senderName
  senderEmail createdById sentAt completedAt hasFile hasSignedFile fileName fileType
  fileSize createdAt updatedAt`;
const recipientFields = `id documentId organizationId contactId name email signingOrder
  roleName routingStatus status sentAt viewedAt signedAt declinedAt declineReason
  identityMethod identityVerifiedAt deliveryState`;
const legacyRecipientFields = `id documentId organizationId contactId name email signingOrder
  roleName routingStatus status sentAt viewedAt signedAt declinedAt declineReason
  identityMethod identityVerifiedAt`;
const fieldFields = `id documentId recipientId roleName fieldType pageNumber xPosition
  yPosition width height label isRequired value fontSize fontFamily textAlign locked`;
const auditFields = 'id documentId recipientId eventType description createdAt';
const templateFields = `id organizationId title description message hasFile fileName
  fileType fileSize pageCount isReady createdById createdAt updatedAt`;
const legacyTemplateFields = `id organizationId title description message hasFile fileName
  fileType fileSize createdById createdAt updatedAt`;

const isReliabilitySchemaMismatch = (error: unknown): boolean =>
  error instanceof GraphqlRequestError
  && /Cannot query field "(?:pageCount|deliveryState|completionState|isReady)"/.test(error.message);

const isDocumentQueueSchemaMismatch = (error: unknown): boolean =>
  error instanceof GraphqlRequestError
  && (
    /Cannot query field "stats"/.test(error.message)
    || /Field "(?:statuses|search)" is not defined by type "SignatureDocumentFilterInput"/.test(error.message)
  );

type ReliabilityScope = 'document' | 'template';
type ReliabilityCapability = 'unknown' | 'current' | 'legacy';

const reliabilityCapabilities: Record<ReliabilityScope, ReliabilityCapability> = {
  document: 'unknown',
  template: 'unknown',
};
let documentQueueCapability: ReliabilityCapability = 'unknown';

export const resetSignatureReliabilityCapabilities = (): void => {
  reliabilityCapabilities.document = 'unknown';
  reliabilityCapabilities.template = 'unknown';
  documentQueueCapability = 'unknown';
};

const withLegacyReliabilitySelection = async <T>(
  currentRequest: () => Promise<T>,
  legacyRequest: () => Promise<T>,
  scope: ReliabilityScope = 'document',
): Promise<T> => {
  if (reliabilityCapabilities[scope] === 'legacy') return legacyRequest();

  try {
    const result = await currentRequest();
    reliabilityCapabilities[scope] = 'current';
    return result;
  } catch (error) {
    if (!isReliabilitySchemaMismatch(error)) throw error;
    reliabilityCapabilities[scope] = 'legacy';
    return legacyRequest();
  }
};

const mutationWithLegacyReliabilitySelection = <TData, TVariables extends object>(
  query: (fields: string) => string,
  variables: TVariables,
  organizationId?: number,
  fields = documentFields,
  legacyFields = legacyDocumentFields,
  scope: ReliabilityScope = 'document',
): Promise<TData> => withLegacyReliabilitySelection(
  () => graphqlMutationRequest<TData, TVariables>(query(fields), variables, organizationId),
  () => graphqlMutationRequest<TData, TVariables>(query(legacyFields), variables, organizationId),
  scope,
);

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
  ...(document.pageCount == null ? {} : { page_count: document.pageCount }),
  ...(document.deliveryState == null ? {} : { delivery_state: document.deliveryState }),
  ...(document.completionState == null ? {} : { completion_state: document.completionState }),
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
  ...(recipient.deliveryState == null ? {} : { delivery_state: recipient.deliveryState }),
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
  ...(template.pageCount == null ? {} : { page_count: template.pageCount }),
  is_ready: template.isReady ?? template.hasFile,
  created_at: template.createdAt,
});

type DocumentMutationPayload = Partial<SignatureDocument> & {
  recipients?: SignatureRecipient[];
  fields?: SignatureField[];
};

const recipientInput = (recipient: SignatureRecipient) => ({
  contactId: recipient.contact_id ?? null,
  name: recipient.name ?? null,
  email: recipient.email,
  signingOrder: recipient.signing_order ?? 1,
  roleName: recipient.role_name ?? null,
  identityMethod: recipient.identity_method ?? 'none',
});

const fieldInput = (field: SignatureField) => ({
  recipientId: field.recipient_id ?? null,
  roleName: field.role_name ?? null,
  fieldType: field.field_type,
  pageNumber: field.page_number,
  xPosition: field.x_position,
  yPosition: field.y_position,
  width: field.width,
  height: field.height,
  label: field.label ?? null,
  isRequired: field.is_required ?? true,
  value: field.value ?? null,
  fontSize: field.font_size ?? null,
  fontFamily: field.font_family ?? null,
  textAlign: field.text_align ?? null,
  locked: field.locked ?? false,
});

const documentInput = (payload: DocumentMutationPayload) => ({
  ...(payload.title === undefined ? {} : { title: payload.title }),
  ...(payload.document_number === undefined ? {} : { documentNumber: payload.document_number }),
  ...(payload.description === undefined ? {} : { description: payload.description }),
  ...(payload.message === undefined ? {} : { message: payload.message }),
  ...(payload.expiration_days === undefined ? {} : { expirationDays: payload.expiration_days }),
  ...(payload.sender_name === undefined ? {} : { senderName: payload.sender_name }),
  ...(payload.sender_email === undefined ? {} : { senderEmail: payload.sender_email }),
  ...(payload.routing_mode === undefined ? {} : { routingMode: payload.routing_mode }),
  ...(payload.template_id === undefined ? {} : { templateId: payload.template_id }),
  ...(payload.recipients === undefined ? {} : { recipients: payload.recipients.map(recipientInput) }),
  ...(payload.fields === undefined ? {} : { fields: payload.fields.map(fieldInput) }),
});

const templateRoleInput = (role: SignatureTemplateRole) => ({
  roleName: role.role_name,
  signingOrder: role.signing_order ?? 1,
});

const templateFieldInput = (field: SignatureTemplateField) => ({
  roleName: field.role_name ?? null,
  fieldType: field.field_type,
  pageNumber: field.page_number,
  xPosition: field.x_position,
  yPosition: field.y_position,
  width: field.width,
  height: field.height,
  label: field.label ?? null,
  isRequired: field.is_required ?? true,
  fontSize: field.font_size ?? null,
  fontFamily: field.font_family ?? null,
  textAlign: field.text_align ?? null,
  locked: field.locked ?? false,
});

const templateInput = (payload: Partial<SignatureTemplate> & { roles?: SignatureTemplateRole[]; fields?: SignatureTemplateField[] }) => ({
  ...(payload.title === undefined ? {} : { title: payload.title }),
  ...(payload.description === undefined ? {} : { description: payload.description }),
  ...(payload.message === undefined ? {} : { message: payload.message }),
  ...(payload.roles === undefined ? {} : { roles: payload.roles.map(templateRoleInput) }),
  ...(payload.fields === undefined ? {} : { fields: payload.fields.map(templateFieldInput) }),
});

export const listSignatureDocumentsViaGraphql = async (
  params: SignatureDocumentListParams = {},
  organizationId?: number,
  signal?: AbortSignal,
) => {
  type DocumentListData = {
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
      stats?: SignatureDocumentStats;
    };
  };
  type DocumentListVariables = {
    filter: { status?: GqlDocumentStatus; statuses?: GqlDocumentStatus[]; search?: string };
    page: { page: number; pageSize: number };
  };
  const normalizedSearch = params.search?.trim();
  const variables: DocumentListVariables = {
    filter: {
      ...(params.status
        ? { status: params.status.toUpperCase() as GqlDocumentStatus }
        : {}),
      ...(params.statuses?.length
        ? { statuses: params.statuses.map(status => status.toUpperCase() as GqlDocumentStatus) }
        : {}),
      ...(normalizedSearch ? { search: normalizedSearch } : {}),
    },
    page: { page: params.page ?? 1, pageSize: params.limit ?? 20 },
  };
  const query = (fields: string, includeStats = true) =>
    `query SignatureDocumentReads($filter:SignatureDocumentFilterInput,$page:PageInput){
      signatureDocuments(filter:$filter,page:$page){
        nodes{${fields}}
        pageInfo{page pageSize total totalPages hasNextPage hasPreviousPage}
        ${includeStats ? 'stats{total invalid draft active completed}' : ''}
      }
    }`;
  const statsFor = (documents: SignatureDocument[]) => documents.reduce<SignatureDocumentStats>((totals, document) => {
    totals.total += 1;
    if (document.status === 'draft') totals.draft += 1;
    else if (document.status === 'completed') totals.completed += 1;
    else if (document.status === 'cancelled' || document.status === 'expired') totals.invalid += 1;
    else totals.active += 1;
    return totals;
  }, { total: 0, invalid: 0, draft: 0, active: 0, completed: 0 });

  const currentRequest = () => withLegacyReliabilitySelection(
    () => graphqlRequest<DocumentListData, DocumentListVariables>(
      query(documentFields), variables, organizationId, signal,
    ),
    () => graphqlRequest<DocumentListData, DocumentListVariables>(
      query(legacyDocumentFields), variables, organizationId, signal,
    ),
  );

  if (documentQueueCapability !== 'legacy') {
    try {
      const data = await currentRequest();
      documentQueueCapability = 'current';
      return {
        items: data.signatureDocuments.nodes.map(mapDocument),
        pagination: {
          page: data.signatureDocuments.pageInfo.page,
          limit: data.signatureDocuments.pageInfo.pageSize,
          total: data.signatureDocuments.pageInfo.total,
          totalPages: data.signatureDocuments.pageInfo.totalPages,
        },
        stats: data.signatureDocuments.stats ?? { total: 0, invalid: 0, draft: 0, active: 0, completed: 0 },
      };
    } catch (error) {
      if (!isDocumentQueueSchemaMismatch(error)) throw error;
      documentQueueCapability = 'legacy';
    }
  }

  const legacyPage = (page: number) => {
    const legacyVariables: DocumentListVariables = {
      filter: {},
      page: { page, pageSize: 100 },
    };
    return withLegacyReliabilitySelection(
      () => graphqlRequest<DocumentListData, DocumentListVariables>(
        query(documentFields, false), legacyVariables, organizationId, signal,
      ),
      () => graphqlRequest<DocumentListData, DocumentListVariables>(
        query(legacyDocumentFields, false), legacyVariables, organizationId, signal,
      ),
    );
  };
  const first = await legacyPage(1);
  const legacyDocuments = first.signatureDocuments.nodes.map(mapDocument);
  for (let legacyPageNumber = 2; legacyPageNumber <= first.signatureDocuments.pageInfo.totalPages; legacyPageNumber += 1) {
    const next = await legacyPage(legacyPageNumber);
    legacyDocuments.push(...next.signatureDocuments.nodes.map(mapDocument));
  }
  const requestedStatuses = params.statuses?.length
    ? params.statuses
    : params.status
      ? [params.status]
      : undefined;
  const normalizedLegacySearch = normalizedSearch?.toLowerCase();
  const filtered = legacyDocuments.filter(document => {
    const matchesStatus = !requestedStatuses?.length || requestedStatuses.includes(document.status);
    const matchesSearch = !normalizedLegacySearch || [
      document.title,
      document.document_number,
      document.description,
      document.message,
    ].some(value => value?.toLowerCase().includes(normalizedLegacySearch));
    return matchesStatus && matchesSearch;
  });
  const requestedPage = params.page ?? 1;
  const requestedLimit = params.limit ?? 20;
  const start = (requestedPage - 1) * requestedLimit;

  return {
    items: filtered.slice(start, start + requestedLimit),
    pagination: {
      page: requestedPage,
      limit: requestedLimit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / requestedLimit),
    },
    stats: statsFor(legacyDocuments),
  };
};

export const getSignatureDocumentViaGraphql = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<SignatureDocumentDetails> => {
  type DocumentDetailData = {
    signatureDocument: {
      document: GqlDocument;
      recipients: GqlRecipient[];
      fields: GqlField[];
      audit: GqlAudit[];
    };
  };
  const query = (documentSelection: string, recipientSelection: string) =>
    `query SignatureDocumentRead($id:Int!){
      signatureDocument(id:$id){
        document{${documentSelection}}
        recipients{${recipientSelection}}
        fields{${fieldFields}}
        audit{${auditFields}}
      }
    }`;
  const data = await withLegacyReliabilitySelection(
    () => graphqlRequest<DocumentDetailData, { id: number }>(
      query(documentFields, recipientFields),
      { id },
      organizationId,
      signal,
    ),
    () => graphqlRequest<DocumentDetailData, { id: number }>(
      query(legacyDocumentFields, legacyRecipientFields),
      { id },
      organizationId,
      signal,
    ),
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
  signal?: AbortSignal,
): Promise<SignatureTemplate[]> => {
  const query = (fields: string) =>
    `query SignatureTemplateReads{signatureTemplates{${fields}}}`;
  const data = await withLegacyReliabilitySelection(
    () => graphqlRequest<{ signatureTemplates: GqlTemplate[] }, Record<string, never>>(
      query(templateFields),
      {},
      organizationId,
      signal,
    ),
    () => graphqlRequest<{ signatureTemplates: GqlTemplate[] }, Record<string, never>>(
      query(legacyTemplateFields),
      {},
      organizationId,
      signal,
    ),
    'template',
  );
  return data.signatureTemplates.map(mapTemplate);
};

export const getSignatureTemplateViaGraphql = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
) => {
  type TemplateDetailData = {
    signatureTemplate: {
      template: GqlTemplate;
      roles: GqlTemplateRole[];
      fields: GqlTemplateField[];
    };
  };
  const query = (fields: string) =>
    `query SignatureTemplateRead($id:Int!){
      signatureTemplate(id:$id){
        template{${fields}}
        roles{id templateId roleName signingOrder}
        fields{id templateId roleName fieldType pageNumber xPosition yPosition
          width height label isRequired fontSize fontFamily textAlign locked}
      }
    }`;
  const data = await withLegacyReliabilitySelection(
    () => graphqlRequest<TemplateDetailData, { id: number }>(
      query(templateFields),
      { id },
      organizationId,
      signal,
    ),
    () => graphqlRequest<TemplateDetailData, { id: number }>(
      query(legacyTemplateFields),
      { id },
      organizationId,
      signal,
    ),
    'template',
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

export const createSignatureDocumentViaGraphql = async (payload: DocumentMutationPayload, idempotencyKey: string, organizationId?: number): Promise<SignatureDocument> => {
  const data = await mutationWithLegacyReliabilitySelection<{createSignatureDocument:GqlDocument},{input:ReturnType<typeof documentInput>;idempotencyKey:string}>(fields=>`mutation CreateSignatureDocument($input:CreateSignatureDocumentInput!,$idempotencyKey:String!){createSignatureDocument(input:$input,idempotencyKey:$idempotencyKey){${fields}}}`,{input:documentInput(payload),idempotencyKey},organizationId);
  return mapDocument(data.createSignatureDocument);
};

export const updateSignatureDocumentViaGraphql = async (id:number,payload:DocumentMutationPayload,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{updateSignatureDraft:GqlDocument},{id:number;input:ReturnType<typeof documentInput>}>(fields=>`mutation UpdateSignatureDraft($id:Int!,$input:UpdateSignatureDraftInput!){updateSignatureDraft(id:$id,input:$input){${fields}}}`,{id,input:documentInput(payload)},organizationId);
  return mapDocument(data.updateSignatureDraft);
};

export const deleteSignatureDocumentViaGraphql=async(id:number,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{deleteSignatureDraft:GqlDocument},{id:number}>(fields=>`mutation DeleteSignatureDraft($id:Int!){deleteSignatureDraft(id:$id){${fields}}}`,{id},organizationId);
  return mapDocument(data.deleteSignatureDraft);
};

export const removeSignatureDocumentFileViaGraphql=async(id:number,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{removeSignatureDraftPdf:GqlDocument},{id:number}>(fields=>`mutation RemoveSignatureDraftPdf($id:Int!){removeSignatureDraftPdf(id:$id){${fields}}}`,{id},organizationId);
  return mapDocument(data.removeSignatureDraftPdf);
};

export const cancelSignatureDocumentViaGraphql=async(id:number,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{cancelSignatureDocument:GqlDocument},{id:number}>(fields=>`mutation CancelSignatureDocument($id:Int!){cancelSignatureDocument(id:$id){${fields}}}`,{id},organizationId);
  return mapDocument(data.cancelSignatureDocument);
};

export const sendSignatureDocumentViaGraphql=async(id:number,idempotencyKey:string,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{sendSignatureDocument:GqlDocument},{id:number;idempotencyKey:string}>(fields=>`mutation SendSignatureDocument($id:Int!,$idempotencyKey:String!){sendSignatureDocument(id:$id,idempotencyKey:$idempotencyKey){${fields}}}`,{id,idempotencyKey},organizationId);
  return mapDocument(data.sendSignatureDocument);
};

export const remindSignatureDocumentViaGraphql=async(id:number,idempotencyKey:string,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{sendSignatureReminder:GqlDocument},{id:number;idempotencyKey:string}>(fields=>`mutation SendSignatureReminder($id:Int!,$idempotencyKey:String!){sendSignatureReminder(id:$id,idempotencyKey:$idempotencyKey){${fields}}}`,{id,idempotencyKey},organizationId);
  return mapDocument(data.sendSignatureReminder);
};

export const retrySignatureDocumentViaGraphql=async(id:number,idempotencyKey:string,organizationId?:number):Promise<SignatureDocument>=>{
  const data=await mutationWithLegacyReliabilitySelection<{retrySignatureDocument:GqlDocument},{id:number;idempotencyKey:string}>(fields=>`mutation RetrySignatureDocument($id:Int!,$idempotencyKey:String!){retrySignatureDocument(id:$id,idempotencyKey:$idempotencyKey){${fields}}}`,{id,idempotencyKey},organizationId);
  return mapDocument(data.retrySignatureDocument);
};

export const scheduleSignatureRemindersViaGraphql=async(id:number,days=2,organizationId?:number):Promise<{scheduledAt:string;reminderCount:number}>=>{
  const data=await graphqlMutationRequest<{scheduleSignatureReminders:{scheduledAt:string;reminderCount:number}},{id:number;days:number}>(`mutation ScheduleSignatureReminders($id:Int!,$days:Int!){scheduleSignatureReminders(id:$id,days:$days){scheduledAt reminderCount}}`,{id,days},organizationId);
  return data.scheduleSignatureReminders;
};

export const getSignatureEmailPreviewViaGraphql=async(input:SignatureEmailPreviewRequest,organizationId?:number):Promise<SignatureEmailPreviewResponse>=>{
  const variables={input:{message:input.message,...(input.documentTitle===undefined?{}:{documentTitle:input.documentTitle}),...(input.senderName===undefined?{}:{senderName:input.senderName}),...(input.senderEmail===undefined?{}:{senderEmail:input.senderEmail}),...(input.recipientName===undefined?{}:{recipientName:input.recipientName}),...(input.expiresAt===undefined?{}:{expiresAt:input.expiresAt})}};
  const data=await graphqlRequest<{previewSignatureEmail:SignatureEmailPreviewResponse},typeof variables>(`query SignatureEmailPreview($input:SignatureEmailPreviewInput!){previewSignatureEmail(input:$input){html subject}}`,variables,organizationId);
  return data.previewSignatureEmail;
};

export const createSignatureTemplateViaGraphql=async(payload:Partial<SignatureTemplate>,idempotencyKey:string,organizationId?:number):Promise<SignatureTemplate>=>{
  const data=await mutationWithLegacyReliabilitySelection<{createSignatureTemplate:GqlTemplate},{input:ReturnType<typeof templateInput>;idempotencyKey:string}>(fields=>`mutation CreateSignatureTemplate($input:CreateSignatureTemplateInput!,$idempotencyKey:String!){createSignatureTemplate(input:$input,idempotencyKey:$idempotencyKey){${fields}}}`,{input:templateInput(payload),idempotencyKey},organizationId,templateFields,legacyTemplateFields,'template');
  return mapTemplate(data.createSignatureTemplate);
};

export const updateSignatureTemplateViaGraphql=async(id:number,payload:Partial<SignatureTemplate>&{roles?:SignatureTemplateRole[];fields?:SignatureTemplateField[]},organizationId?:number):Promise<SignatureTemplate>=>{
  const data=await mutationWithLegacyReliabilitySelection<{updateSignatureTemplate:GqlTemplate},{id:number;input:ReturnType<typeof templateInput>}>(fields=>`mutation UpdateSignatureTemplate($id:Int!,$input:UpdateSignatureTemplateInput!){updateSignatureTemplate(id:$id,input:$input){${fields}}}`,{id,input:templateInput(payload)},organizationId,templateFields,legacyTemplateFields,'template');
  return mapTemplate(data.updateSignatureTemplate);
};

export const deleteSignatureTemplateViaGraphql=async(id:number,organizationId?:number):Promise<SignatureTemplate>=>{
  const data=await mutationWithLegacyReliabilitySelection<{deleteSignatureTemplate:GqlTemplate},{id:number}>(fields=>`mutation DeleteSignatureTemplate($id:Int!){deleteSignatureTemplate(id:$id){${fields}}}`,{id},organizationId,templateFields,legacyTemplateFields,'template');
  return mapTemplate(data.deleteSignatureTemplate);
};

export const instantiateSignatureTemplateViaGraphql=async(id:number,payload:Record<string,unknown>,idempotencyKey:string,organizationId?:number):Promise<SignatureDocument>=>{
  const source=payload as {title?:string;description?:string;message?:string;routing_mode?:string;expiration_days?:number;sender_name?:string;sender_email?:string;recipients?:SignatureRecipient[]};
  const input={...(source.title===undefined?{}:{title:source.title}),...(source.description===undefined?{}:{description:source.description}),...(source.message===undefined?{}:{message:source.message}),...(source.routing_mode===undefined?{}:{routingMode:source.routing_mode}),...(source.expiration_days===undefined?{}:{expirationDays:source.expiration_days}),...(source.sender_name===undefined?{}:{senderName:source.sender_name}),...(source.sender_email===undefined?{}:{senderEmail:source.sender_email}),...(source.recipients===undefined?{}:{recipients:source.recipients.map(recipientInput)})};
  const data=await mutationWithLegacyReliabilitySelection<{instantiateSignatureTemplate:GqlDocument},{id:number;input:typeof input;idempotencyKey:string}>(fields=>`mutation InstantiateSignatureTemplate($id:Int!,$input:InstantiateSignatureTemplateInput!,$idempotencyKey:String!){instantiateSignatureTemplate(id:$id,input:$input,idempotencyKey:$idempotencyKey){${fields}}}`,{id,input,idempotencyKey},organizationId);
  return mapDocument(data.instantiateSignatureTemplate);
};
