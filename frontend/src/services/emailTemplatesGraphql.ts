import type { EmailTemplate } from './automationsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

export type GraphqlEmailTemplate = {
  id: number;
  organizationId: number;
  name: string;
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  bodyText: string | null;
  variables: string[];
  category: string;
  isActive: boolean;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  draftVersion: number | null;
  publishedVersion: number | null;
  draftSubject: string | null;
  draftPreheader: string | null;
  draftBodyHtml: string | null;
  draftBodyText: string | null;
  draftUpdatedAt: string | null;
  draftIsActive: boolean | null;
  hasUnpublishedChanges: boolean;
};

export type EmailTemplateInput = {
  organization_id?: number;
  name: string;
  subject: string;
  preheader?: string | null;
  body_html: string;
  body_text?: string | null;
  category?: string;
  is_active?: boolean;
};

export type EmailTemplateStats = {
  total: number;
  active: number;
  inactive: number;
  categories: number;
};

export type EmailTemplateCategory = {
  category: string;
  count: number;
};

export type EmailTemplateListParams = {
  category?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
};

export type EmailTemplateListResponse = {
  templates: EmailTemplate[];
  total: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: EmailTemplateStats;
  categories: EmailTemplateCategory[];
};

type EmailTemplateUpdate = Partial<Omit<EmailTemplateInput, 'organization_id'>>;

export const emailTemplateFields = `
  id organizationId name subject preheader bodyHtml bodyText variables category isActive
  createdById createdByName createdAt updatedAt draftVersion publishedVersion
  draftSubject draftPreheader draftBodyHtml draftBodyText draftUpdatedAt draftIsActive hasUnpublishedChanges
`;

export const mapEmailTemplate = (template: GraphqlEmailTemplate): EmailTemplate => ({
  id: template.id,
  organization_id: template.organizationId,
  name: template.name,
  subject: template.subject,
  preheader: template.preheader,
  body_html: template.bodyHtml,
  body_text: template.bodyText,
  variables: template.variables,
  category: template.category,
  is_active: template.isActive,
  ...(template.createdById === null ? {} : { created_by: template.createdById }),
  ...(template.createdByName === null ? {} : { created_by_name: template.createdByName }),
  created_at: template.createdAt,
  updated_at: template.updatedAt,
  draft_version: template.draftVersion,
  published_version: template.publishedVersion,
  draft_subject: template.draftSubject,
  draft_preheader: template.draftPreheader,
  draft_body_html: template.draftBodyHtml,
  draft_body_text: template.draftBodyText,
  draft_updated_at: template.draftUpdatedAt,
  draft_is_active: template.draftIsActive,
  has_unpublished_changes: template.hasUnpublishedChanges,
});

const mapCreateInput = (input: EmailTemplateInput) => ({
  name: input.name,
  subject: input.subject,
  ...(input.preheader === undefined ? {} : { preheader: input.preheader }),
  bodyHtml: input.body_html,
  ...(input.body_text === undefined ? {} : { bodyText: input.body_text }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.is_active === undefined ? {} : { isActive: input.is_active }),
});

const mapUpdateInput = (input: EmailTemplateUpdate) => ({
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.subject === undefined ? {} : { subject: input.subject }),
  ...(input.preheader === undefined ? {} : { preheader: input.preheader }),
  ...(input.body_html === undefined ? {} : { bodyHtml: input.body_html }),
  ...(input.body_text === undefined ? {} : { bodyText: input.body_text }),
  ...(input.category === undefined ? {} : { category: input.category }),
  ...(input.is_active === undefined ? {} : { isActive: input.is_active }),
});

type EmailTemplatePagePayload = {
  nodes: GraphqlEmailTemplate[];
  pageInfo: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
  stats: EmailTemplateStats;
  categories: EmailTemplateCategory[];
};

type EmailTemplateListCapability = 'unknown' | 'aggregate' | 'legacy';
let emailTemplateListCapability: EmailTemplateListCapability = 'unknown';

const listQuery = `query EmailTemplates($filter: EmailTemplateFilterInput, $page: PageInput) {
  emailTemplates(filter: $filter, page: $page) {
    nodes { ${emailTemplateFields} }
    pageInfo { page pageSize total totalPages hasNextPage }
    stats { total active inactive categories }
    categories { category count }
  }
}`;

const legacyListQuery = `query EmailTemplatesLegacy(
  $filter: EmailTemplateFilterInput,
  $page: PageInput,
  $summaryPage: PageInput
) {
  filtered: emailTemplates(filter: $filter, page: $page) {
    nodes { ${emailTemplateFields} }
    pageInfo { page pageSize total totalPages hasNextPage }
  }
  all: emailTemplates(page: $summaryPage) { pageInfo { total } }
  active: emailTemplates(filter: { isActive: true }, page: $summaryPage) { pageInfo { total } }
  inactive: emailTemplates(filter: { isActive: false }, page: $summaryPage) { pageInfo { total } }
  emailTemplateCategories { category count }
}`;

const missingListMetadata = (error: unknown): boolean => error instanceof Error
  && error.message.includes('Cannot query field')
  && (error.message.includes('stats') || error.message.includes('categories'));

