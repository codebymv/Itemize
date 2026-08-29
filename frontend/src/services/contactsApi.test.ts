import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  addContactActivity,
  bulkDeleteContacts,
  bulkUpdateContacts,
  createContact,
  createOrganization,
  deleteContact,
  deleteOrganization,
  ensureDefaultOrganization,
  getContact,
  getContactActivities,
  getContactContent,
  getContacts,
  getOrganization,
  getOrganizationActivity,
  getOrganizationInvitations,
  getOrganizationMembers,
  getOrganizations,
  getViewerOrganizationAllowance,
  inviteMember,
  leaveOrganization,
  removeMember,
  resendOrganizationInvitation,
  revokeOrganizationInvitation,
  selectOrganization,
  transferOrganizationOwnership,
  updateContact,
  updateMemberRole,
  updateOrganization,
} from './contactsApi';
import {
  addContactActivityViaGraphql,
  bulkDeleteContactsViaGraphql,
  bulkUpdateContactsViaGraphql,
  createContactViaGraphql,
  deleteContactViaGraphql,
  getContactViaGraphql,
  getContactActivitiesViaGraphql,
  getContactContentViaGraphql,
  getContactsViaGraphql,
  updateContactViaGraphql,
} from './contactsGraphql';
import {
  createOrganizationInvitationViaGraphql,
  createOrganizationViaGraphql,
  deleteOrganizationViaGraphql,
  ensureDefaultOrganizationViaGraphql,
  getOrganizationInvitationsViaGraphql,
  getOrganizationActivityViaGraphql,
  getOrganizationMembersViaGraphql,
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
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./contactsGraphql', () => ({
  addContactActivityViaGraphql: vi.fn(),
  bulkDeleteContactsViaGraphql: vi.fn(),
  bulkUpdateContactsViaGraphql: vi.fn(),
  getContactViaGraphql: vi.fn(),
  getContactActivitiesViaGraphql: vi.fn(),
  getContactContentViaGraphql: vi.fn(),
  getContactsViaGraphql: vi.fn(),
  createContactViaGraphql: vi.fn(),
  updateContactViaGraphql: vi.fn(),
  deleteContactViaGraphql: vi.fn(),
}));

vi.mock('./organizationsGraphql', () => ({
  createOrganizationInvitationViaGraphql: vi.fn(),
  createOrganizationViaGraphql: vi.fn(),
  deleteOrganizationViaGraphql: vi.fn(),
  ensureDefaultOrganizationViaGraphql: vi.fn(),
  getOrganizationInvitationsViaGraphql: vi.fn(),
  getOrganizationActivityViaGraphql: vi.fn(),
  getOrganizationMembersViaGraphql: vi.fn(),
  getOrganizationViaGraphql: vi.fn(),
  getOrganizationsViaGraphql: vi.fn(),
  getViewerOrganizationAllowanceViaGraphql: vi.fn(),
  leaveOrganizationViaGraphql: vi.fn(),
  removeOrganizationMemberViaGraphql: vi.fn(),
  resendOrganizationInvitationViaGraphql: vi.fn(),
  revokeOrganizationInvitationViaGraphql: vi.fn(),
  selectOrganizationViaGraphql: vi.fn(),
  transferOrganizationOwnershipViaGraphql: vi.fn(),
  updateOrganizationMemberRoleViaGraphql: vi.fn(),
  updateOrganizationViaGraphql: vi.fn(),
}));

