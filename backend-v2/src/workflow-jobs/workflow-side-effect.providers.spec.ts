import {
  ResendWorkflowEmailProvider,
  TwilioWorkflowSmsProvider,
  ControlledWorkflowWebhookProvider,
  WorkflowDeliveryError,
  workflowWebhookStatusRetryable,
} from './workflow-side-effect.providers';

describe('workflow side-effect providers', () => {
  const originalFetch = global.fetch;
  const original = { resend: process.env.RESEND_API_KEY, sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN, phone: process.env.TWILIO_PHONE_NUMBER };
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = original.resend;
    process.env.TWILIO_ACCOUNT_SID = original.sid;
    process.env.TWILIO_AUTH_TOKEN = original.token;
    process.env.TWILIO_PHONE_NUMBER = original.phone;
  });

  it('passes the stable workflow key to Resend', async () => {
    process.env.RESEND_API_KEY = 're_test';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-id' }) }) as any;
    await expect(new ResendWorkflowEmailProvider().send({
      to: 'person@example.test', subject: 'Hello', html: '<p>Hello</p>', tags: [], idempotencyKey: 'stable-key',
    })).resolves.toEqual({ providerId: 'email-id' });
    expect(global.fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      headers: expect.objectContaining({ 'Idempotency-Key': 'stable-key' }),
    }));
  });

  it('classifies Twilio network ambiguity separately from a known rejection', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_PHONE_NUMBER = '+16025550100';
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('socket closed')) as any;
    await expect(new TwilioWorkflowSmsProvider().send({ to: '+16025550101', message: 'Hi' }))
      .rejects.toMatchObject({ providerOutcomeUnknown: true, retryable: false });

    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 400,
      json: async () => ({ message: 'invalid destination' }) }) as any;
    await expect(new TwilioWorkflowSmsProvider().send({ to: '+16025550101', message: 'Hi' }))
      .rejects.toMatchObject({ message: 'invalid destination', providerOutcomeUnknown: false, retryable: true });
  });

  it('freezes webhook retry classification and typed non-retryable errors', () => {
    expect([408, 425, 429, 500, 503].every(workflowWebhookStatusRetryable)).toBe(true);
    expect([301, 400, 404].some(workflowWebhookStatusRetryable)).toBe(false);
    expect(new WorkflowDeliveryError('policy', false)).toMatchObject({ retryable: false, providerOutcomeUnknown: false });
  });

  it('classifies webhook URL and header policy violations as non-retryable', async () => {
    const provider = new ControlledWorkflowWebhookProvider();
    const base = { method: 'POST', body: {}, idempotencyKey: 'stable', timeoutMs: 1000,
      maxRequestBytes: 1024, maxResponseBytes: 1024 };
    await expect(provider.send({ ...base, url: 'http://127.0.0.1/internal', headers: {} }))
      .rejects.toMatchObject({ retryable: false });
    await expect(provider.send({ ...base, url: 'https://example.com/hook', headers: { Bad_Header: 'value' } }))
      .rejects.toMatchObject({ retryable: false });
  });
});