const responseFromPage = (page: EmailTemplatePagePayload): EmailTemplateListResponse => ({
  templates: page.nodes.map(mapEmailTemplate),
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

export const getEmailTemplatesViaGraphql = async (
  params: EmailTemplateListParams = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<EmailTemplateListResponse> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 100;
  const normalizedSearch = params.search?.trim();
  const filter = {
    ...(params.category === undefined ? {} : { category: params.category }),
    ...(params.is_active === undefined ? {} : { isActive: params.is_active }),
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
  };
  const variables = { filter, page: { page, pageSize: limit } };

  if (emailTemplateListCapability !== 'legacy') {
    try {
      const data = await graphqlRequest<
        { emailTemplates: EmailTemplatePagePayload },
        typeof variables
      >(listQuery, variables, organizationId, signal);
      emailTemplateListCapability = 'aggregate';
      return responseFromPage(data.emailTemplates);
    } catch (error) {
      if (emailTemplateListCapability !== 'unknown' || !missingListMetadata(error)) throw error;
      emailTemplateListCapability = 'legacy';
    }
  }

  const data = await graphqlRequest<{
    filtered: Omit<EmailTemplatePagePayload, 'stats' | 'categories'>;
    all: { pageInfo: { total: number } };
    active: { pageInfo: { total: number } };
    inactive: { pageInfo: { total: number } };
    emailTemplateCategories: EmailTemplateCategory[];
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
      categories: data.emailTemplateCategories.length,
    },
    categories: data.emailTemplateCategories,
  });
};

export const resetEmailTemplateListCapability = (): void => {
  emailTemplateListCapability = 'unknown';
};

export const getEmailTemplateViaGraphql = async (
  id: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<EmailTemplate> => {
  const data = await graphqlRequest<{ emailTemplate: GraphqlEmailTemplate }, { id: number }>(
    `query EmailTemplate($id: Int!) { emailTemplate(id: $id) { ${emailTemplateFields} } }`,
    { id },
    organizationId,
    signal,
  );
  return mapEmailTemplate(data.emailTemplate);
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
      createEmailTemplate(input: $input) { ${emailTemplateFields} }
    }`,
    { input: mapCreateInput(input) },
    organizationId,
  );
  return mapEmailTemplate(data.createEmailTemplate);
};

export const createEmailTemplateDraftViaGraphql = async (
  input: EmailTemplateInput,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { createEmailTemplateDraft: GraphqlEmailTemplate },
    { input: ReturnType<typeof mapCreateInput> }
  >(
    `mutation CreateEmailTemplateDraft($input: CreateEmailTemplateInput!) {
      createEmailTemplateDraft(input: $input) { ${emailTemplateFields} }
    }`,
    { input: mapCreateInput(input) },
    organizationId,
  );
  return mapEmailTemplate(data.createEmailTemplateDraft);
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
      updateEmailTemplate(id: $id, input: $input) { ${emailTemplateFields} }
    }`,
    { id, input: mapUpdateInput(input) },
    organizationId,
  );
  return mapEmailTemplate(data.updateEmailTemplate);
};

export const saveEmailTemplateDraftViaGraphql = async (
  id: number,
  input: EmailTemplateInput,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { saveEmailTemplateDraft: GraphqlEmailTemplate },
    { id: number; input: ReturnType<typeof mapCreateInput> }
  >(
    `mutation SaveEmailTemplateDraft($id: Int!, $input: CreateEmailTemplateInput!) {
      saveEmailTemplateDraft(id: $id, input: $input) { ${emailTemplateFields} }
    }`,
    { id, input: mapCreateInput(input) },
    organizationId,
  );
  return mapEmailTemplate(data.saveEmailTemplateDraft);
};

export const publishEmailTemplateViaGraphql = async (
  id: number,
  isActive: boolean,
  idempotencyKey: string,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { publishEmailTemplate: GraphqlEmailTemplate },
    { id: number; input: { isActive: boolean; idempotencyKey: string } }
  >(
    `mutation PublishEmailTemplate($id: Int!, $input: PublishEmailTemplateInput!) {
      publishEmailTemplate(id: $id, input: $input) { ${emailTemplateFields} }
    }`,
    { id, input: { isActive, idempotencyKey } },
    organizationId,
  );
  return mapEmailTemplate(data.publishEmailTemplate);
};

export type EmailTemplatePreview = {
  subject: string;
  html: string;
  text: string | null;
  variables: string[];
};

export const previewEmailTemplateViaGraphql = async (
  input: Pick<EmailTemplateInput, 'subject' | 'preheader' | 'body_html' | 'body_text'>,
  organizationId?: number,
): Promise<EmailTemplatePreview> => {
  const data = await graphqlMutationRequest<
    { previewEmailTemplate: EmailTemplatePreview },
    { input: { subject: string; preheader?: string | null; bodyHtml: string; bodyText?: string | null } }
  >(
    `mutation PreviewEmailTemplate($input: PreviewEmailTemplateInput!) {
      previewEmailTemplate(input: $input) { subject html text variables }
    }`,
    {
      input: {
        subject: input.subject,
        ...(input.preheader === undefined ? {} : { preheader: input.preheader }),
        bodyHtml: input.body_html,
        ...(input.body_text === undefined ? {} : { bodyText: input.body_text }),
      },
    },
    organizationId,
  );
  return data.previewEmailTemplate;
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
      duplicateEmailTemplate(id: $id) { ${emailTemplateFields} }
    }`,
    { id },
    organizationId,
  );
  return mapEmailTemplate(data.duplicateEmailTemplate);
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
