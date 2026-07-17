import type { Contact, ContactAddress, ContactsResponse, JsonRecord } from '@/types';
import type { ContactsQueryParams, CreateContactData } from './contactsApi';
import {
  GraphqlRequestError,
  graphqlMutationRequest,
  graphqlRequest,
} from './graphqlClient';

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

const createContactMutation = `
  mutation CreateContact($input: CreateContactInput!) {
    createContact(input: $input) { ${contactFields} }
  }
`;

const updateContactMutation = `
  mutation UpdateContact($id: Int!, $input: UpdateContactInput!) {
    updateContact(id: $id, input: $input) { ${contactFields} }
  }
`;

const deleteContactMutation = `
  mutation DeleteContact($id: Int!) {
    deleteContact(id: $id) { deletedId }
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

const has = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const contactInput = (data: Partial<CreateContactData>): Record<string, unknown> => ({
  ...(has(data, 'first_name') ? { firstName: data.first_name } : {}),
  ...(has(data, 'last_name') ? { lastName: data.last_name } : {}),
  ...(has(data, 'email') ? { email: data.email } : {}),
  ...(has(data, 'phone') ? { phone: data.phone } : {}),
  ...(has(data, 'company') ? { company: data.company } : {}),
  ...(has(data, 'job_title') ? { jobTitle: data.job_title } : {}),
  ...(has(data, 'address') ? { address: data.address } : {}),
  ...(has(data, 'source') && data.source
    ? { source: data.source.toUpperCase() }
    : {}),
  ...(has(data, 'status') && data.status
    ? { status: data.status.toUpperCase() }
    : {}),
  ...(has(data, 'custom_fields') ? { customFields: data.custom_fields } : {}),
  ...(has(data, 'tags') ? { tags: data.tags } : {}),
  ...(has(data, 'assigned_to') ? { assignedToId: data.assigned_to } : {}),
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

export const createContactViaGraphql = async (
  input: CreateContactData,
): Promise<Contact> => {
  const organizationId = input.organization_id;
  const variables = { input: contactInput(input) };
  const data = await graphqlMutationRequest<
    { createContact: GraphqlContact },
    typeof variables
  >(createContactMutation, variables, organizationId);
  return mapContact(data.createContact);
};

export const updateContactViaGraphql = async (
  id: number,
  input: Partial<CreateContactData>,
): Promise<Contact> => {
  const variables = { id, input: contactInput(input) };
  const data = await graphqlMutationRequest<
    { updateContact: GraphqlContact },
    typeof variables
  >(updateContactMutation, variables, input.organization_id);
  return mapContact(data.updateContact);
};

export const deleteContactViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  const variables = { id };
  const data = await graphqlMutationRequest<
    { deleteContact: { deletedId: number } },
    typeof variables
  >(deleteContactMutation, variables, organizationId);
  if (data.deleteContact.deletedId !== id) {
    throw new GraphqlRequestError('GraphQL delete confirmation did not match the contact', 200);
  }
};
