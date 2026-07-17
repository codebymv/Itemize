import type {
  Contact,
  ContactActivity,
  ContactAddress,
  ContactsResponse,
  JsonRecord,
} from '@/types';
import type {
  BulkUpdateData,
  ContactsQueryParams,
  CreateContactData,
} from './contactsApi';
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

type GraphqlContactActivity = {
  id: number;
  contactId: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  type: Uppercase<ContactActivity['type']>;
  title: string | null;
  content: unknown;
  metadata: unknown;
  createdAt: string;
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

const bulkUpdateContactsMutation = `
  mutation BulkUpdateContacts($input: BulkUpdateContactsInput!) {
    bulkUpdateContacts(input: $input) {
      requestedIds
      matchedIds
      changedIds
      rejectedIds
    }
  }
`;

const bulkDeleteContactsMutation = `
  mutation BulkDeleteContacts($contactIds: [Int!]!) {
    bulkDeleteContacts(contactIds: $contactIds) {
      requestedIds
      matchedIds
      changedIds
      rejectedIds
    }
  }
`;

const contactActivityFields = `
  id
  contactId
  userId
  userName
  userEmail
  type
  title
  content
  metadata
  createdAt
`;

const contactActivitiesQuery = `
  query ContactActivities($contactId: Int!, $filter: ContactActivityFilterInput, $page: PageInput) {
    contactActivities(contactId: $contactId, filter: $filter, page: $page) {
      nodes { ${contactActivityFields} }
      pageInfo { page pageSize total totalPages }
    }
  }
`;

const addContactActivityMutation = `
  mutation AddContactActivity($contactId: Int!, $input: CreateContactActivityInput!) {
    addContactActivity(contactId: $contactId, input: $input) {
      ${contactActivityFields}
    }
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

const mapContactActivity = (activity: GraphqlContactActivity): ContactActivity => ({
  id: activity.id,
  contact_id: activity.contactId,
  user_id: activity.userId ?? undefined,
  user_name: activity.userName ?? undefined,
  user_email: activity.userEmail ?? undefined,
  type: activity.type.toLowerCase() as ContactActivity['type'],
  title: activity.title ?? undefined,
  content: (isRecord(activity.content) ? activity.content : {}) as JsonRecord,
  metadata: (isRecord(activity.metadata) ? activity.metadata : {}) as JsonRecord,
  created_at: activity.createdAt,
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

export const bulkUpdateContactsViaGraphql = async (
  data: BulkUpdateData,
): Promise<{ message: string; updated_ids: number[] }> => {
  const updates = data.updates;
  const variables = {
    input: {
      contactIds: data.contact_ids,
      updates: {
        ...(has(updates, 'status') && updates.status
          ? { status: updates.status.toUpperCase() }
          : {}),
        ...(has(updates, 'assigned_to')
          ? { assignedToId: updates.assigned_to }
          : {}),
        ...(has(updates, 'tags') ? { tags: updates.tags } : {}),
        ...(has(updates, 'tags_mode') && updates.tags_mode
          ? { tagsMode: updates.tags_mode.toUpperCase() }
          : {}),
      },
    },
  };
  const result = await graphqlMutationRequest<{
    bulkUpdateContacts: { matchedIds: number[] };
  }, typeof variables>(bulkUpdateContactsMutation, variables, data.organization_id);
  return {
    message: `${result.bulkUpdateContacts.matchedIds.length} contacts updated`,
    updated_ids: result.bulkUpdateContacts.matchedIds,
  };
};

export const bulkDeleteContactsViaGraphql = async (
  contactIds: number[],
  organizationId?: number,
): Promise<{ message: string; deleted_ids: number[] }> => {
  const variables = { contactIds };
  const result = await graphqlMutationRequest<{
    bulkDeleteContacts: { matchedIds: number[] };
  }, typeof variables>(bulkDeleteContactsMutation, variables, organizationId);
  return {
    message: `${result.bulkDeleteContacts.matchedIds.length} contacts deleted`,
    deleted_ids: result.bulkDeleteContacts.matchedIds,
  };
};

export const getContactActivitiesViaGraphql = async (
  contactId: number,
  params: { type?: string; limit?: number; offset?: number } = {},
  organizationId?: number,
): Promise<ContactActivity[]> => {
  const pageSize = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const variables = {
    contactId,
    filter: params.type ? { type: params.type.toUpperCase() } : {},
    page: {
      page: Math.floor(offset / pageSize) + 1,
      pageSize,
    },
  };
  const data = await graphqlRequest<{
    contactActivities: {
      nodes: GraphqlContactActivity[];
      pageInfo: GraphqlPageInfo;
    };
  }, typeof variables>(contactActivitiesQuery, variables, organizationId);
  return data.contactActivities.nodes.map(mapContactActivity);
};

export const addContactActivityViaGraphql = async (
  contactId: number,
  input: {
    type: string;
    title?: string;
    content?: JsonRecord;
    metadata?: JsonRecord;
  },
  organizationId?: number,
): Promise<ContactActivity> => {
  const variables = {
    contactId,
    input: {
      type: input.type.toUpperCase(),
      ...(has(input, 'title') ? { title: input.title } : {}),
      ...(has(input, 'content') ? { content: input.content } : {}),
      ...(has(input, 'metadata') ? { metadata: input.metadata } : {}),
    },
  };
  const data = await graphqlMutationRequest<{
    addContactActivity: GraphqlContactActivity;
  }, typeof variables>(addContactActivityMutation, variables, organizationId);
  return mapContactActivity(data.addContactActivity);
};
