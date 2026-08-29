import type { EmailTemplate } from './automationsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlEmailTemplate = {
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

type EmailTemplateUpdate = Partial<Omit<EmailTemplateInput, 'organization_id'>>;

const fields = `
  id organizationId name subject preheader bodyHtml bodyText variables category isActive
  createdById createdByName createdAt updatedAt draftVersion publishedVersion
  draftSubject draftPreheader draftBodyHtml draftBodyText draftUpdatedAt draftIsActive hasUnpublishedChanges
`;

const mapTemplate = (template: GraphqlEmailTemplate): EmailTemplate => ({
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

export const createEmailTemplateDraftViaGraphql = async (
  input: EmailTemplateInput,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { createEmailTemplateDraft: GraphqlEmailTemplate },
    { input: ReturnType<typeof mapCreateInput> }
  >(
    `mutation CreateEmailTemplateDraft($input: CreateEmailTemplateInput!) {
      createEmailTemplateDraft(input: $input) { ${fields} }
    }`,
    { input: mapCreateInput(input) },
    organizationId,
  );
  return mapTemplate(data.createEmailTemplateDraft);
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

export const saveEmailTemplateDraftViaGraphql = async (
  id: number,
  input: EmailTemplateInput,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { saveEmailTemplateDraft: GraphqlEmailTemplate },
    { id: number; input: ReturnType<typeof mapUpdateInput> }
  >(
    `mutation SaveEmailTemplateDraft($id: Int!, $input: UpdateEmailTemplateInput!) {
      saveEmailTemplateDraft(id: $id, input: $input) { ${fields} }
    }`,
    { id, input: mapUpdateInput(input) },
    organizationId,
  );
  return mapTemplate(data.saveEmailTemplateDraft);
};

export const publishEmailTemplateViaGraphql = async (
  id: number,
  isActive = true,
  organizationId?: number,
): Promise<EmailTemplate> => {
  const data = await graphqlMutationRequest<
    { publishEmailTemplate: GraphqlEmailTemplate },
    { id: number; input: { isActive: boolean } }
  >(
    `mutation PublishEmailTemplate($id: Int!, $input: PublishEmailTemplateInput!) {
      publishEmailTemplate(id: $id, input: $input) { ${fields} }
    }`,
    { id, input: { isActive } },
    organizationId,
  );
  return mapTemplate(data.publishEmailTemplate);
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
