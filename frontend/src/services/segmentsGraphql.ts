import type { Contact, JsonRecord } from '@/types';
import type {
  FilterOptions,
  Segment,
  SegmentFilter,
  SegmentPreview,
} from './segmentsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlHistory = {
  id: number; segmentId: number; organizationId: number; contactCount: number;
  calculatedAt: string; contactsAdded: number; contactsRemoved: number; createdAt: string;
};

type GraphqlSegment = {
  id: number; organizationId: number; name: string; description: string | null;
  color: string; icon: string; filterType: 'and' | 'or'; filters: SegmentFilter[];
  segmentType: 'dynamic' | 'static'; staticContactIds: number[]; contactCount: number;
  lastCalculatedAt: string | null; isActive: boolean; usedInCampaigns: number;
  usedInAutomations: number; createdById: number | null; createdByName: string | null;
  createdAt: string; updatedAt: string; history: GraphqlHistory[];
};

type GraphqlContact = {
  id: number; firstName: string | null; lastName: string | null; email: string | null;
  phone: string | null; status: Contact['status'] | null; source: Contact['source'] | null;
  assignedTo: number | null; customFields: JsonRecord; createdAt: string; updatedAt: string;
};

const fields = `
  id organizationId name description color icon filterType filters segmentType staticContactIds
  contactCount lastCalculatedAt isActive usedInCampaigns usedInAutomations createdById createdByName
  createdAt updatedAt
`;

const mapFilterInput = (filter: SegmentFilter) => ({
  field: filter.field,
  operator: filter.operator,
  value: filter.value,
  ...(filter.custom_field_key === undefined ? {} : { customFieldKey: filter.custom_field_key }),
});

const mapInput = (segment: Partial<Segment>) => ({
  ...(segment.name === undefined ? {} : { name: segment.name }),
  ...(segment.description === undefined ? {} : { description: segment.description }),
  ...(segment.color === undefined ? {} : { color: segment.color }),
  ...(segment.icon === undefined ? {} : { icon: segment.icon }),
  ...(segment.filter_type === undefined ? {} : { filterType: segment.filter_type }),
  ...(segment.filters === undefined ? {} : { filters: segment.filters.map(mapFilterInput) }),
  ...(segment.segment_type === undefined ? {} : { segmentType: segment.segment_type }),
  ...(segment.static_contact_ids === undefined ? {} : { staticContactIds: segment.static_contact_ids }),
  ...(segment.is_active === undefined ? {} : { isActive: segment.is_active }),
});

const mapSegment = (segment: GraphqlSegment): Segment => ({
  id: segment.id,
  organization_id: segment.organizationId,
  name: segment.name,
  description: segment.description ?? undefined,
  color: segment.color,
  icon: segment.icon,
  filter_type: segment.filterType,
  filters: segment.filters,
  segment_type: segment.segmentType,
  static_contact_ids: segment.staticContactIds,
  contact_count: segment.contactCount,
  last_calculated_at: segment.lastCalculatedAt ?? undefined,
  is_active: segment.isActive,
  used_in_campaigns: segment.usedInCampaigns,
  used_in_automations: segment.usedInAutomations,
  created_by: segment.createdById ?? undefined,
  created_by_name: segment.createdByName ?? undefined,
  created_at: segment.createdAt,
  updated_at: segment.updatedAt,
  history: (segment.history ?? []).map((history) => ({
    id: history.id, segment_id: history.segmentId, organization_id: history.organizationId,
    contact_count: history.contactCount, calculated_at: history.calculatedAt,
    contacts_added: history.contactsAdded, contacts_removed: history.contactsRemoved,
    created_at: history.createdAt,
  })),
});

export const getSegmentsViaGraphql = async (
  params: { is_active?: boolean; search?: string } = {},
  organizationId?: number,
): Promise<Segment[]> => {
  type SegmentPageData = { segments: {
    nodes: GraphqlSegment[];
    pageInfo: { page: number; totalPages: number };
  } };
  const variables = {
    filter: {
      ...(params.is_active === undefined ? {} : { isActive: params.is_active }),
      ...(params.search === undefined ? {} : { search: params.search }),
    },
    page: { page: 1, pageSize: 100 },
  };
  const query = `query Segments($filter: SegmentListFilterInput, $page: PageInput) {
    segments(filter: $filter, page: $page) {
      nodes { ${fields} }
      pageInfo { page totalPages }
    }
  }`;
  const first = await graphqlRequest<
    SegmentPageData,
    { filter: { isActive?: boolean; search?: string }; page: { page: number; pageSize: number } }
  >(query, variables, organizationId);
  const pages = await Promise.all(
    Array.from(
      { length: Math.max(0, first.segments.pageInfo.totalPages - 1) },
      (_, index) => graphqlRequest<SegmentPageData, typeof variables>(
        query,
        { ...variables, page: { ...variables.page, page: index + 2 } },
        organizationId,
      ),
    ),
  );
  return [first, ...pages].flatMap((page) => page.segments.nodes.map(mapSegment));
};

export const getSegmentViaGraphql = async (id: number, organizationId?: number): Promise<Segment> => {
  const data = await graphqlRequest<{ segment: GraphqlSegment }, { id: number }>(
    `query Segment($id: Int!) { segment(id: $id) {
      ${fields}
      history { id segmentId organizationId contactCount calculatedAt contactsAdded contactsRemoved createdAt }
    } }`,
    { id }, organizationId,
  );
  return mapSegment(data.segment);
};

