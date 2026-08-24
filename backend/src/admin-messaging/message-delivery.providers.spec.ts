import {
  ResendMessageEmailProvider,
  TwilioMessageSmsProvider,
} from './message-delivery.providers';

const response = (
  status: number,
  body: Record<string, unknown>,
): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn(async () => body),
}) as unknown as Response;

describe('message delivery providers', () => {
  const original = {
    resend: process.env.RESEND_API_KEY,
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'twilio_test';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (original.resend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original.resend;
    if (original.sid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = original.sid;
    if (original.token === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = original.token;
  });

  it('passes a stable Resend idempotency key and accepts the provider ID', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValue(response(200, { id: 're_123' }));
    await expect(new ResendMessageEmailProvider().send({
      to: 'ada@example.com',
      from: 'Itemize <hello@example.com>',
      subject: 'Hello',
      html: '<p>Hello</p>',
      idempotencyKey: 'message-delivery:4:12',
    })).resolves.toEqual({ kind: 'accepted', providerId: 're_123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'message-delivery:4:12',
        }),
      }),
    );
  });

  it('distinguishes permanent and retryable Resend failures', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockResolvedValueOnce(response(400, { message: 'Bad address' }));
    await expect(new ResendMessageEmailProvider().send({
      to: 'bad@example.com',
      from: 'hello@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      idempotencyKey: 'message-delivery:4:13',
    })).resolves.toEqual({ kind: 'rejected', message: 'Bad address' });
    fetchMock.mockResolvedValueOnce(response(503, { message: 'Unavailable' }));
    await expect(new ResendMessageEmailProvider().send({
      to: 'ada@example.com',
      from: 'hello@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      idempotencyKey: 'message-delivery:4:14',
    })).rejects.toThrow('Unavailable');
  });

  it('accepts explicit Twilio success and rejects explicit client errors', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockResolvedValueOnce(response(201, { sid: 'SM123' }));
    const provider = new TwilioMessageSmsProvider();
    await expect(provider.send({
      to: '+16025550100',
      from: '+16025550101',
      message: 'Hello',
    })).resolves.toEqual({ kind: 'accepted', providerId: 'SM123' });
    fetchMock.mockResolvedValueOnce(response(400, { message: 'Invalid destination' }));
    await expect(provider.send({
      to: '+16025550100',
      from: '+16025550101',
      message: 'Hello',
    })).resolves.toEqual({ kind: 'rejected', message: 'Invalid destination' });
  });

  it.each([
    ['network error', () => Promise.reject(new Error('timeout'))],
    ['provider 5xx', () => Promise.resolve(response(503, {}))],
    ['missing SID', () => Promise.resolve(response(201, {}))],
  ])('quarantines ambiguous Twilio outcome: %s', async (_label, implementation) => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(implementation as typeof fetch);
    await expect(new TwilioMessageSmsProvider().send({
      to: '+16025550100',
      from: '+16025550101',
      message: 'Hello',
    })).resolves.toMatchObject({ kind: 'reconciliation' });
  });
});