describe('contacts API GraphQL transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes the complete organization administration surface directly through GraphQL', async () => {
    const organization = {
      id: 4,
      name: 'Alpha',
      slug: 'alpha',
      settings: {},
      role: 'owner' as const,
      is_default: true,
      created_at: '2026-07-18T12:00:00.000Z',
      updated_at: '2026-07-18T12:01:00.000Z',
    };
    const member = {
      id: 8,
      organization_id: 4,
      user_id: 9,
      role: 'member' as const,
      invited_at: organization.created_at,
      email: 'member@test.itemize',
    };
    const invitation = {
      id: 12,
      organization_id: 4,
      organization_name: 'Alpha',
      email: member.email,
      role: 'member' as const,
      status: 'pending' as const,
      invited_at: organization.created_at,
      expires_at: '2026-07-25T12:00:00.000Z',
      delivery_sent: true,
    };
    vi.mocked(getOrganizationsViaGraphql).mockResolvedValue([organization]);
    vi.mocked(getViewerOrganizationAllowanceViaGraphql).mockResolvedValue({
      ownedCount: 1,
      limit: 3,
      canCreate: true,
      sourcePlan: 'starter',
    });
    vi.mocked(getOrganizationViaGraphql).mockResolvedValue(organization);
    vi.mocked(createOrganizationViaGraphql).mockResolvedValue(organization);
    vi.mocked(updateOrganizationViaGraphql).mockResolvedValue(organization);
    vi.mocked(getOrganizationMembersViaGraphql).mockResolvedValue([member]);
    vi.mocked(getOrganizationInvitationsViaGraphql).mockResolvedValue([invitation]);
    vi.mocked(getOrganizationActivityViaGraphql).mockResolvedValue([]);
    vi.mocked(createOrganizationInvitationViaGraphql).mockResolvedValue(invitation);
    vi.mocked(resendOrganizationInvitationViaGraphql).mockResolvedValue(invitation);
    vi.mocked(updateOrganizationMemberRoleViaGraphql).mockResolvedValue(member);
    vi.mocked(transferOrganizationOwnershipViaGraphql).mockResolvedValue({
      ...member,
      role: 'owner',
    });
    vi.mocked(ensureDefaultOrganizationViaGraphql).mockResolvedValue(organization);
    vi.mocked(selectOrganizationViaGraphql).mockResolvedValue(organization);

    await expect(getOrganizations()).resolves.toEqual([organization]);
    await expect(getViewerOrganizationAllowance()).resolves.toMatchObject({
      ownedCount: 1,
      limit: 3,
      canCreate: true,
    });
    await expect(getOrganization(4)).resolves.toEqual(organization);
    await expect(createOrganization({ name: 'Alpha' })).resolves.toEqual(organization);
    await expect(updateOrganization(4, { name: 'Alpha' })).resolves.toEqual(organization);
    await deleteOrganization(4);
    await expect(ensureDefaultOrganization()).resolves.toEqual(organization);
    await expect(selectOrganization(4)).resolves.toEqual(organization);
    await expect(getOrganizationMembers(4)).resolves.toEqual([member]);
    await expect(getOrganizationInvitations(4)).resolves.toEqual([invitation]);
    await expect(getOrganizationActivity(4, 10)).resolves.toEqual([]);
    await expect(inviteMember(4, member.email, 'member')).resolves.toEqual(invitation);
    await expect(resendOrganizationInvitation(4, 12)).resolves.toEqual(invitation);
    await revokeOrganizationInvitation(4, 12);
    await expect(updateMemberRole(4, 8, 'viewer')).resolves.toEqual(member);
    await expect(transferOrganizationOwnership(4, 8)).resolves.toMatchObject({
      role: 'owner',
    });
    await removeMember(4, 8);
    await leaveOrganization(4);

    expect(createOrganizationViaGraphql).toHaveBeenCalledWith({ name: 'Alpha' });
    expect(updateOrganizationViaGraphql).toHaveBeenCalledWith(4, { name: 'Alpha' });
    expect(deleteOrganizationViaGraphql).toHaveBeenCalledWith(4);
    expect(selectOrganizationViaGraphql).toHaveBeenCalledWith(4);
    expect(getOrganizationInvitationsViaGraphql).toHaveBeenCalledWith(4);
    expect(getOrganizationActivityViaGraphql).toHaveBeenCalledWith(4, 10);
    expect(createOrganizationInvitationViaGraphql).toHaveBeenCalledWith(
      4,
      member.email,
      'member',
    );
    expect(resendOrganizationInvitationViaGraphql).toHaveBeenCalledWith(4, 12);
    expect(revokeOrganizationInvitationViaGraphql).toHaveBeenCalledWith(4, 12);
    expect(updateOrganizationMemberRoleViaGraphql).toHaveBeenCalledWith(
      4,
      8,
      'viewer',
    );
    expect(transferOrganizationOwnershipViaGraphql).toHaveBeenCalledWith(4, 8);
    expect(removeOrganizationMemberViaGraphql).toHaveBeenCalledWith(4, 8);
    expect(leaveOrganizationViaGraphql).toHaveBeenCalledWith(4);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('routes list and detail reads through GraphQL', async () => {
    vi.mocked(getContactsViaGraphql).mockResolvedValue({
      contacts: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    vi.mocked(getContactViaGraphql).mockResolvedValue({ id: 11 } as never);

    await getContacts({ page: 1 }, 42);
    await getContact(11, 42);

    expect(getContactsViaGraphql).toHaveBeenCalledWith({ page: 1 }, 42);
    expect(getContactViaGraphql).toHaveBeenCalledWith(11, 42);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('routes writes through GraphQL', async () => {
    vi.mocked(createContactViaGraphql).mockResolvedValue({ id: 12 } as never);
    vi.mocked(updateContactViaGraphql).mockResolvedValue({ id: 12 } as never);
    vi.mocked(deleteContactViaGraphql).mockResolvedValue();
    const input = { first_name: 'Grace', organization_id: 42 };

    await createContact(input);
    await updateContact(12, input);
    await deleteContact(12, 42);

    expect(createContactViaGraphql).toHaveBeenCalledWith(input);
    expect(updateContactViaGraphql).toHaveBeenCalledWith(12, input);
    expect(deleteContactViaGraphql).toHaveBeenCalledWith(12, 42);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('routes bulk writes through GraphQL', async () => {
    const update = {
      contact_ids: [11],
      updates: { tags: ['vip'], tags_mode: 'add' as const },
      organization_id: 42,
    };

    vi.mocked(bulkUpdateContactsViaGraphql).mockResolvedValue({
      updated_ids: [11], message: '1 contacts updated',
    });
    vi.mocked(bulkDeleteContactsViaGraphql).mockResolvedValue({
      deleted_ids: [11], message: '1 contacts deleted',
    });
    await bulkUpdateContacts(update);
    await bulkDeleteContacts([11], 42);
    expect(bulkUpdateContactsViaGraphql).toHaveBeenCalledWith(update);
    expect(bulkDeleteContactsViaGraphql).toHaveBeenCalledWith([11], 42);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('routes both activity operations through GraphQL', async () => {
    vi.mocked(getContactActivitiesViaGraphql).mockResolvedValue([]);
    vi.mocked(addContactActivityViaGraphql).mockResolvedValue({ id: 91 } as never);
    const params = { limit: 50 };
    const input = { type: 'note', content: { body: 'GraphQL' } };

    await getContactActivities(11, params, 42);
    await addContactActivity(11, input, 42);

    expect(getContactActivitiesViaGraphql).toHaveBeenCalledWith(11, params, 42);
    expect(addContactActivityViaGraphql).toHaveBeenCalledWith(11, input, 42);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('routes contact content through GraphQL', async () => {
    const content = { lists: [], notes: [], whiteboards: [], wireframes: [] };
    vi.mocked(getContactContentViaGraphql).mockResolvedValue(content);
    await expect(getContactContent(11, 42)).resolves.toEqual(content);
    expect(getContactContentViaGraphql).toHaveBeenCalledWith(11, 42);
    expect(api.get).not.toHaveBeenCalled();
  });
});
