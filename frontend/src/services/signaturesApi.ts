import api from '@/lib/api';

const unwrapResponse = <T>(payload: any): T => {
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
  description?: string;
  message?: string;
  status: SignatureStatus;
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

export const createSignatureDocument = async (payload: Partial<SignatureDocument>) => {
  const response = await api.post('/api/signatures/documents', payload);
  return unwrapResponse<SignatureDocument>(response.data);
};

export const updateSignatureDocument = async (id: number, payload: Partial<SignatureDocument> & { recipients?: SignatureRecipient[]; fields?: SignatureField[] }) => {
  const response = await api.put(`/api/signatures/documents/${id}`, payload);
  return unwrapResponse<SignatureDocument>(response.data);
};

export const uploadSignatureDocument = async (documentId: number, file: File) => {
  const formData = new FormData();
  formData.append('document_id', String(documentId));
  formData.append('file', file);

  const response = await api.post('/api/signatures/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return unwrapResponse<SignatureDocument>(response.data);
};

export const deleteSignatureDocumentFile = async (id: number) => {
  const response = await api.delete(`/api/signatures/documents/${id}/file`);
  return unwrapResponse<SignatureDocument>(response.data);
};

export const listSignatureDocuments = async (params: { status?: SignatureStatus; page?: number; limit?: number } = {}) => {
  const response = await api.get('/api/signatures/documents', { params });
  return unwrapResponse<{ items: SignatureDocument[]; pagination: any }>(response.data);
};

export const getSignatureDocument = async (id: number) => {
  const response = await api.get(`/api/signatures/documents/${id}`);
  return unwrapResponse<SignatureDocumentDetails>(response.data);
};

export const sendSignatureDocument = async (id: number) => {
  const response = await api.post(`/api/signatures/documents/${id}/send`);
  return unwrapResponse<SignatureDocument>(response.data);
};

export const cancelSignatureDocument = async (id: number) => {
  const response = await api.post(`/api/signatures/documents/${id}/cancel`);
  return unwrapResponse<SignatureDocument>(response.data);
};

export const remindSignatureDocument = async (id: number) => {
  const response = await api.post(`/api/signatures/documents/${id}/remind`);
  return unwrapResponse<SignatureDocument>(response.data);
};

export const downloadSignedDocument = async (id: number) => {
  const response = await api.get(`/api/signatures/documents/${id}/download`);
  return unwrapResponse<{ url: string }>(response.data);
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
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  const response = await api.post('/api/signatures/email/preview', { ...data, baseUrl });
  return unwrapResponse<SignatureEmailPreviewResponse>(response.data);
};

export const getSignatureAudit = async (id: number) => {
  const response = await api.get(`/api/signatures/documents/${id}/audit`);
  return unwrapResponse<any[]>(response.data);
};

export const getPublicSigningData = async (token: string) => {
  const response = await api.get(`/api/public/sign/${token}`);
  return unwrapResponse<any>(response.data);
};

export const submitPublicSignature = async (token: string, payload: { fields: Array<{ id: number; value: string }> }) => {
  const response = await api.post(`/api/public/sign/${token}`, payload);
  return unwrapResponse<any>(response.data);
};

export const declinePublicSignature = async (token: string, reason?: string) => {
  const response = await api.post(`/api/public/sign/${token}/decline`, { reason });
  return unwrapResponse<any>(response.data);
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

export const createSignatureTemplate = async (payload: Partial<SignatureTemplate>) => {
  const response = await api.post('/api/signatures/templates', payload);
  return unwrapResponse<SignatureTemplate>(response.data);
};

export const updateSignatureTemplate = async (
  id: number,
  payload: Partial<SignatureTemplate> & { roles?: SignatureTemplateRole[]; fields?: SignatureTemplateField[] }
) => {
  const response = await api.put(`/api/signatures/templates/${id}`, payload);
  return unwrapResponse<SignatureTemplate>(response.data);
};

export const uploadSignatureTemplate = async (templateId: number, file: File) => {
  const formData = new FormData();
  formData.append('template_id', String(templateId));
  formData.append('file', file);

  const response = await api.post('/api/signatures/templates/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return unwrapResponse<SignatureTemplate>(response.data);
};

export const listSignatureTemplates = async () => {
  const response = await api.get('/api/signatures/templates');
  return unwrapResponse<SignatureTemplate[]>(response.data);
};

export const getSignatureTemplate = async (id: number) => {
  const response = await api.get(`/api/signatures/templates/${id}`);
  return unwrapResponse<{ template: SignatureTemplate; roles: SignatureTemplateRole[]; fields: SignatureTemplateField[] }>(response.data);
};

export const instantiateSignatureTemplate = async (id: number, payload: any) => {
  const response = await api.post(`/api/signatures/templates/${id}/instantiate`, payload);
  return unwrapResponse<SignatureDocument>(response.data);
};
