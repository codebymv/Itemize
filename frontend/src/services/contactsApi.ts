/**
 * Contacts API Service
 * Handles all contact-related API calls
 */
import api from '@/lib/api';
import { Contact, ContactActivity, ContactsResponse, JsonRecord, Organization, OrganizationInvitation, OrganizationMember } from '@/types';
import {
  addContactActivityViaGraphql,
  bulkDeleteContactsViaGraphql,
  bulkUpdateContactsViaGraphql,
  createContactViaGraphql,
  deleteContactViaGraphql,
  getContactDetailBootstrapViaGraphql,
  getContactViaGraphql,
  getContactActivitiesViaGraphql,
  getContactContentViaGraphql,
  getContactsViaGraphql,
  updateContactViaGraphql,
  type ContactDetailBootstrap,
} from './contactsGraphql';
import {
  createOrganizationInvitationViaGraphql,
  createOrganizationViaGraphql,
  deleteOrganizationViaGraphql,
  ensureDefaultOrganizationViaGraphql,
  getOrganizationActivityViaGraphql,
  getOrganizationMembersViaGraphql,
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
  type OrganizationAllowance,
  type OrganizationActivity,
} from './organizationsGraphql';

const unwrapResponse = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
};

// ======================
// Organizations API
// ======================

export const getOrganizations = async (): Promise<Organization[]> => {
  return getOrganizationsViaGraphql();
};

export const getViewerOrganizationAllowance = async (): Promise<OrganizationAllowance> => {
  return getViewerOrganizationAllowanceViaGraphql();
};

export const getOrganization = async (id: number): Promise<Organization> => {
  return getOrganizationViaGraphql(id);
};

export const createOrganization = async (
  data: { name: string; settings?: JsonRecord },
  idempotencyKey: string,
): Promise<Organization> => {
  return createOrganizationViaGraphql(data, idempotencyKey);
};

export const updateOrganization = async (id: number, data: Partial<Organization>): Promise<Organization> => {
  return updateOrganizationViaGraphql(id, data);
};

export const deleteOrganization = async (id: number, idempotencyKey: string): Promise<void> => {
  await deleteOrganizationViaGraphql(id, idempotencyKey);
};

export const ensureDefaultOrganization = async (): Promise<Organization> => {
  return ensureDefaultOrganizationViaGraphql();
};

export const selectOrganization = async (id: number): Promise<Organization> => {
  return selectOrganizationViaGraphql(id);
};

// Organization members
export const getOrganizationMembers = async (orgId: number): Promise<OrganizationMember[]> => {
  return getOrganizationMembersViaGraphql(orgId);
};

export const getOrganizationActivity = async (
  orgId: number,
  first = 20,
): Promise<OrganizationActivity[]> => getOrganizationActivityViaGraphql(orgId, first);

export const inviteMember = async (
  orgId: number,
  email: string,
  role: string,
  idempotencyKey: string,
): Promise<OrganizationInvitation> => {
  return createOrganizationInvitationViaGraphql(orgId, email, role, idempotencyKey);
};

export const getOrganizationInvitations = async (orgId: number): Promise<OrganizationInvitation[]> =>
  getOrganizationInvitationsViaGraphql(orgId);

export const resendOrganizationInvitation = async (
  orgId: number,
  invitationId: number,
  idempotencyKey: string,
): Promise<OrganizationInvitation> =>
  resendOrganizationInvitationViaGraphql(orgId, invitationId, idempotencyKey);

export const revokeOrganizationInvitation = async (
  orgId: number,
  invitationId: number,
  idempotencyKey: string,
): Promise<void> => revokeOrganizationInvitationViaGraphql(
  orgId, invitationId, idempotencyKey,
);

export const updateMemberRole = async (
  orgId: number,
  memberId: number,
  role: string,
  idempotencyKey: string,
): Promise<OrganizationMember> => {
  return updateOrganizationMemberRoleViaGraphql(orgId, memberId, role, idempotencyKey);
};

export const removeMember = async (
  orgId: number,
  memberId: number,
  idempotencyKey: string,
): Promise<void> => {
  await removeOrganizationMemberViaGraphql(orgId, memberId, idempotencyKey);
};

export const transferOrganizationOwnership = async (
  orgId: number,
  memberId: number,
  idempotencyKey: string,
): Promise<OrganizationMember> => {
  return transferOrganizationOwnershipViaGraphql(orgId, memberId, idempotencyKey);
};

export const leaveOrganization = async (
  orgId: number,
  idempotencyKey: string,
): Promise<void> => {
  await leaveOrganizationViaGraphql(orgId, idempotencyKey);
};

// ======================
// Contacts API
// ======================

export interface ContactsQueryParams {
  search?: string;
  status?: 'active' | 'inactive' | 'archived';
  tags?: string[];
  assigned_to?: number;
  sort_by?: 'created_at' | 'updated_at' | 'first_name' | 'last_name' | 'email' | 'company';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  organization_id?: number;
}

