import api, { getApiUrl } from '@/lib/api';
import { cancelSignatureDocumentViaGraphql, createSignatureDocumentViaGraphql, createSignatureTemplateViaGraphql, deleteSignatureDocumentViaGraphql, deleteSignatureTemplateViaGraphql, getSignatureAuditViaGraphql, getSignatureDocumentViaGraphql, getSignatureEmailPreviewViaGraphql, getSignatureTemplateViaGraphql, instantiateSignatureTemplateViaGraphql, listSignatureDocumentsViaGraphql, listSignatureTemplatesViaGraphql, remindSignatureDocumentViaGraphql, removeSignatureDocumentFileViaGraphql, retrySignatureDocumentViaGraphql, sendSignatureDocumentViaGraphql, updateSignatureDocumentViaGraphql, updateSignatureTemplateViaGraphql } from './signaturesGraphql';

type ApiPayload = Record<string, unknown>;

const unwrapResponse = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
};

export type SignatureStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface SignatureDocument {
  id: number;
  organization_id: number;
  title: string;
  document_number?: string;
  file_name?: string;
  description?: string;
  message?: string;
  status: SignatureStatus;
  recipient_count?: number;
  routing_mode?: 'parallel' | 'sequential';
  template_id?: number;
  expiration_days?: number;
  expires_at?: string;
  sender_name?: string;
  sender_email?: string;
  created_by?: number;
  sent_at?: string;
  completed_at?: string;
  file_url?: string;
  signed_file_url?: string;
  page_count?: number;
  delivery_state?: 'pending' | 'sending' | 'delivered' | 'retrying' | 'failed';
  completion_state?: 'queued' | 'processing' | 'retry' | 'dead_letter' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface SignatureRecipient {
  id: number;
  document_id: number;
  organization_id: number;
  contact_id?: number;
  name?: string;
  email: string;
  signing_order?: number;
  role_name?: string;
  routing_status?: 'locked' | 'active';
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
  sent_at?: string;
  viewed_at?: string;
  signed_at?: string;
  declined_at?: string;
  decline_reason?: string;
  identity_method?: 'none' | 'email_otp' | 'sms_otp';
  identity_verified_at?: string;
  delivery_state?: 'queued' | 'processing' | 'retry' | 'sent' | 'dead_letter' | 'cancelled';
}

export interface SignatureField {
  id: number;
  document_id: number;
  recipient_id?: number;
  role_name?: string;
  field_type: 'signature' | 'initials' | 'text' | 'date' | 'checkbox';
  page_number: number;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  label?: string;
  is_required?: boolean;
  value?: string;
  font_size?: number;
  font_family?: string;
  text_align?: string;
  locked?: boolean;
}

export interface PublicSignatureDocument {
  id: number;
  title: string;
  description?: string;
  message?: string;
  file_url?: string;
}

export interface PublicSignatureField {
  id: number;
  field_type: SignatureField['field_type'];
  page_number: number;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  label?: string;
  is_required?: boolean;
}

export interface PublicSigningData {
  document: PublicSignatureDocument;
  fields: PublicSignatureField[];
  consent: {
    version: string;
    text: string;
    sha256: string;
  };
}

export interface SignatureDocumentDetails {
  document: SignatureDocument;
  recipients: SignatureRecipient[];
  fields: SignatureField[];
  audit: Array<{
    id: number;
    document_id: number;
    recipient_id?: number;
    event_type: string;
    description?: string;
    created_at: string;
  }>;
}

export const createSignatureDocument = async (payload: Partial<SignatureDocument>, organizationId?: number) => {
  return organizationId === undefined
    ? createSignatureDocumentViaGraphql(payload)
    : createSignatureDocumentViaGraphql(payload, organizationId);
};

export const updateSignatureDocument = async (id: number, payload: Partial<SignatureDocument> & { recipients?: SignatureRecipient[]; fields?: SignatureField[] }, organizationId?: number) => {
  return organizationId === undefined
    ? updateSignatureDocumentViaGraphql(id, payload)
    : updateSignatureDocumentViaGraphql(id, payload, organizationId);
};

export const uploadSignatureDocument = async (documentId: number, file: File, organizationId?: number) => {
  const formData = new FormData();
  formData.append('document_id', String(documentId));
  formData.append('file', file);

  const response = await api.post('/api/signatures/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(organizationId === undefined
        ? {}
        : { 'x-organization-id': String(organizationId) }),
    }
  });
  return unwrapResponse<SignatureDocument>(response.data);
};

export const deleteSignatureDocumentFile = async (id: number, organizationId?: number) => {
  return organizationId === undefined
    ? removeSignatureDocumentFileViaGraphql(id)
    : removeSignatureDocumentFileViaGraphql(id, organizationId);
};

export const listSignatureDocuments = async (params: { status?: SignatureStatus; page?: number; limit?: number } = {}) => {
  return listSignatureDocumentsViaGraphql(params);
};

export const getSignatures = async (params: { status?: SignatureStatus; page?: number; limit?: number; search?: string } = {}) => {
  const result = await listSignatureDocumentsViaGraphql(params);
  return { documents: result.items, pagination: result.pagination };
};

