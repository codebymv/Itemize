import type { Deal, JsonRecord } from '@/types';
import type { CreateDealData, DealsQueryParams, DealsResponse } from './pipelinesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlDeal = {
  id: number; organizationId: number; pipelineId: number; contactId: number | null;
  stageId: string; title: string; value: string; currency: string; probability: number;
  expectedCloseDate: string | null; assignedToId: number | null;
  assignedToName: string | null; createdById: number | null; wonAt: string | null;
  lostAt: string | null; lostReason: string | null; customFields: JsonRecord;
  tags: string[]; contactFirstName: string | null; contactLastName: string | null;
  contactEmail: string | null; contactCompany: string | null; pipelineName: string | null;
  createdAt: string; updatedAt: string;
};

const fields = `
  id organizationId pipelineId contactId stageId title value currency probability
  expectedCloseDate assignedToId assignedToName createdById wonAt lostAt lostReason
  customFields tags contactFirstName contactLastName contactEmail contactCompany
  pipelineName createdAt updatedAt
`;
const dealsQuery = `query Deals($filter: DealFilterInput, $sort: DealSortInput, $page: PageInput) {
  deals(filter: $filter, sort: $sort, page: $page) {
    nodes { ${fields} } pageInfo { page pageSize total totalPages }
  }
}`;
const dealQuery = `query Deal($id: Int!) { deal(id: $id) { ${fields} } }`;
const createMutation = `mutation CreateDeal($input: CreateDealInput!) {
  createDeal(input: $input) { ${fields} }
}`;
const updateMutation = `mutation UpdateDeal($id: Int!, $input: UpdateDealInput!) {
  updateDeal(id: $id, input: $input) { ${fields} }
}`;
const moveMutation = `mutation MoveDeal($id: Int!, $stageId: String!) {
  moveDeal(id: $id, stageId: $stageId) { ${fields} }
}`;
const wonMutation = `mutation MarkDealWon($id: Int!) {
  markDealWon(id: $id) { ${fields} }
}`;
const lostMutation = `mutation MarkDealLost($id: Int!, $reason: String) {
  markDealLost(id: $id, reason: $reason) { ${fields} }
}`;
const reopenMutation = `mutation ReopenDeal($id: Int!) {
  reopenDeal(id: $id) { ${fields} }
}`;
const deleteMutation = `mutation DeleteDeal($id: Int!) {
  deleteDeal(id: $id) { deletedId }
}`;

const mapDeal = (deal: GraphqlDeal): Deal => ({
  id: deal.id,
  organization_id: deal.organizationId,
  pipeline_id: deal.pipelineId,
  ...(deal.contactId === null ? {} : { contact_id: deal.contactId }),
  stage_id: deal.stageId,
  title: deal.title,
  value: Number(deal.value),
  currency: deal.currency,
  probability: deal.probability,
  ...(deal.expectedCloseDate === null ? {} : { expected_close_date: deal.expectedCloseDate }),
  ...(deal.assignedToId === null ? {} : { assigned_to: deal.assignedToId }),
  ...(deal.assignedToName === null ? {} : { assigned_to_name: deal.assignedToName }),
  ...(deal.createdById === null ? {} : { created_by: deal.createdById }),
  ...(deal.wonAt === null ? {} : { won_at: deal.wonAt }),
  ...(deal.lostAt === null ? {} : { lost_at: deal.lostAt }),
  ...(deal.lostReason === null ? {} : { lost_reason: deal.lostReason }),
  custom_fields: deal.customFields ?? {},
  tags: deal.tags ?? [],
  ...(deal.contactFirstName === null ? {} : { contact_first_name: deal.contactFirstName }),
  ...(deal.contactLastName === null ? {} : { contact_last_name: deal.contactLastName }),
  ...(deal.contactEmail === null ? {} : { contact_email: deal.contactEmail }),
  ...(deal.contactCompany === null ? {} : { contact_company: deal.contactCompany }),
  ...(deal.pipelineName === null ? {} : { pipeline_name: deal.pipelineName }),
  created_at: deal.createdAt,
  updated_at: deal.updatedAt,
});

