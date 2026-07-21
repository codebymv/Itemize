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

export const getSmsTemplatesViaGraphql = async (
  filters: { category?: string; is_active?: string; search?: string } = {}, organizationId?: number,
): Promise<{ templates: SmsTemplate[]; total: number }> => {
  const templates: SmsTemplate[] = []; let page = 1; let total = 0; let hasNextPage = true;
  while (hasNextPage) {
    const data = await graphqlRequest<
      { smsTemplates: { nodes: GraphqlSmsTemplate[]; pageInfo: { total: number; hasNextPage: boolean } } },
      { filter: { category?: string; isActive?: boolean; search?: string }; page: { page: number; pageSize: number } }
    >(`query SmsTemplates($filter: SmsTemplateFilterInput, $page: PageInput) {
      smsTemplates(filter: $filter, page: $page) { nodes { ${fields} } pageInfo { total hasNextPage } }
    }`, { filter: {
      ...(filters.category === undefined ? {} : { category: filters.category }),
      ...(filters.is_active === undefined ? {} : { isActive: filters.is_active === 'true' }),
      ...(filters.search === undefined ? {} : { search: filters.search }),
    }, page: { page, pageSize: 100 } }, organizationId);
    templates.push(...data.smsTemplates.nodes.map(map)); total = data.smsTemplates.pageInfo.total;
    hasNextPage = data.smsTemplates.pageInfo.hasNextPage; page += 1;
  }
  return { templates, total };
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
export const createSmsTemplateViaGraphql = async (value: CreateSmsTemplateData) => {
  const data = await graphqlMutationRequest<{ createSmsTemplate: GraphqlSmsTemplate }, { input: ReturnType<typeof createInput> }>(
    `mutation CreateSmsTemplate($input: CreateSmsTemplateInput!) { createSmsTemplate(input: $input) { ${fields} } }`,
    { input: createInput(value) }, value.organization_id); return map(data.createSmsTemplate);
};
export const updateSmsTemplateViaGraphql = async (id: number, value: UpdateSmsTemplateData) => {
  const data = await graphqlMutationRequest<{ updateSmsTemplate: GraphqlSmsTemplate }, { id: number; input: ReturnType<typeof updateInput> }>(
    `mutation UpdateSmsTemplate($id: Int!, $input: UpdateSmsTemplateInput!) { updateSmsTemplate(id: $id, input: $input) { ${fields} } }`,
    { id, input: updateInput(value) }, value.organization_id); return map(data.updateSmsTemplate);
};
export const duplicateSmsTemplateViaGraphql = async (id: number, organizationId?: number) => {
  const data = await graphqlMutationRequest<{ duplicateSmsTemplate: GraphqlSmsTemplate }, { id: number }>(
    `mutation DuplicateSmsTemplate($id: Int!) { duplicateSmsTemplate(id: $id) { ${fields} } }`, { id }, organizationId);
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