export const createSegmentViaGraphql = async (
  segment: Partial<Segment>, organizationId?: number,
): Promise<Segment> => {
  const data = await graphqlMutationRequest<
    { createSegment: GraphqlSegment }, { input: ReturnType<typeof mapInput> }
  >(`mutation CreateSegment($input: CreateSegmentInput!) {
      createSegment(input: $input) { ${fields} }
    }`, { input: mapInput(segment) }, organizationId);
  return mapSegment(data.createSegment);
};

export const updateSegmentViaGraphql = async (
  id: number, segment: Partial<Segment>, organizationId?: number,
): Promise<Segment> => {
  const data = await graphqlMutationRequest<
    { updateSegment: GraphqlSegment }, { id: number; input: ReturnType<typeof mapInput> }
  >(`mutation UpdateSegment($id: Int!, $input: UpdateSegmentInput!) {
      updateSegment(id: $id, input: $input) { ${fields} }
    }`, { id, input: mapInput(segment) }, organizationId);
  return mapSegment(data.updateSegment);
};

export const deleteSegmentViaGraphql = async (
  id: number, organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteSegment: { deletedId: number } }, { id: number }
  >('mutation DeleteSegment($id: Int!) { deleteSegment(id: $id) { deletedId } }', { id }, organizationId);
  if (data.deleteSegment.deletedId !== id) throw new Error('GraphQL deleted a different segment');
  return { success: true };
};

export const recalculateSegmentViaGraphql = async (
  id: number, organizationId?: number,
): Promise<Segment> => {
  const data = await graphqlMutationRequest<
    { recalculateSegment: GraphqlSegment }, { id: number }
  >(`mutation RecalculateSegment($id: Int!) {
      recalculateSegment(id: $id) { ${fields} }
    }`, { id }, organizationId);
  return mapSegment(data.recalculateSegment);
};

export const previewSegmentViaGraphql = async (
  filters: SegmentFilter[], filterType: 'and' | 'or', organizationId?: number,
): Promise<SegmentPreview> => {
  const data = await graphqlRequest<
    { previewSegment: { count: number; sample: Array<{ id: number; firstName: string | null; lastName: string | null; email: string | null; status: string | null }> } },
    { input: { filterType: string; filters: ReturnType<typeof mapFilterInput>[] } }
  >(`query PreviewSegment($input: PreviewSegmentInput!) {
      previewSegment(input: $input) { count sample { id firstName lastName email status } }
    }`, { input: { filterType, filters: filters.map(mapFilterInput) } }, organizationId);
  return {
    count: data.previewSegment.count,
    sample: data.previewSegment.sample.map((contact) => ({
      id: contact.id, first_name: contact.firstName ?? undefined,
      last_name: contact.lastName ?? undefined, email: contact.email ?? undefined,
      status: contact.status ?? undefined,
    })),
  };
};

export const getSegmentContactsViaGraphql = async (
  id: number, params: { page?: number; limit?: number } = {}, organizationId?: number,
): Promise<{ contacts: Contact[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
  const data = await graphqlRequest<
    { segmentContacts: { nodes: GraphqlContact[]; pageInfo: { page: number; pageSize: number; total: number; totalPages: number } } },
    { id: number; page: { page: number; pageSize: number } }
  >(`query SegmentContacts($id: Int!, $page: PageInput) {
      segmentContacts(id: $id, page: $page) {
        nodes { id firstName lastName email phone status source assignedTo customFields createdAt updatedAt }
        pageInfo { page pageSize total totalPages }
      }
    }`, { id, page: { page: params.page ?? 1, pageSize: params.limit ?? 50 } }, organizationId);
  const info = data.segmentContacts.pageInfo;
  return {
    contacts: data.segmentContacts.nodes.map((contact) => ({
      id: contact.id, organization_id: organizationId ?? 0,
      first_name: contact.firstName ?? undefined, last_name: contact.lastName ?? undefined,
      email: contact.email ?? undefined, phone: contact.phone ?? undefined,
      address: {}, source: contact.source ?? 'manual', status: contact.status ?? 'active',
      custom_fields: contact.customFields, tags: [], assigned_to: contact.assignedTo ?? undefined,
      created_at: contact.createdAt, updated_at: contact.updatedAt,
    })),
    pagination: { page: info.page, limit: info.pageSize, total: info.total, totalPages: info.totalPages },
  };
};

export const getSegmentFilterOptionsViaGraphql = async (organizationId?: number): Promise<FilterOptions> => {
  const data = await graphqlRequest<{ segmentFilterOptions: {
    fields: Array<{ id: string; label: string; type: FilterOptions['fields'][number]['type']; operators: string[]; options: string[] | null }>;
    tags: FilterOptions['tags']; users: FilterOptions['users']; pipelines: FilterOptions['pipelines'];
  } }, Record<string, never>>(`query SegmentFilterOptions {
    segmentFilterOptions {
      fields { id label type operators options }
      tags { id name color }
      users { id name }
      pipelines { id name stages { id name color } }
    }
  }`, {}, organizationId);
  return {
    ...data.segmentFilterOptions,
    fields: data.segmentFilterOptions.fields.map(({ options, ...field }) => ({
      ...field, ...(options === null ? {} : { options }),
    })),
  };
};
