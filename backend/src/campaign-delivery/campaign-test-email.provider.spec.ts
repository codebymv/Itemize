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