const has = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const mapInput = (data: Partial<CreateDealData>) => ({
  ...(has(data, 'pipeline_id') && data.pipeline_id !== undefined
    ? { pipelineId: data.pipeline_id } : {}),
  ...(has(data, 'contact_id') ? { contactId: data.contact_id ?? null } : {}),
  ...(has(data, 'stage_id') && data.stage_id !== undefined
    ? { stageId: data.stage_id } : {}),
  ...(has(data, 'title') && data.title !== undefined ? { title: data.title } : {}),
  ...(has(data, 'value') && data.value !== undefined ? { value: String(data.value) } : {}),
  ...(has(data, 'currency') && data.currency !== undefined
    ? { currency: data.currency } : {}),
  ...(has(data, 'probability') && data.probability !== undefined
    ? { probability: data.probability } : {}),
  ...(has(data, 'expected_close_date')
    ? { expectedCloseDate: data.expected_close_date ?? null } : {}),
  ...(has(data, 'assigned_to') ? { assignedToId: data.assigned_to ?? null } : {}),
  ...(has(data, 'custom_fields') ? { customFields: data.custom_fields ?? null } : {}),
  ...(has(data, 'tags') ? { tags: data.tags ?? null } : {}),
});

export const getDealsViaGraphql = async (
  params: DealsQueryParams = {},
): Promise<DealsResponse> => {
  const filter = {
    ...(params.pipeline_id === undefined ? {} : { pipelineId: params.pipeline_id }),
    ...(params.stage_id === undefined ? {} : { stageId: params.stage_id }),
    ...(params.contact_id === undefined ? {} : { contactId: params.contact_id }),
    ...(params.assigned_to === undefined ? {} : { assignedToId: params.assigned_to }),
    ...(params.status === undefined ? {} : { status: params.status.toUpperCase() }),
  };
  const sort = {
    field: (params.sort_by ?? 'created_at').toUpperCase(),
    direction: (params.sort_order ?? 'desc').toUpperCase(),
  };
  const page = { page: params.page ?? 1, pageSize: params.limit ?? 50 };
  const data = await graphqlRequest<{
    deals: {
      nodes: GraphqlDeal[];
      pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
    };
  }, { filter: typeof filter; sort: typeof sort; page: typeof page }>(
    dealsQuery,
    { filter, sort, page },
    params.organization_id,
  );
  return {
    deals: data.deals.nodes.map(mapDeal),
    pagination: {
      page: data.deals.pageInfo.page,
      limit: data.deals.pageInfo.pageSize,
      total: data.deals.pageInfo.total,
      totalPages: data.deals.pageInfo.totalPages,
    },
  };
};

export const getDealViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Deal> => {
  const data = await graphqlRequest<{ deal: GraphqlDeal }, { id: number }>(
    dealQuery, { id }, organizationId,
  );
  return mapDeal(data.deal);
};

export const createDealViaGraphql = async (data: CreateDealData): Promise<Deal> => {
  const response = await graphqlMutationRequest<
    { createDeal: GraphqlDeal }, { input: ReturnType<typeof mapInput> }
  >(createMutation, { input: mapInput(data) }, data.organization_id);
  return mapDeal(response.createDeal);
};

export const updateDealViaGraphql = async (
  id: number,
  data: Partial<CreateDealData>,
): Promise<Deal> => {
  const response = await graphqlMutationRequest<
    { updateDeal: GraphqlDeal }, { id: number; input: ReturnType<typeof mapInput> }
  >(updateMutation, { id, input: mapInput(data) }, data.organization_id);
  return mapDeal(response.updateDeal);
};

const mutateDeal = async (
  operation: string,
  field: string,
  id: number,
  organizationId?: number,
  extra: Record<string, unknown> = {},
): Promise<Deal> => {
  const data = await graphqlMutationRequest<
    Record<string, GraphqlDeal>, { id: number } & Record<string, unknown>
  >(operation, { id, ...extra }, organizationId);
  return mapDeal(data[field]);
};

export const moveDealViaGraphql = (
  id: number, stageId: string, organizationId?: number,
): Promise<Deal> =>
  mutateDeal(moveMutation, 'moveDeal', id, organizationId, { stageId });

export const markDealWonViaGraphql = (
  id: number, organizationId?: number,
): Promise<Deal> => mutateDeal(wonMutation, 'markDealWon', id, organizationId);

export const markDealLostViaGraphql = (
  id: number, reason?: string, organizationId?: number,
): Promise<Deal> =>
  mutateDeal(lostMutation, 'markDealLost', id, organizationId, { reason: reason ?? null });

export const reopenDealViaGraphql = (
  id: number, organizationId?: number,
): Promise<Deal> => mutateDeal(reopenMutation, 'reopenDeal', id, organizationId);

export const deleteDealViaGraphql = async (
  id: number, organizationId?: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { deleteDeal: { deletedId: number } }, { id: number }
  >(deleteMutation, { id }, organizationId);
};
