import { ResendCampaignTestEmailProvider } from './campaign-test-email.provider';

describe('ResendCampaignTestEmailProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Itemize <noreply@itemize.test>';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it('forwards RFC 8058 custom headers to Resend', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'provider-1' }),
    }) as jest.Mock;
    const provider = new ResendCampaignTestEmailProvider();
    await expect(provider.send({
      to: 'recipient@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
      fromName: null,
      fromEmail: null,
      replyTo: null,
      headers: {
        'List-Unsubscribe': '<https://api.itemize.test/unsubscribe/token>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      idempotencyKey: 'campaign-recipient-email:4:12',
    })).resolves.toEqual({ kind: 'sent', providerId: 'provider-1' });

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.headers).toEqual({
      'List-Unsubscribe': '<https://api.itemize.test/unsubscribe/token>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('campaign email sender formatting', () => {
  const env = process.env;
  afterEach(() => { process.env = env; jest.restoreAllMocks(); });
  it.each([
    ['Itemize <noreply@itemize.cloud>', null, 'QA Studio', '"QA Studio" <noreply@itemize.cloud>'],
    ['noreply@itemize.cloud', null, 'QA Studio', '"QA Studio" <noreply@itemize.cloud>'],
    ['Itemize <noreply@itemize.cloud>', 'sender@example.com', 'QA Studio', '"QA Studio" <sender@example.com>'],
    ['Itemize <noreply@itemize.cloud>', null, null, 'Itemize <noreply@itemize.cloud>'],
  ])('handles configured sender %s and campaign override %s / %s', async (configured, override, name, expected) => {
    process.env = { ...env, RESEND_API_KEY: 'test', EMAIL_FROM: configured };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'test-id' }), { status: 200 }));
    const result = await new ResendCampaignTestEmailProvider().send({
      to: 'qa@example.com', subject: 'QA', html: '<p>QA</p>', text: null,
      fromName: name, fromEmail: override, replyTo: null, idempotencyKey: 'qa-sender',
    });
    expect(result).toEqual({ kind: 'sent', providerId: 'test-id' });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).from).toBe(expected);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': 'qa-sender' });
  });
});
