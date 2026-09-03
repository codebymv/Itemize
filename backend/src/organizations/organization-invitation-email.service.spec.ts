import { OrganizationInvitationEmailService } from './organization-invitation-email.service';

describe('OrganizationInvitationEmailService', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
    jest.restoreAllMocks();
  });

  it('sends a branded, expiring invitation to the exact invited email', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.APP_URL = 'https://itemize.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      { ok: true } as Response,
    );
    const token = 'a'.repeat(64);

    await expect(new OrganizationInvitationEmailService().send({
      email: 'invitee@example.com',
      organizationName: 'Alpha & Co',
      invitedByName: 'Ada <Owner>',
      role: 'member',
    }, token, 'organization-invitation:4:request-1')).resolves.toBe(true);

    const request = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(request.to).toEqual(['invitee@example.com']);
    expect(request.subject).toContain('Alpha & Co');
    expect(request.text).toContain(`https://itemize.test/invite/${token}`);
    expect(request.html).toContain('Alpha &amp; Co');
    expect(request.html).not.toContain('Ada <Owner>');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({
        'Idempotency-Key': 'organization-invitation:4:request-1',
      }),
    }));
  });

  it('does not contact a provider when delivery is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(new OrganizationInvitationEmailService().send({
      email: 'invitee@example.com',
      organizationName: 'Alpha',
      invitedByName: null,
      role: 'viewer',
    }, 'a'.repeat(64), 'organization-invitation:4:request-2')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
