import { GraphQLError } from 'graphql';
import { MessageDeliveryService } from './message-delivery.service';
import { MessageDeliveryRepository } from './message-delivery.repository';
import { MessageEmailProvider, MessageSmsProvider } from './message-delivery.providers';

const job = (overrides: Record<string, unknown> = {}) => ({
  id: 12,
  organization_id: 4,
  requested_by_user_id: 7,
  idempotency_key: 'request-key-12345',
  request_fingerprint: 'a'.repeat(64),
  kind: 'contact_email' as const,
  channel: 'email' as const,
  contact_id: 9,
  email_template_id: 3,
  sms_template_id: null,
  conversation_id: 21,
  message_id: 34,
  payload: {
    to: 'ada@example.com',
    from: 'Itemize <onboarding@resend.dev>',
    subject: 'Hello Ada',
    html: '<p>Hello Ada</p>',
  },
  status: 'queued',
  attempt_count: 0,
  provider_id: null,
  last_error: null,
  created_at: new Date('2026-07-25T00:00:00.000Z'),
  ...overrides,
});

describe('MessageDeliveryService', () => {
  const repository = {
    enqueueContactEmail: jest.fn(),
    enqueueContactSms: jest.fn(),
    enqueueTestEmail: jest.fn(),
    enqueueTestSms: jest.fn(),
    dueIds: jest.fn(),
    claim: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    reconciliation: jest.fn(),
  } as unknown as jest.Mocked<MessageDeliveryRepository>;
  const emailProvider = { send: jest.fn() } as jest.Mocked<MessageEmailProvider>;
  const smsProvider = { send: jest.fn() } as jest.Mocked<MessageSmsProvider>;
  let service: MessageDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MessageDeliveryService(repository, emailProvider, smsProvider);
  });

  it('snapshots rendered contact email content and leaves unknown variables visible', async () => {
    repository.enqueueContactEmail.mockImplementation(async (_input, build) => ({
      kind: 'created',
      job: job({
        payload: build({
          id: 9,
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ADA@example.com',
          phone: null,
          company: null,
          job_title: null,
          custom_fields: { favorite_color: 'blue' },
          email_unsubscribed: false,
          email_bounced: false,
        }, {
          id: 3,
          name: 'Welcome',
          subject: 'Hello {{first_name}}',
          body_html: '<p>{{favorite_color}} {{unknown}}</p>',
          body_text: 'Hello {{full_name}}',
        }, 'Itemize'),
      }),
    }));

    await expect(service.enqueueContactEmail(4, 7, {
      contactId: 9,
      templateId: 3,
      idempotencyKey: 'request-key-12345',
    })).resolves.toMatchObject({
      id: 12,
      accepted: true,
      replayed: false,
      status: 'queued',
    });
    const build = repository.enqueueContactEmail.mock.calls[0][1];
    const payload = build({
      id: 9,
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ADA@example.com',
      phone: null,
      company: null,
      job_title: null,
      custom_fields: { favorite_color: 'blue' },
      email_unsubscribed: false,
      email_bounced: false,
    }, {
      id: 3,
      name: 'Welcome',
      subject: 'Hello {{first_name}}',
      body_html: '<p>{{favorite_color}} {{unknown}}</p>',
      body_text: 'Hello {{full_name}}',
    }, 'Itemize');
    expect(payload).toMatchObject({
      to: 'ada@example.com',
      subject: 'Hello Ada',
      text: 'Hello Ada Lovelace',
    });
    expect(payload.html).toContain('blue {{unknown}}');
    expect(payload.html?.match(/<!doctype html>/gi)).toHaveLength(1);
    expect(payload.html).toContain('https://itemize.cloud/cover.png');
    expect(payload.html).not.toContain('{{unsubscribeUrl}}');
  });

  it('rejects invalid destinations before persisting test intent', async () => {
    await expect(service.sendSmsTemplateTest(4, 7, {
      templateId: 3,
      toPhone: 'invalid',
      idempotencyKey: 'request-key-12345',
    })).rejects.toMatchObject<Partial<GraphQLError>>({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
    expect(repository.enqueueTestSms).not.toHaveBeenCalled();
  });

  it('snapshots the requested draft version for an exact test send', async () => {
    repository.enqueueTestEmail.mockImplementation(async (input, build) => {
      expect(input.useDraft).toBe(true);
      const payload = build({
        id: 3,
        name: 'Draft welcome',
        subject: 'Draft for {{first_name}}',
        preheader: 'Draft preview',
        body_html: '<p class="callout-info">Draft body for {{email}}</p>',
        body_text: 'Draft body for {{email}}',
      }, 'Itemize');
      return { kind: 'created', job: job({ kind: 'test_email', payload }) };
    });

    await expect(service.sendEmailTemplateTest(4, 7, {
      templateId: 3,
      toEmail: 'owner@example.com',
      useDraft: true,
      sampleData: { first_name: 'Grace', email: 'grace@example.com' },
      idempotencyKey: 'request-key-12345',
    })).resolves.toMatchObject({ accepted: true, replayed: false });

    const queued = repository.enqueueTestEmail.mock.results[0].value;
    await expect(queued).resolves.toMatchObject({
      job: { payload: expect.objectContaining({ subject: '[TEST] Draft for Grace' }) },
    });
    const payload = (await queued as { job: { payload: { html: string; text: string } } }).job.payload;
    expect(payload.html).toContain('TEST EMAIL');
    expect(payload.html).toContain('Draft body for grace@example.com');
    expect(payload.text).toBe('Draft body for grace@example.com');
  });

  it('replays the same idempotency key without creating another job', async () => {
    repository.enqueueContactSms.mockResolvedValue({
      kind: 'replayed',
      job: job({
        kind: 'contact_sms',
        channel: 'sms',
        email_template_id: null,
        sms_template_id: 3,
      }),
    });
    await expect(service.enqueueContactSms(4, 7, {
      contactId: 9,
      templateId: 3,
      idempotencyKey: 'request-key-12345',
    })).resolves.toMatchObject({ id: 12, replayed: true });
  });

  it('accepts email once and sends ambiguous SMS to reconciliation', async () => {
    repository.dueIds.mockResolvedValue([
      { id: 12, organizationId: 4 },
      { id: 13, organizationId: 4 },
    ]);
    repository.claim
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({
        id: 13,
        kind: 'contact_sms',
        channel: 'sms',
        email_template_id: null,
        sms_template_id: 3,
        payload: { to: '+16025550100', from: '+16025550101', message: 'Hi' },
      }));
    emailProvider.send.mockResolvedValue({ kind: 'accepted', providerId: 're_email' });
    smsProvider.send.mockResolvedValue({
      kind: 'reconciliation',
      message: 'Unknown outcome',
    });
    repository.complete.mockResolvedValue(job({
      status: 'provider_accepted',
      provider_id: 're_email',
    }));
    repository.reconciliation.mockResolvedValue(job({
      id: 13,
      kind: 'contact_sms',
      channel: 'sms',
      status: 'reconciliation_required',
    }));

    await expect(service.runDue()).resolves.toEqual({
      attempted: 2,
      accepted: 1,
      failed: 0,
      reconciliationRequired: 1,
    });
    expect(repository.complete).toHaveBeenCalledWith(4, 12, 're_email');
    expect(repository.reconciliation).toHaveBeenCalledWith(4, 13, 'Unknown outcome');
    expect(repository.fail).not.toHaveBeenCalled();
  });
});
