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
    await expect(new ResendReputationEmailProvider({} as import('pg').Pool).send({
      to: 'customer@example.com',
      subject: 'We would love your feedback',
      reviewUrl: 'https://itemize.cloud/review/abc',
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

  it('uses the canonical CTA and removes only the generated HTML link suffix', async () => {
    const reviewUrl = 'https://itemize.cloud/review/canonical';
    const text = `See https://example.test/info first.\n\nLeave a review: ${reviewUrl}\n\nThank you!`;
    await new ResendReputationEmailProvider({} as import('pg').Pool).send({to:'qa@example.test',subject:'QA',text,reviewUrl,idempotencyKey:'qa'});
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.text).toBe(text);
    expect(body.html).toContain('See https://example.test/info first.');
    expect(body.html).toContain(`href="${reviewUrl}"`);
    expect(body.html).not.toContain('href="https://example.test/info"');
    expect(body.html.match(/https:\/\/itemize.cloud\/review\/canonical/g)).toHaveLength(1);
    expect(body.html).not.toContain('Leave a review:');
  });

  it('never infers a CTA from message URLs when no canonical URL exists', async () => {
    await new ResendReputationEmailProvider({} as import('pg').Pool).send({to:'qa@example.test',subject:'QA',text:'Visit https://example.test',idempotencyKey:'qa'});
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.html).not.toContain('href="https://example.test"');
  });
});
