import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  ensureDefaultOrganizationViaGraphql,
  getOrganizationsViaGraphql,
  selectOrganizationViaGraphql,
} from './organizationsGraphql';
import {
  isOrganizationGraphqlMutationsEnabled,
  isOrganizationGraphqlReadsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const organization = {
  id: 4,
  name: 'Alpha',
  slug: 'alpha',
  settings: { personal: true },
  logoUrl: 'https://cdn.test/alpha.png',
  role: 'owner' as const,
  isDefault: true,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('organization GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('organization-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps read and selection rollback flags independent and default-off', () => {
    vi.stubEnv('VITE_ORGANIZATION_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_ORGANIZATION_MUTATIONS_GRAPHQL', 'false');
    expect(isOrganizationGraphqlReadsEnabled()).toBe(false);
    expect(isOrganizationGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_ORGANIZATION_READS_GRAPHQL', 'true');
    expect(isOrganizationGraphqlReadsEnabled()).toBe(true);
    expect(isOrganizationGraphqlMutationsEnabled()).toBe(false);

    vi.stubEnv('VITE_ORGANIZATION_MUTATIONS_GRAPHQL', 'true');
    expect(isOrganizationGraphqlMutationsEnabled()).toBe(true);
  });

  it('maps organization membership casing into the retained UI shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { organizations: [organization] } }),
    );

    await expect(getOrganizationsViaGraphql()).resolves.toEqual([
      {
        id: 4,
        name: 'Alpha',
        slug: 'alpha',
        settings: { personal: true },
        logo_url: 'https://cdn.test/alpha.png',
        role: 'owner',
        is_default: true,
        created_at: organization.createdAt,
        updated_at: organization.updatedAt,
      },
    ]);
  });

  it('uses CSRF-protected mutations for selection and default repair', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { selectOrganization: organization } }),
      )
      .mockResolvedValueOnce(
        response({ data: { ensureDefaultOrganization: organization } }),
      );

    await expect(selectOrganizationViaGraphql(4)).resolves.toMatchObject({
      id: 4,
      is_default: true,
    });
    await expect(ensureDefaultOrganizationViaGraphql()).resolves.toMatchObject({
      id: 4,
      is_default: true,
    });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables).toEqual({ id: 4 });
    expect(bodies[1].variables).toEqual({});
    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
  });
});
