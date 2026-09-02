import type { CreateSmsTemplateData, MessageInfo, SmsTemplate, UpdateSmsTemplateData } from './smsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlSmsTemplate = {
  id: number; organizationId: number; name: string; message: string; variables: string[];
  category: string; isActive: boolean; createdById: number | null; createdByName: string | null;
  createdAt: string; updatedAt: string;
};
const fields = 'id organizationId name message variables category isActive createdById createdByName createdAt updatedAt';
const map = (value: GraphqlSmsTemplate): SmsTemplate => ({
  id: value.id, organization_id: value.organizationId, name: value.name, message: value.message,
  variables: value.variables, category: value.category, is_active: value.isActive,
  created_by: value.createdById, ...(value.createdByName === null ? {} : { created_by_name: value.createdByName }),
  created_at: value.createdAt, updated_at: value.updatedAt,
});

export type SmsTemplateStats = {
  total: number;
  active: number;
  inactive: number;
  categories: number;
};

export type SmsTemplateCategory = { category: string; count: number };

export type SmsTemplateListParams = {
  category?: string;
  is_active?: boolean | string;
  search?: string;
  page?: number;
  limit?: number;
};

export type SmsTemplateListResponse = {
  templates: SmsTemplate[];
  total: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: SmsTemplateStats;
  categories: SmsTemplateCategory[];
};

type SmsTemplatePagePayload = {
  nodes: GraphqlSmsTemplate[];
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
  stats: SmsTemplateStats;
  categories: SmsTemplateCategory[];
};

type SmsTemplateListCapability = 'unknown' | 'aggregate' | 'legacy';
let smsTemplateListCapability: SmsTemplateListCapability = 'unknown';

const listQuery = `query SmsTemplates($filter: SmsTemplateFilterInput, $page: PageInput) {
  smsTemplates(filter: $filter, page: $page) {
    nodes { ${fields} }
    pageInfo { page pageSize total totalPages hasNextPage }
    stats { total active inactive categories }
    categories { category count }
  }
}`;

const legacyListQuery = `query SmsTemplatesLegacy(
  $filter: SmsTemplateFilterInput,
  $page: PageInput,
  $summaryPage: PageInput
) {
  filtered: smsTemplates(filter: $filter, page: $page) {
    nodes { ${fields} }
    pageInfo { page pageSize total totalPages hasNextPage }
  }
  all: smsTemplates(page: $summaryPage) { pageInfo { total } }
  active: smsTemplates(filter: { isActive: true }, page: $summaryPage) { pageInfo { total } }
  inactive: smsTemplates(filter: { isActive: false }, page: $summaryPage) { pageInfo { total } }
  smsTemplateCategories { category count }
}`;

const missingListMetadata = (error: unknown): boolean => error instanceof Error
  && error.message.includes('Cannot query field')
  && (error.message.includes('stats') || error.message.includes('categories'));

const responseFromPage = (page: SmsTemplatePagePayload): SmsTemplateListResponse => ({
  templates: page.nodes.map(map),
  total: page.pageInfo.total,
  pagination: {
    page: page.pageInfo.page,
    limit: page.pageInfo.pageSize,
    total: page.pageInfo.total,
    totalPages: page.pageInfo.totalPages,
  },
  stats: page.stats,
  categories: page.categories,
});

export const getSmsTemplatesViaGraphql = async (
  params: SmsTemplateListParams = {}, organizationId?: number,
  signal?: AbortSignal,
): Promise<SmsTemplateListResponse> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 100;
  const normalizedSearch = params.search?.trim();
  const filter = {
    ...(params.category === undefined ? {} : { category: params.category }),
    ...(params.is_active === undefined ? {} : {
      isActive: typeof params.is_active === 'string'
        ? params.is_active === 'true'
        : params.is_active,
    }),
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
  };
  const variables = { filter, page: { page, pageSize: limit } };

  if (smsTemplateListCapability !== 'legacy') {
    try {
      const data = await graphqlRequest<
        { smsTemplates: SmsTemplatePagePayload },
        typeof variables
      >(listQuery, variables, organizationId, signal);
      smsTemplateListCapability = 'aggregate';
      return responseFromPage(data.smsTemplates);
    } catch (error) {
      if (smsTemplateListCapability !== 'unknown' || !missingListMetadata(error)) throw error;
      smsTemplateListCapability = 'legacy';
    }
  }

  const data = await graphqlRequest<{
    filtered: Omit<SmsTemplatePagePayload, 'stats' | 'categories'>;
    all: { pageInfo: { total: number } };
    active: { pageInfo: { total: number } };
    inactive: { pageInfo: { total: number } };
    smsTemplateCategories: SmsTemplateCategory[];
  }, typeof variables & { summaryPage: { page: number; pageSize: number } }>(
    legacyListQuery,
    { ...variables, summaryPage: { page: 1, pageSize: 1 } },
    organizationId,
    signal,
  );
  return responseFromPage({
    ...data.filtered,
    stats: {
      total: data.all.pageInfo.total,
      active: data.active.pageInfo.total,
      inactive: data.inactive.pageInfo.total,
      categories: data.smsTemplateCategories.length,
    },
    categories: data.smsTemplateCategories,
  });
};