export const getContacts = async (
  params: ContactsQueryParams = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<ContactsResponse> => {
  const orgId = organizationId ?? params.organization_id;
  return signal === undefined
    ? getContactsViaGraphql(params, orgId)
    : getContactsViaGraphql(params, orgId, signal);
};

export const getContact = async (id: number, organizationId?: number): Promise<Contact> => {
  return getContactViaGraphql(id, organizationId);
};

export const getContactDetailBootstrap = async (
  contactId: number,
  organizationId: number,
  signal?: AbortSignal,
): Promise<ContactDetailBootstrap> => (
  getContactDetailBootstrapViaGraphql(contactId, organizationId, signal)
);

export interface CreateContactData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  source?: string;
  status?: string;
  custom_fields?: JsonRecord;
  tags?: string[];
  assigned_to?: number;
  organization_id?: number;
}

export const createContact = async (
  data: CreateContactData,
  idempotencyKey: string,
): Promise<Contact> => {
  return createContactViaGraphql(data, idempotencyKey);
};

export const updateContact = async (id: number, data: Partial<CreateContactData>): Promise<Contact> => {
  return updateContactViaGraphql(id, data);
};

export const deleteContact = async (id: number, organizationId?: number): Promise<void> => {
  return deleteContactViaGraphql(id, organizationId);
};

// Bulk operations
export interface BulkUpdateData {
  contact_ids: number[];
  updates: {
    status?: string;
    assigned_to?: number | null;
    tags?: string[];
    tags_mode?: 'set' | 'add' | 'remove';
  };
  organization_id?: number;
}

export const bulkUpdateContacts = async (data: BulkUpdateData): Promise<{ message: string; updated_ids: number[] }> => {
  return bulkUpdateContactsViaGraphql(data);
};

export const bulkDeleteContacts = async (contactIds: number[], organizationId?: number): Promise<{ message: string; deleted_ids: number[] }> => {
  return bulkDeleteContactsViaGraphql(contactIds, organizationId);
};

// Activities
export const getContactActivities = async (
  contactId: number,
  params: { type?: string; limit?: number; offset?: number } = {},
  organizationId?: number
): Promise<ContactActivity[]> => {
  return getContactActivitiesViaGraphql(contactId, params, organizationId);
};

export const addContactActivity = async (
  contactId: number,
  data: {
    type: string;
    title?: string;
    content?: JsonRecord;
    metadata?: JsonRecord;
  },
  organizationId?: number
): Promise<ContactActivity> => {
  return addContactActivityViaGraphql(contactId, data, organizationId);
};

// Related content
export type ContactContentResponse = {
  lists: Array<{ id: number; title: string; category: string; created_at: string }>;
  notes: Array<{ id: number; title: string; category: string; created_at: string }>;
  whiteboards: Array<{ id: number; title: string; category: string; created_at: string }>;
  wireframes: Array<{ id: number; title: string; category: string; created_at: string }>;
};

export const getContactContent = async (
  contactId: number,
  organizationId?: number,
): Promise<ContactContentResponse> => {
  return getContactContentViaGraphql(contactId, organizationId);
};

// CSV Import/Export
export interface ImportContactData {
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  jobTitle?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  status?: string;
  tags?: string;
}

export interface ImportResult {
  message: string;
  imported: number;
  skipped: number;
  replayed: boolean;
  errors: Array<{ row: number; error: string }>;
  errorCount: number;
  errorsTruncated: boolean;
}

export const exportContactsCSV = async (
  organizationId: number,
  filters?: { status?: string; tags?: string[] }
): Promise<void> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.tags) params.set('tags', filters.tags.join(','));

  const response = await api.get('/api/contacts/export/csv', {
    params,
    headers: { 'x-organization-id': organizationId.toString() },
    responseType: 'blob',
  });

  // Create download
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export const importContactsCSV = async (
  contacts: ImportContactData[],
  organizationId: number,
  options: { idempotencyKey: string; skipDuplicates?: boolean },
): Promise<ImportResult> => {
  const { idempotencyKey, skipDuplicates = true } = options;
  const response = await api.post(
    '/api/contacts/import/csv',
    { contacts, skipDuplicates },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
        'x-organization-id': organizationId.toString(),
      },
      retryOnNetworkError: true,
    },
  );
  return unwrapResponse<ImportResult>(response.data);
};

// Export all
export default {
  // Organizations
  getOrganizations,
  getViewerOrganizationAllowance,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  ensureDefaultOrganization,
  selectOrganization,
  getOrganizationMembers,
  getOrganizationInvitations,
  inviteMember,
  resendOrganizationInvitation,
  revokeOrganizationInvitation,
  updateMemberRole,
  removeMember,
  transferOrganizationOwnership,
  leaveOrganization,
  // Contacts
  getContacts,
  getContact,
  getContactDetailBootstrap,
  createContact,
  updateContact,
  deleteContact,
  bulkUpdateContacts,
  bulkDeleteContacts,
  getContactActivities,
  addContactActivity,
  getContactContent,
};
