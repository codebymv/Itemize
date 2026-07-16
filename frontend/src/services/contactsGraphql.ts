import type { Contact, ContactAddress, ContactsResponse, JsonRecord } from '@/types';
import type { ContactsQueryParams } from './contactsApi';
import { GraphqlRequestError, graphqlRequest } from './graphqlClient';

type GraphqlContact = {
  id: number;
  organizationId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  address: unknown;
  source: 'MANUAL' | 'IMPORT' | 'FORM' | 'INTEGRATION' | 'API';
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  customFields: unknown;
  tags: string[];
  assignedToId: number | null;
  assignedToName: string | null;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

type GraphqlPageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const contactFields = `
  id
  organizationId
  firstName
  lastName
  email
  phone
  company
  jobTitle
  address
  source
  status
  customFields
  tags
  assignedToId
  assignedToName
  createdById
  createdByName
  createdAt
  updatedAt
`;

const contactsQuery = `
  query ContactReads($filter: ContactFilterInput, $page: PageInput, $sort: ContactSortInput) {
    contacts(filter: $filter, page: $page, sort: $sort) {
      nodes { ${contactFields} }
      pageInfo { page pageSize total totalPages }
    }
  }
`;

const contactQuery = `
  query ContactRead($id: Int!) {
    contact(id: $id) { ${contactFields} }
  }
`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const mapContact = (contact: GraphqlContact): Contact => ({
  id: contact.id,
  organization_id: contact.organizationId,
  first_name: contact.firstName ?? undefined,
  last_name: contact.lastName ?? undefined,
  email: contact.email ?? undefined,
  phone: contact.phone ?? undefined,
  company: contact.company ?? undefined,
  job_title: contact.jobTitle ?? undefined,
  address: (isRecord(contact.address) ? contact.address : {}) as ContactAddress,
  source: contact.source.toLowerCase() as Contact['source'],
  status: contact.status.toLowerCase() as Contact['status'],
  custom_fields: (isRecord(contact.customFields) ? contact.customFields : {}) as JsonRecord,
  tags: contact.tags ?? [],
  assigned_to: contact.assignedToId ?? undefined,
  assigned_to_name: contact.assignedToName ?? undefined,
  created_by: contact.createdById ?? undefined,
  created_by_name: contact.createdByName ?? undefined,
  created_at: contact.createdAt,
  updated_at: contact.updatedAt,
});

const sortFields: Record<NonNullable<ContactsQueryParams['sort_by']>, string> = {
  company: 'COMPANY',
  created_at: 'CREATED_AT',
  email: 'EMAIL',
  first_name: 'FIRST_NAME',
  last_name: 'LAST_NAME',
  updated_at: 'UPDATED_AT',
};

export const getContactsViaGraphql = async (
  params: ContactsQueryParams = {},
  organizationId?: number,
): Promise<ContactsResponse> => {
  const filter = {
    ...(params.search ? { search: params.search } : {}),
    ...(params.status ? { status: params.status.toUpperCase() } : {}),
    ...(params.tags?.length ? { tags: params.tags } : {}),
    ...(params.assigned_to !== undefined
      ? { assignedToId: params.assigned_to }
      : {}),
  };
  const variables = {
    filter,
    page: {
      page: params.page ?? 1,
      pageSize: params.limit ?? 50,
    },
    sort: {
      field: sortFields[params.sort_by ?? 'created_at'],
      direction: (params.sort_order ?? 'desc').toUpperCase(),
    },
  };
  const data = await graphqlRequest<{
    contacts: { nodes: GraphqlContact[]; pageInfo: GraphqlPageInfo };
  }, typeof variables>(
    contactsQuery,
    variables,
    organizationId ?? params.organization_id,
  );

  return {
    contacts: data.contacts.nodes.map(mapContact),
    pagination: {
      page: data.contacts.pageInfo.page,
      limit: data.contacts.pageInfo.pageSize,
      total: data.contacts.pageInfo.total,
      totalPages: data.contacts.pageInfo.totalPages,
    },
  };
};

export const getContactViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Contact> => {
  const variables = { id };
  const data = await graphqlRequest<{ contact: GraphqlContact | null }, typeof variables>(
    contactQuery,
    variables,
    organizationId,
  );
  if (!data.contact) {
    throw new GraphqlRequestError('Contact not found', 200, 'NOT_FOUND');
  }
  return mapContact(data.contact);
};
