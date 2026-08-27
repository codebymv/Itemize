import { OrganizationOwnershipEmailService } from './organization-ownership-email.service';

describe('OrganizationOwnershipEmailService', () => {
  const originalEnvironment = { ...process.env };
  let service: OrganizationOwnershipEmailService;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnvironment, NODE_ENV: 'test' };
    service = new OrganizationOwnershipEmailService();
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('sends a branded confirmation to both sides of the handoff', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.APP_URL = 'https://itemize.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 202 }),
    );

    await service.send({
      organizationName: 'Ada & Grace',
      previousOwner: { name: 'Ada <Owner>', email: 'ada@example.com' },
      newOwner: { name: 'Grace Hopper', email: 'grace@example.com' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(requests.map((request) => request.to[0]).sort()).toEqual([
      'ada@example.com',
      'grace@example.com',
    ]);
    expect(requests[0].html).toContain('https://itemize.test/organization-settings');
    expect(requests[0].html).not.toContain('Ada <Owner>');
  });

  it('does not fail the completed transfer when email is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(service.send({
      organizationName: 'Alpha',
      previousOwner: { name: null, email: 'old@example.com' },
      newOwner: { name: null, email: 'new@example.com' },
    })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
