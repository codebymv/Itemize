import { graphqlMutationRequest } from './graphqlClient';

export type MessageDeliveryResult = {
  id: number;
  kind: string;
  channel: string;
  status: string;
  accepted: boolean;
  replayed: boolean;
  contactId: number | null;
  templateId: number | null;
  conversationId: number | null;
  messageId: number | null;
  providerId: string | null;
  createdAt: string;
};

const fields = `
  id kind channel status accepted replayed contactId templateId conversationId messageId providerId createdAt
`;

const deliveryResult = (delivery: MessageDeliveryResult) => ({
  success: delivery.accepted,
  message: delivery.replayed
    ? 'Delivery was already queued'
    : 'Delivery queued',
  delivery_id: String(delivery.id),
  conversation_id: delivery.conversationId ?? undefined,
  message_id: delivery.messageId ?? undefined,
  status: delivery.status,
  replayed: delivery.replayed,
});

export const enqueueContactEmailViaGraphql = async (
  input: {
    contact_id: number;
    template_id?: number;
    subject?: string;
    body_html?: string;
    body_text?: string;
    reply_to?: string;
  },
  organizationId?: number,
) => {
  const graphqlInput = {
    contactId: input.contact_id,
    ...(input.template_id === undefined ? {} : { templateId: input.template_id }),
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.body_html === undefined ? {} : { bodyHtml: input.body_html }),
    ...(input.body_text === undefined ? {} : { bodyText: input.body_text }),
    ...(input.reply_to === undefined ? {} : { replyTo: input.reply_to }),
    idempotencyKey: crypto.randomUUID(),
  };
  const data = await graphqlMutationRequest<
    { enqueueContactEmail: MessageDeliveryResult },
    { input: typeof graphqlInput }
  >(
    `mutation EnqueueContactEmail($input: EnqueueContactEmailInput!) {
      enqueueContactEmail(input: $input) { ${fields} }
    }`,
    { input: graphqlInput },
    organizationId,
  );
  return deliveryResult(data.enqueueContactEmail);
};

export const enqueueContactSmsViaGraphql = async (
  input: {
    contact_id: number;
    template_id?: number;
    message?: string;
  },
  organizationId?: number,
) => {
  const graphqlInput = {
    contactId: input.contact_id,
    ...(input.template_id === undefined ? {} : { templateId: input.template_id }),
    ...(input.message === undefined ? {} : { message: input.message }),
    idempotencyKey: crypto.randomUUID(),
  };
  const data = await graphqlMutationRequest<
    { enqueueContactSms: MessageDeliveryResult },
    { input: typeof graphqlInput }
  >(
    `mutation EnqueueContactSms($input: EnqueueContactSmsInput!) {
      enqueueContactSms(input: $input) { ${fields} }
    }`,
    { input: graphqlInput },
    organizationId,
  );
  return deliveryResult(data.enqueueContactSms);
};

export const sendEmailTemplateTestViaGraphql = async (
  templateId: number,
  toEmail: string,
  sampleData?: Record<string, unknown>,
  organizationId?: number,
  useDraft = false,
) => {
  const input = {
    templateId,
    toEmail,
    ...(sampleData === undefined ? {} : { sampleData }),
    ...(useDraft ? { useDraft: true } : {}),
    idempotencyKey: crypto.randomUUID(),
  };
  const data = await graphqlMutationRequest<
    { sendEmailTemplateTest: MessageDeliveryResult },
    { input: typeof input }
  >(
    `mutation SendEmailTemplateTest($input: SendEmailTemplateTestInput!) {
      sendEmailTemplateTest(input: $input) { ${fields} }
    }`,
    { input },
    organizationId,
  );
  return deliveryResult(data.sendEmailTemplateTest);
};

export const sendSmsTemplateTestViaGraphql = async (
  templateId: number,
  toPhone: string,
  sampleData?: Record<string, unknown>,
  organizationId?: number,
) => {
  const input = {
    templateId,
    toPhone,
    ...(sampleData === undefined ? {} : { sampleData }),
    idempotencyKey: crypto.randomUUID(),
  };
  const data = await graphqlMutationRequest<
    { sendSmsTemplateTest: MessageDeliveryResult },
    { input: typeof input }
  >(
    `mutation SendSmsTemplateTest($input: SendSmsTemplateTestInput!) {
      sendSmsTemplateTest(input: $input) { ${fields} }
    }`,
    { input },
    organizationId,
  );
  return deliveryResult(data.sendSmsTemplateTest);
};
