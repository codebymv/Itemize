import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  addOrganizationMemberViaGraphql,
  createOrganizationViaGraphql,
  deleteOrganizationViaGraphql,
  ensureDefaultOrganizationViaGraphql,
  getOrganizationMembersViaGraphql,
  getOrganizationViaGraphql,
  getOrganizationsViaGraphql,
  leaveOrganizationViaGraphql,
  removeOrganizationMemberViaGraphql,
  selectOrganizationViaGraphql,
  transferOrganizationOwnershipViaGraphql,
  updateOrganizationMemberRoleViaGraphql,
  updateOrganizationViaGraphql,
} from './organizationsGraphql';

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

  it('maps detail, CRUD, and member administration without a REST fallback', async () => {
    const member = {
      id: 8,
      organizationId: 4,
      userId: 12,
      role: 'member' as const,
      invitedAt: organization.createdAt,
      joinedAt: null,
      invitedBy: 7,
      userName: 'Workspace Member',
      email: 'member@test.itemize',
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { organization } }))
      .mockResolvedValueOnce(
        response({ data: { organizationMembers: [member] } }),
      )
      .mockResolvedValueOnce(response({ data: { createOrganization: organization } }))
      .mockResolvedValueOnce(response({ data: { updateOrganization: organization } }))
      .mockResolvedValueOnce(response({ data: { deleteOrganization: { deletedId: 4 } } }))
      .mockResolvedValueOnce(response({ data: { addOrganizationMember: member } }))
      .mockResolvedValueOnce(
        response({ data: { updateOrganizationMemberRole: member } }),
      )
      .mockResolvedValueOnce(
        response({
          data: { transferOrganizationOwnership: { ...member, role: 'owner' } },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { removeOrganizationMember: { removedMemberId: 8 } } }),
      )
      .mockResolvedValueOnce(response({ data: { leaveOrganization: true } }));

    await expect(getOrganizationViaGraphql(4)).resolves.toMatchObject({ id: 4 });
    await expect(getOrganizationMembersViaGraphql(4)).resolves.toEqual([
      {
        id: 8,
        organization_id: 4,
        user_id: 12,
        role: 'member',
        invited_at: organization.createdAt,
        invited_by: 7,
        user_name: 'Workspace Member',
        email: 'member@test.itemize',
      },
    ]);
    await createOrganizationViaGraphql({ name: 'Alpha', settings: { tier: 1 } });
    await updateOrganizationViaGraphql(4, {
      name: 'Renamed',
      logo_url: undefined,
    });
    await deleteOrganizationViaGraphql(4);
    await addOrganizationMemberViaGraphql(4, member.email, 'member');
    await updateOrganizationMemberRoleViaGraphql(4, 8, 'viewer');
    await expect(
      transferOrganizationOwnershipViaGraphql(4, 8),
    ).resolves.toMatchObject({ role: 'owner' });
    await removeOrganizationMemberViaGraphql(4, 8);
    await leaveOrganizationViaGraphql(4);

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[2].variables).toEqual({
      input: { name: 'Alpha', settings: { tier: 1 } },
    });
    expect(bodies[3].variables).toEqual({
      id: 4,
      input: { name: 'Renamed', logoUrl: null },
    });
    expect(bodies[5].variables).toEqual({
      organizationId: 4,
      input: { email: member.email, role: 'member' },
    });
    expect(bodies[6].variables).toEqual({
      organizationId: 4,
      memberId: 8,
      role: 'viewer',
    });
    expect(bodies[7].variables).toEqual({ organizationId: 4, memberId: 8 });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(10);
  });
});
