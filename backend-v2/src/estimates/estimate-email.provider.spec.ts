import { ResendEstimateEmailProvider } from './estimate-email.provider';

describe('ResendEstimateEmailProvider', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFetch = global.fetch;
  const message = {
    to: 'recipient@example.com',
    subject: 'Estimate EST-00001',
    html: '<p>Estimate body</p>',
    idempotencyKey: 'estimate-email:4:12',
  };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
    global.fetch = originalFetch;
  });

  it('returns a definite rejection without contacting Resend when unconfigured', async () => {
    await expect(new ResendEstimateEmailProvider().send(message)).resolves.toEqual({
      kind: 'rejected',
      message: 'Email service is not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends the exact intent with provider authentication and idempotency', async () => {
    process.env.RESEND_API_KEY = 're_test_contract';
    process.env.EMAIL_FROM = 'billing@example.com';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-provider-12' }),
    });

    await expect(new ResendEstimateEmailProvider().send(message)).resolves.toEqual({
      kind: 'sent',
      providerId: 'email-provider-12',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_test_contract',
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
    });
    expect(JSON.parse(request.body)).toEqual({
      from: 'billing@example.com',
      to: [message.to],
      subject: message.subject,
      html: message.html,
    });
  });

  it('maps an HTTP rejection without converting it into provider acceptance', async () => {
    process.env.RESEND_API_KEY = 're_test_contract';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Rate limited' }),
    });

    await expect(new ResendEstimateEmailProvider().send(message)).resolves.toEqual({
      kind: 'rejected',
      message: 'Rate limited',
    });
  });

  it('propagates an ambiguous transport failure for reconciliation', async () => {
    process.env.RESEND_API_KEY = 're_test_contract';
    (global.fetch as jest.Mock).mockRejectedValue(new Error('socket closed'));

    await expect(new ResendEstimateEmailProvider().send(message))
      .rejects.toThrow('socket closed');
  });
});
