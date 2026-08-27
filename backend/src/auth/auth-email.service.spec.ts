import { AuthEmailService } from './auth-email.service';

describe('AuthEmailService', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'Itemize <noreply@itemize.cloud>',
      APP_URL: 'https://itemize.cloud',
      EMAIL_ASSET_ORIGIN: 'https://itemize.cloud',
    };
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it.each([
    ['verification', (service: AuthEmailService) => service.sendVerification({ email: 'ada@example.com', name: 'Ada' }, 'token')],
    ['welcome', (service: AuthEmailService) => service.sendWelcome({ email: 'ada@example.com', name: 'Ada' })],
    ['password reset', (service: AuthEmailService) => service.sendPasswordReset({ email: 'ada@example.com', name: 'Ada' }, 'token')],
    ['password changed', (service: AuthEmailService) => service.sendPasswordChanged({ email: 'ada@example.com', name: 'Ada' })],
  ])('uses the branded transactional shell for %s mail', async (_name, send) => {
    await expect(send(new AuthEmailService())).resolves.toBe(true);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.html).toContain('background:#f1f5f9');
    expect(request.html).toContain('https://itemize.cloud/cover.png');
    expect(request.html).toContain('height:4px;background:#2563eb');
    expect(request.html).toContain('Hi Ada,');
    expect(request.text).toEqual(expect.any(String));
    if (_name !== 'welcome') {
      expect(request.html).not.toContain('Account security notification from Itemize.');
      expect(request.html).not.toContain('Sent securely with Itemize.');
    }
  });

  it('escapes account names in branded body content', async () => {
    await new AuthEmailService().sendVerification(
      { email: 'ada@example.com', name: '<img src=x onerror=alert(1)>' },
      'token',
    );
    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(request.html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('preserves an invitation capability in the verification link', async () => {
    const invitationToken = 'a'.repeat(64);

    await new AuthEmailService().sendVerification(
      { email: 'ada@example.com', name: 'Ada' },
      'verification-token',
      invitationToken,
    );

    const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(request.text).toContain(
      `https://itemize.cloud/verify-email?token=verification-token&invitation=${invitationToken}`,
    );
    expect(request.html).toContain(`invitation=${invitationToken}`);
  });
});
