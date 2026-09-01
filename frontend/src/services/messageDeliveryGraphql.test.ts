import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest } from './graphqlClient';
import {
  enqueueContactEmailViaGraphql,
  enqueueContactSmsViaGraphql,
  sendEmailTemplateTestViaGraphql,
  sendSmsTemplateTestViaGraphql,
} from './messageDeliveryGraphql';

vi.mock('./graphqlClient', () => ({ graphqlMutationRequest: vi.fn() }));

const queued = {
  id: 14,
  kind: 'contact_email',
  channel: 'email',
  status: 'queued',
  accepted: true,
  replayed: false,
  contactId: 9,
  templateId: 3,
  conversationId: 21,
  messageId: 34,
  providerId: null,
  createdAt: '2026-07-25T00:00:00.000Z',
};

describe('message delivery GraphQL adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'request-key' });
  });

  it('maps contact email and strips client organization authority', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      enqueueContactEmail: queued,
    });
    await expect(enqueueContactEmailViaGraphql({
      contact_id: 9,
      template_id: 3,
      reply_to: 'reply@example.com',
    }, 4)).resolves.toMatchObject({
      success: true,
      delivery_id: '14',
      status: 'queued',
      conversation_id: 21,
      message_id: 34,
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('EnqueueContactEmail'),
      {
        input: {
          contactId: 9,
          templateId: 3,
          replyTo: 'reply@example.com',
          idempotencyKey: 'request-key',
        },
      },
      4,
    );
  });

  it('maps contact SMS and both explicit test destinations', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ enqueueContactSms: { ...queued, kind: 'contact_sms', channel: 'sms' } })
      .mockResolvedValueOnce({ sendEmailTemplateTest: { ...queued, kind: 'test_email', contactId: null } })
      .mockResolvedValueOnce({ sendSmsTemplateTest: { ...queued, kind: 'test_sms', channel: 'sms', contactId: null } });

    await enqueueContactSmsViaGraphql(
      { contact_id: 9, message: 'Hi' }, 4, 'stable-contact-sms',
    );
    await sendEmailTemplateTestViaGraphql(
      3, 'test@example.com', { first_name: 'Ada' }, 4, false, 'stable-email-test',
    );
    await sendSmsTemplateTestViaGraphql(
      3, '+16025550100', undefined, 4, 'stable-sms-test',
    );

    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('EnqueueContactSms'),
      { input: { contactId: 9, message: 'Hi', idempotencyKey: 'stable-contact-sms' } },
      4,
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SendEmailTemplateTest'),
      {
        input: {
          templateId: 3,
          toEmail: 'test@example.com',
          sampleData: { first_name: 'Ada' },
          idempotencyKey: 'stable-email-test',
        },
      },
      4,
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SendSmsTemplateTest'),
      {
        input: {
          templateId: 3,
          toPhone: '+16025550100',
          idempotencyKey: 'stable-sms-test',
        },
      },
      4,
    );
  });
});
