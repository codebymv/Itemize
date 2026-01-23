/**
 * Contacts API Service
 * Handles all contact-related API calls
 */
import api from '@/lib/api';
import { Contact, ContactActivity, ContactsResponse, Organization, OrganizationMember } from '@/types';

// ======================
// Organizations API
// ======================

export const getOrganizations = async (): Promise<Organization[]> => {
  const response = await api.get('/api/organizations');
  return response.data;
};

export const getOrganization = async (id: number): Promise<Organization> => {
  const response = await api.get(`/api/organizations/${id}`);
  return response.data;
};

export const createOrganization = async (data: { name: string; settings?: Record<string, any> }): Promise<Organization> => {
  const response = await api.post('/api/organizations', data);
  return response.data;
};

export const updateOrganization = async (id: number, data: Partial<Organization>): Promise<Organization> => {
  const response = await api.put(`/api/organizations/${id}`, data);
  return response.data;
};

export const deleteOrganization = async (id: number): Promise<void> => {
  await api.delete(`/api/organizations/${id}`);
};

export const ensureDefaultOrganization = async (): Promise<Organization> => {
  const response = await api.post('/api/organizations/ensure-default');
  return response.data;
};

// Organization members
export const getOrganizationMembers = async (orgId: number): Promise<OrganizationMember[]> => {
  const response = await api.get(`/api/organizations/${orgId}/members`);
  return response.data;
};

export const inviteMember = async (orgId: number, email: string, role: string): Promise<OrganizationMember> => {
  const response = await api.post(`/api/organizations/${orgId}/members`, { email, role });
  return response.data;
};

export const updateMemberRole = async (orgId: number, memberId: number, role: string): Promise<OrganizationMember> => {
  const response = await api.put(`/api/organizations/${orgId}/members/${memberId}`, { role });
  return response.data;
};

export const removeMember = async (orgId: number, memberId: number): Promise<void> => {
  await api.delete(`/api/organizations/${orgId}/members/${memberId}`);
};

export const leaveOrganization = async (orgId: number): Promise<void> => {
  await api.post(`/api/organizations/${orgId}/leave`);
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

export const getContacts = async (params: ContactsQueryParams = {}): Promise<ContactsResponse> => {
  const response = await api.get('/api/contacts', {
    params,
    headers: params.organization_id ? { 'x-organization-id': params.organization_id.toString() } : {}
  });
  return response.data;
};

export const getContact = async (id: number, organizationId?: number): Promise<Contact> => {
  const response = await api.get(`/api/contacts/${id}`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return response.data;
};

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
  custom_fields?: Record<string, any>;
  tags?: string[];
  assigned_to?: number;
  organization_id?: number;
}

export const createContact = async (data: CreateContactData): Promise<Contact> => {
  const response = await api.post('/api/contacts', data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return response.data;
};

export const updateContact = async (id: number, data: Partial<CreateContactData>): Promise<Contact> => {
  const response = await api.put(`/api/contacts/${id}`, data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return response.data;
};

export const deleteContact = async (id: number, organizationId?: number): Promise<void> => {
  await api.delete(`/api/contacts/${id}`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
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
  const response = await api.post('/api/contacts/bulk-update', data, {
    headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {}
  });
  return response.data;
};

export const bulkDeleteContacts = async (contactIds: number[], organizationId?: number): Promise<{ message: string; deleted_ids: number[] }> => {
  const response = await api.post('/api/contacts/bulk-delete',
    { contact_ids: contactIds },
    { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
  );
  return response.data;
};

// Activities
export const getContactActivities = async (
  contactId: number,
  params: { type?: string; limit?: number; offset?: number } = {},
  organizationId?: number
): Promise<ContactActivity[]> => {
  const response = await api.get(`/api/contacts/${contactId}/activities`, {
    params,
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return response.data;
};

export const addContactActivity = async (
  contactId: number,
  data: {
    type: string;
    title?: string;
    content?: Record<string, any>;
    metadata?: Record<string, any>;
  },
  organizationId?: number
): Promise<ContactActivity> => {
  const response = await api.post(`/api/contacts/${contactId}/activities`, data, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return response.data;
};

// Related content
export const getContactContent = async (contactId: number, organizationId?: number): Promise<{
  lists: Array<{ id: number; title: string; category: string; created_at: string }>;
  notes: Array<{ id: number; title: string; category: string; created_at: string }>;
  whiteboards: Array<{ id: number; title: string; category: string; created_at: string }>;
}> => {
  const response = await api.get(`/api/contacts/${contactId}/content`, {
    headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
  });
  return response.data;
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
  errors: Array<{ row: number; error: string }>;
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
  skipDuplicates: boolean = true
): Promise<ImportResult> => {
  const response = await api.post(
    '/api/contacts/import/csv',
    { contacts, skipDuplicates },
    { headers: { 'x-organization-id': organizationId.toString() } }
  );
  return response.data;
};

// Export all
export default {
  // Organizations
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  ensureDefaultOrganization,
  getOrganizationMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  leaveOrganization,
  // Contacts
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  bulkUpdateContacts,
  bulkDeleteContacts,
  getContactActivities,
  addContactActivity,
  getContactContent,
};
