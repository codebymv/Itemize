import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import type {
  EmailLog, EmailLogsResponse, EmailTemplatesResponse, PreviewEmailRequest,
  PreviewEmailResponse, SendEmailRequest, SendEmailResponse,
} from './adminEmailApi';

export const previewAdminEmailViaGraphql = async (input: PreviewEmailRequest): Promise<PreviewEmailResponse> => {
  const data = await graphqlMutationRequest<
    { previewAdminEmail: PreviewEmailResponse }, { input: PreviewEmailRequest }
  >(`mutation PreviewAdminEmail($input: AdminEmailPreviewInput!) {
    previewAdminEmail(input: $input) { html subject }
  }`, { input });
  return data.previewAdminEmail;
};

export const getAdminEmailLogsViaGraphql = async (input: {
  page?: number; limit?: number; status?: string;
}): Promise<EmailLogsResponse> => {
  const data = await graphqlRequest<
    { adminEmailLogs: EmailLogsResponse }, { input: typeof input }
  >(`query AdminEmailLogs($input: AdminEmailLogFilterInput) {
    adminEmailLogs(input: $input) {
      logs { id recipientEmail recipientId recipientName subject bodyHtml status externalId errorMessage sentBy sentByName sentByEmail sentAt createdAt }
      total hasMore
    }
  }`, { input });
  return data.adminEmailLogs;
};

export const getAdminEmailLogViaGraphql = async (id: number): Promise<EmailLog> => {
  const data = await graphqlRequest<{ adminEmailLog: EmailLog }, { id: number }>(
    `query AdminEmailLog($id: Int!) {
      adminEmailLog(id: $id) { id recipientEmail recipientId recipientName subject bodyHtml status externalId errorMessage sentBy sentByName sentByEmail sentAt createdAt }
    }`, { id },
  );
  return data.adminEmailLog;
};

export const getAdminEmailTemplatesViaGraphql = async (input?: {
  category?: string; search?: string;
}): Promise<EmailTemplatesResponse> => {
  const data = await graphqlRequest<
    { adminEmailTemplates: EmailTemplatesResponse }, { input: typeof input }
  >(`query AdminEmailTemplates($input: AdminEmailTemplateFilterInput) {
    adminEmailTemplates(input: $input) {
      templates { id name subject bodyHtml category isActive organizationId organizationName createdBy createdByName createdAt updatedAt }
      total
    }
  }`, { input });
  return data.adminEmailTemplates;
};

export const enqueueAdminEmailViaGraphql = async (request: SendEmailRequest): Promise<SendEmailResponse> => {
  const idempotencyKey = globalThis.crypto?.randomUUID?.() ??
    `admin-email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const data = await graphqlMutationRequest<{
    enqueueAdminEmailBatch: { batchId: number; status: string; accepted: number; replayed: boolean };
  }, { input: SendEmailRequest & { idempotencyKey: string } }>(
    `mutation EnqueueAdminEmailBatch($input: AdminEmailBatchInput!) {
      enqueueAdminEmailBatch(input: $input) { batchId status accepted replayed }
    }`, { input: { ...request, idempotencyKey } },
  );
  const result = data.enqueueAdminEmailBatch;
  return { sent: 0, failed: 0, errors: [], queued: result.accepted, batchId: result.batchId, status: result.status };
};