export const resetSmsTemplateListCapability = (): void => {
  smsTemplateListCapability = 'unknown';
};

export const getSmsTemplateViaGraphql = async (id: number, organizationId?: number) => {
  const data = await graphqlRequest<{ smsTemplate: GraphqlSmsTemplate }, { id: number }>(
    `query SmsTemplate($id: Int!) { smsTemplate(id: $id) { ${fields} } }`, { id }, organizationId);
  return map(data.smsTemplate);
};
const createInput = (value: CreateSmsTemplateData) => ({ name: value.name, message: value.message,
  ...(value.category === undefined ? {} : { category: value.category }),
  ...(value.is_active === undefined ? {} : { isActive: value.is_active }) });
const updateInput = (value: UpdateSmsTemplateData) => ({
  ...(value.name === undefined ? {} : { name: value.name }), ...(value.message === undefined ? {} : { message: value.message }),
  ...(value.category === undefined ? {} : { category: value.category }), ...(value.is_active === undefined ? {} : { isActive: value.is_active }),
});
export const createSmsTemplateViaGraphql = async (value: CreateSmsTemplateData, idempotencyKey: string) => {
  const data = await graphqlMutationRequest<{ createSmsTemplate: GraphqlSmsTemplate }, { input: ReturnType<typeof createInput>; idempotencyKey: string }>(
    `mutation CreateSmsTemplate($input: CreateSmsTemplateInput!, $idempotencyKey: String!) { createSmsTemplate(input: $input, idempotencyKey: $idempotencyKey) { ${fields} } }`,
    { input: createInput(value), idempotencyKey }, value.organization_id); return map(data.createSmsTemplate);
};
export const updateSmsTemplateViaGraphql = async (id: number, value: UpdateSmsTemplateData) => {
  const data = await graphqlMutationRequest<{ updateSmsTemplate: GraphqlSmsTemplate }, { id: number; input: ReturnType<typeof updateInput> }>(
    `mutation UpdateSmsTemplate($id: Int!, $input: UpdateSmsTemplateInput!) { updateSmsTemplate(id: $id, input: $input) { ${fields} } }`,
    { id, input: updateInput(value) }, value.organization_id); return map(data.updateSmsTemplate);
};
export const duplicateSmsTemplateViaGraphql = async (id: number, idempotencyKey: string, organizationId?: number) => {
  const data = await graphqlMutationRequest<{ duplicateSmsTemplate: GraphqlSmsTemplate }, { id: number; idempotencyKey: string }>(
    `mutation DuplicateSmsTemplate($id: Int!, $idempotencyKey: String!) { duplicateSmsTemplate(id: $id, idempotencyKey: $idempotencyKey) { ${fields} } }`, { id, idempotencyKey }, organizationId);
  return map(data.duplicateSmsTemplate);
};
export const deleteSmsTemplateViaGraphql = async (id: number, organizationId?: number) => {
  const data = await graphqlMutationRequest<{ deleteSmsTemplate: { deletedId: number; success: boolean } }, { id: number }>(
    'mutation DeleteSmsTemplate($id: Int!) { deleteSmsTemplate(id: $id) { deletedId success } }', { id }, organizationId);
  if (!data.deleteSmsTemplate.success || data.deleteSmsTemplate.deletedId !== id) throw new Error('GraphQL SMS-template delete returned an invalid result');
  return { success: true, deleted_id: id };
};
export const getSmsTemplateCategoriesViaGraphql = async (organizationId?: number) => {
  const data = await graphqlRequest<{ smsTemplateCategories: Array<{ category: string; count: number }> }, Record<string, never>>(
    'query SmsTemplateCategories { smsTemplateCategories { category count } }', {}, organizationId);
  return { categories: data.smsTemplateCategories };
};
export const getSmsMessageInfoViaGraphql = async (message: string): Promise<MessageInfo> => {
  const data = await graphqlRequest<{ smsMessageInfo: MessageInfo }, { message: string }>(
    'query SmsMessageInfo($message: String!) { smsMessageInfo(message: $message) { length segments encoding charsRemaining } }', { message });
  return data.smsMessageInfo;
};
