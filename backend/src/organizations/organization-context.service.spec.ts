import { GraphQLError } from 'graphql';
import { OrganizationContextService } from './organization-context.service';

const errorCode = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return String((error as GraphQLError).extensions.code);
  }
};

describe('OrganizationContextService', () => {
  const query = jest.fn();
  const service = new OrganizationContextService({ query } as never);

  beforeEach(() => query.mockReset());

  it('rejects malformed headers before querying PostgreSQL', async () => {
    expect(await errorCode(service.resolve(7, '1 OR 1=1'))).toBe(
      'BAD_USER_INPUT',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves explicit organization membership and current role', async () => {
    query.mockResolvedValue({ rows: [{ organization_id: 42, role: 'admin' }] });
    await expect(service.resolve(7, '42')).resolves.toEqual({
      organizationId: 42,
      organizationRole: 'admin',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [42, 7]);
  });

  it('falls back to a verified default organization', async () => {
    query.mockResolvedValue({
      rows: [{ default_organization_id: 91, role: 'owner' }],
    });
    await expect(service.resolve(7, undefined)).resolves.toEqual({
      organizationId: 91,
      organizationRole: 'owner',
    });
  });

  it('does not reveal whether an explicit organization exists to outsiders', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await errorCode(service.resolve(7, '42'))).toBe('FORBIDDEN');
  });

  it('maps database failures to a stable service error', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    expect(await errorCode(service.resolve(7, '42'))).toBe(
      'SERVICE_UNAVAILABLE',
    );
  });
});
