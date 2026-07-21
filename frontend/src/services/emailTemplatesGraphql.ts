import type { EmailTemplate } from './automationsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlEmailTemplate = {
  id: number;
  organizationId: number;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  variables: string[];
  category: string;
  isActive: boolean;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

type EmailTemplateInput = {
  organization_id?: number;
  name: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  category?: string;
  is_active?: boolean;
};

type EmailTemplateUpdate = Partial<Omit<EmailTemplateInput, 'organization_id'>>;

const fields = `
  id organizationId name subject bodyHtml bodyText variables category isActive
  createdById createdByName createdAt updatedAt
`;

const mapTemplate = (template: GraphqlEmailTemplate): EmailTemplate => ({
  id: template.id,
  organization_id: template.organizationId,
  name: template.name,
  subject: template.subject,
  body_html: template.bodyHtml,
  body_text: template.bodyText,
  variables: template.variables,
  category: template.category,
  is_active: template.isActive,
  ...(template.createdById === null ? {} : { created_by: template.createdById }),
  ...(template.createdByName === null ? {} : { created_by_name: template.createdByName }),
  created_at: template.createdAt,
  updated_at: template.updatedAt,
});

const mapCreateInput = (input: EmailTemplateInput) => ({
  name: input.name,
  subject: input.subject,
  bodyHtml: input.body_html,
  ...(input.body_text === undefined ? {} : { bodyText: input.body_text }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.is_active === undefined ? {} : { isActive: input.is_active }),
});

const mapUpdateInput = (input: EmailTemplateUpdate) => ({
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.subject === undefined ? {} : { subject: input.subject }),
  ...(input.body_html === undefined ? {} : { bodyHtml: input.body_html }),
  ...(input.body_text === undefined ? {} : { bodyText: input.body_text }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.is_active === undefined ? {} : { isActive: input.is_active }),
});

export const getEmailTemplatesViaGraphql = async (
  filters: { category?: string; is_active?: boolean; search?: string } = {},
  organizationId?: number,
): Promise<{ templates: EmailTemplate[]; total: number }> => {
  const templates: EmailTemplate[] = [];
  let page = 1;
  let total = 0;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await graphqlRequest<
      { emailTemplates: { nodes: GraphqlEmailTemplate[]; pageInfo: { total: number; hasNextPage: boolean } } },
      { filter: { category?: string; isActive?: boolean; search?: string }; page: { page: number; pageSize: number } }
    >(
      `query EmailTemplates($filter: EmailTemplateFilterInput, $page: PageInput) {
        emailTemplates(filter: $filter, page: $page) {
          nodes { ${fields} }
          pageInfo { total hasNextPage }
        }
      }`,
      {
        filter: {
          ...(filters.category === undefined ? {} : { category: filters.category }),
          ...(filters.is_active === undefined ? {} : { isActive: filters.is_active }),
          ...(filters.search === undefined ? {} : { search: filters.search }),
        },
        page: { page, pageSize: 100 },
      },
      organizationId,
    );
    templates.push(...data.emailTemplates.nodes.map(mapTemplate));
    total = data.emailTemplates.pageInfo.total;
    hasNextPage = data.emailTemplates.pageInfo.hasNextPage;
    page += 1;
  }
  return { templates, total };
};

export const getEmailTemplateViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlRequest<{ emailTemplate: GraphqlEmailTemplate }, { id: number }>(
    `query EmailTemplate($id: Int!) { emailTemplate(id: $id) { ${fields} } }`,
    { id },
    organizationId,
  );
  return mapTemplate(data.emailTemplate);
};

export const getEmailTemplateCategoriesViaGraphql = async (
  organizationId?: number,
): Promise<{ categories: Array<{ category: string; count: number }> }> => {
  const data = await graphqlRequest<
    { emailTemplateCategories: Array<{ category: string; count: number }> },
    Record<string, never>
  >(
    'query EmailTemplateCategories { emailTemplateCategories { category count } }',
    {},
    organizationId,
  );
  return { categories: data.emailTemplateCategories };
};

export const createEmailTemplateViaGraphql = async (
  input: EmailTemplateInput,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { createEmailTemplate: GraphqlEmailTemplate },
    { input: ReturnType<typeof mapCreateInput> }
  >(
    `mutation CreateEmailTemplate($input: CreateEmailTemplateInput!) {
      createEmailTemplate(input: $input) { ${fields} }
    }`,
    { input: mapCreateInput(input) },
    organizationId,
  );
  return mapTemplate(data.createEmailTemplate);
};

export const updateEmailTemplateViaGraphql = async (
  id: number,
  input: EmailTemplateUpdate,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { updateEmailTemplate: GraphqlEmailTemplate },
    { id: number; input: ReturnType<typeof mapUpdateInput> }
  >(
    `mutation UpdateEmailTemplate($id: Int!, $input: UpdateEmailTemplateInput!) {
      updateEmailTemplate(id: $id, input: $input) { ${fields} }
    }`,
    { id, input: mapUpdateInput(input) },
    organizationId,
  );
  return mapTemplate(data.updateEmailTemplate);
};

export const duplicateEmailTemplateViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { duplicateEmailTemplate: GraphqlEmailTemplate },
    { id: number }
  >(
    `mutation DuplicateEmailTemplate($id: Int!) {
      duplicateEmailTemplate(id: $id) { ${fields} }
    }`,
    { id },
    organizationId,
  );
  return mapTemplate(data.duplicateEmailTemplate);
};

export const deleteEmailTemplateViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  const data = await graphqlMutationRequest<
    { deleteEmailTemplate: { deletedId: number; success: boolean } },
    { id: number }
  >(
    `mutation DeleteEmailTemplate($id: Int!) {
      deleteEmailTemplate(id: $id) { deletedId success }
    }`,
    { id },
    organizationId,
  );
  if (!data.deleteEmailTemplate.success || data.deleteEmailTemplate.deletedId !== id) {
    throw new Error('GraphQL email-template delete returned an invalid result');
  }
};