export const getSignatureDocument = async (id: number, organizationId?: number, signal?: AbortSignal) => {
  return organizationId === undefined && signal === undefined
    ? getSignatureDocumentViaGraphql(id)
    : getSignatureDocumentViaGraphql(id, organizationId, signal);
};

export const sendSignatureDocument = async (id: number, organizationId?: number) => {
  return organizationId === undefined
    ? sendSignatureDocumentViaGraphql(id)
    : sendSignatureDocumentViaGraphql(id, organizationId);
};

export const cancelSignatureDocument = async (id: number, organizationId?: number) => {
  return organizationId === undefined
    ? cancelSignatureDocumentViaGraphql(id)
    : cancelSignatureDocumentViaGraphql(id, organizationId);
};

export const deleteSignatureDocument = async (id: number, organizationId?: number) => {
  return organizationId === undefined
    ? deleteSignatureDocumentViaGraphql(id)
    : deleteSignatureDocumentViaGraphql(id, organizationId);
};

export const remindSignatureDocument = async (id: number, organizationId?: number) => {
  return organizationId === undefined
    ? remindSignatureDocumentViaGraphql(id)
    : remindSignatureDocumentViaGraphql(id, organizationId);
};

export const retrySignatureDocument = async (id: number, organizationId?: number) => {
  return organizationId === undefined
    ? retrySignatureDocumentViaGraphql(id)
    : retrySignatureDocumentViaGraphql(id, organizationId);
};

export const downloadSignedDocument = (id: number) => {
  return { url: `${getApiUrl()}/api/signatures/documents/${id}/download` };
};

export interface SignatureEmailPreviewRequest {
  message: string;
  documentTitle?: string;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  expiresAt?: string | null;
  baseUrl?: string;
}

export interface SignatureEmailPreviewResponse {
  html: string;
  subject?: string;
}

export const getSignatureEmailPreview = async (data: SignatureEmailPreviewRequest) => {
  return getSignatureEmailPreviewViaGraphql(data);
};

export const getSignatureAudit = async (id: number) => {
  return getSignatureAuditViaGraphql(id);
};

export const getPublicSigningData = async (token: string) => {
  const response = await api.get(`/api/public/sign/${token}`);
  return unwrapResponse<PublicSigningData>(response.data);
};

export const submitPublicSignature = async (
  token: string,
  payload: {
    fields: Array<{ id: number; value: string }>;
    consent: { agreed: true; version: string };
  },
) => {
  const response = await api.post(`/api/public/sign/${token}`, payload);
  return unwrapResponse<ApiPayload>(response.data);
};

export const declinePublicSignature = async (token: string, reason?: string) => {
  const response = await api.post(`/api/public/sign/${token}/decline`, { reason });
  return unwrapResponse<ApiPayload>(response.data);
};

// Templates
export interface SignatureTemplate {
  id: number;
  organization_id: number;
  title: string;
  description?: string;
  message?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  page_count?: number;
  is_ready: boolean;
  created_at: string;
}

export interface SignatureTemplateRole {
  id?: number;
  template_id?: number;
  role_name: string;
  signing_order?: number;
}

export interface SignatureTemplateField {
  id?: number;
  template_id?: number;
  role_name?: string;
  field_type: 'signature' | 'initials' | 'text' | 'date' | 'checkbox';
  page_number: number;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  label?: string;
  is_required?: boolean;
  font_size?: number;
  font_family?: string;
  text_align?: string;
  locked?: boolean;
}

export const createSignatureTemplate = async (payload: Partial<SignatureTemplate>, organizationId?: number) => {
  return organizationId === undefined
    ? createSignatureTemplateViaGraphql(payload)
    : createSignatureTemplateViaGraphql(payload, organizationId);
};

export const updateSignatureTemplate = async (
  id: number,
  payload: Partial<SignatureTemplate> & { roles?: SignatureTemplateRole[]; fields?: SignatureTemplateField[] },
  organizationId?: number,
) => {
  return organizationId === undefined
    ? updateSignatureTemplateViaGraphql(id, payload)
    : updateSignatureTemplateViaGraphql(id, payload, organizationId);
};

export const uploadSignatureTemplate = async (templateId: number, file: File, organizationId?: number) => {
  const formData = new FormData();
  formData.append('template_id', String(templateId));
  formData.append('file', file);

  const response = await api.post('/api/signatures/templates/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(organizationId === undefined
        ? {}
        : { 'x-organization-id': String(organizationId) }),
    }
  });
  return unwrapResponse<SignatureTemplate>(response.data);
};

export const listSignatureTemplates = async () => {
  return listSignatureTemplatesViaGraphql();
};

export const getSignatureTemplate = async (id: number, organizationId?: number, signal?: AbortSignal) => {
  return organizationId === undefined && signal === undefined
    ? getSignatureTemplateViaGraphql(id)
    : getSignatureTemplateViaGraphql(id, organizationId, signal);
};

export const instantiateSignatureTemplate = async (id: number, payload: ApiPayload) => {
  return instantiateSignatureTemplateViaGraphql(id, payload);
};

export const deleteSignatureTemplate = async (id: number) => {
  return deleteSignatureTemplateViaGraphql(id);
};
