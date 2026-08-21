import { ResendReputationEmailProvider } from './reputation-request-delivery.providers';

describe('ResendReputationEmailProvider', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      RESEND_API_KEY: 'test-key',
      EMAIL_ASSET_ORIGIN: 'https://itemize.cloud',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-1' }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('sends feedback requests with the shared shell and a text alternative', async () => {
    await expect(new ResendReputationEmailProvider().send({
      to: 'customer@example.com',
      subject: 'We would love your feedback',
      text: 'Please review us: https://itemize.cloud/review/abc\n<script>alert(1)</script>',
      idempotencyKey: 'review-request:1',
    })).resolves.toEqual({ kind: 'sent', providerId: 'email-1' });

    const request = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(request.from).toBe('Itemize <noreply@itemize.cloud>');
    expect(request.text).toContain('Please review us');
    expect(request.html).toContain('https://itemize.cloud/cover.png');
    expect(request.html).toContain('Leave a review');
    expect(request.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(request.html).not.toContain('<script>alert(1)</script>');
  });
});
