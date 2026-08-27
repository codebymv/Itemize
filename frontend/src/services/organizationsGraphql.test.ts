import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  addOrganizationMemberViaGraphql,
  acceptOrganizationInvitationViaGraphql,
  createOrganizationInvitationViaGraphql,
  createOrganizationViaGraphql,
  deleteOrganizationViaGraphql,
  ensureDefaultOrganizationViaGraphql,
  getOrganizationActivityViaGraphql,
  getOrganizationMembersViaGraphql,
  getOrganizationInvitationPreviewViaGraphql,
  getOrganizationInvitationsViaGraphql,
  getOrganizationViaGraphql,
  getOrganizationsViaGraphql,
  getViewerOrganizationAllowanceViaGraphql,
  leaveOrganizationViaGraphql,
  removeOrganizationMemberViaGraphql,
  resendOrganizationInvitationViaGraphql,
  revokeOrganizationInvitationViaGraphql,
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

  it('reads the viewer workspace ownership allowance', async () => {
    const allowance = {
      ownedCount: 2,
      limit: 3,
      canCreate: true,
      sourcePlan: 'starter',
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { viewerOrganizationAllowance: allowance } }),
    );

    await expect(getViewerOrganizationAllowanceViaGraphql()).resolves.toEqual(allowance);
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.query).toContain('viewerOrganizationAllowance');
    expect(fetchCsrfToken).not.toHaveBeenCalled();
  });

  it('reads manager-visible organization activity without a CSRF token', async () => {
    const activity = [{
      id: '42',
      organizationId: 4,
      eventType: 'organization.ownership_transferred',
      actorUserId: 7,
      actorName: 'Ada',
      actorEmail: 'ada@test.itemize',
      targetUserId: 8,
      targetName: 'Grace',
      targetEmail: 'grace@test.itemize',
      payload: { targetUserId: 8 },
      occurredAt: '2026-08-27T12:00:00.000Z',
    }];
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { organizationActivity: activity } }),
    );

    await expect(getOrganizationActivityViaGraphql(4, 10)).resolves.toEqual(activity);
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables).toEqual({ organizationId: 4, first: 10 });
    expect(fetchCsrfToken).not.toHaveBeenCalled();
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

  it('maps the invitation preview, reservation, resend, revoke, and acceptance lifecycle', async () => {
    const csrfCallsBefore = vi.mocked(fetchCsrfToken).mock.calls.length;
    const invitation = {
      id: 15,
      organizationId: 4,
      organizationName: 'Alpha',
      email: 'invitee@test.itemize',
      role: 'member' as const,
      status: 'pending' as const,
      invitedBy: 7,
      invitedByName: 'Ada',
      invitedAt: organization.createdAt,
      expiresAt: '2026-09-03T12:00:00.000Z',
      lastSentAt: null,
      deliverySent: false,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { organizationInvitations: [invitation] } }))
      .mockResolvedValueOnce(response({ data: {
        organizationInvitationPreview: {
          organizationName: 'Alpha', email: invitation.email, role: 'member',
          status: 'pending', expiresAt: invitation.expiresAt, invitedByName: 'Ada',
        },
      } }))
      .mockResolvedValueOnce(response({ data: { createOrganizationInvitation: invitation } }))
      .mockResolvedValueOnce(response({ data: { resendOrganizationInvitation: invitation } }))
      .mockResolvedValueOnce(response({ data: { revokeOrganizationInvitation: true } }))
      .mockResolvedValueOnce(response({ data: {
        acceptOrganizationInvitation: { organizationId: 4, organizationName: 'Alpha', role: 'member' },
      } }));

    await expect(getOrganizationInvitationsViaGraphql(4)).resolves.toEqual([
      expect.objectContaining({ id: 15, organization_id: 4, delivery_sent: false }),
    ]);
    await expect(getOrganizationInvitationPreviewViaGraphql('a'.repeat(64)))
      .resolves.toMatchObject({ organization_name: 'Alpha', email: invitation.email });
    await createOrganizationInvitationViaGraphql(4, invitation.email, 'member');
    await resendOrganizationInvitationViaGraphql(4, 15);
    await revokeOrganizationInvitationViaGraphql(4, 15);
    await expect(acceptOrganizationInvitationViaGraphql('a'.repeat(64)))
      .resolves.toMatchObject({ organizationId: 4, role: 'member' });

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[2].variables).toEqual({
      organizationId: 4,
      input: { email: invitation.email, role: 'member' },
    });
    expect(bodies[3].variables).toEqual({ organizationId: 4, invitationId: 15 });
    expect(bodies[4].variables).toEqual({ organizationId: 4, invitationId: 15 });
    expect(bodies[5].variables).toEqual({ token: 'a'.repeat(64) });
    expect(vi.mocked(fetchCsrfToken).mock.calls.length - csrfCallsBefore).toBe(4);
  });
});
