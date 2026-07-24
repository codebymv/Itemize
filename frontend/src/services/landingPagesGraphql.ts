import type {
  Page,
  PageAnalytics,
  PageSection,
  PageSectionSettings,
  PageTheme,
  SectionType,
} from './pagesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GqlSection = {
  id: number;
  pageId: number;
  organizationId: number;
  sectionType: SectionType;
  name: string | null;
  content: Record<string, unknown>;
  settings: Partial<PageSectionSettings>;
  sectionOrder: number;
  createdAt: string;
  updatedAt: string;
};

type GqlPage = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  slug: string;
  status: Page['status'];
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogImage: string | null;
  faviconUrl: string | null;
  theme: PageTheme;
  customCss: string | null;
  customJs: string | null;
  customHead: string | null;
  settings: Page['settings'];
  currentVersionId: number | null;
  viewCount: number;
  uniqueVisitors: number;
  publishedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
  sections: GqlSection[];
};

type SectionInput = {
  sectionType: string;
  name?: string | null;
  content?: Record<string, unknown>;
  settings?: Partial<PageSectionSettings>;
};

const sectionFields = `
  id pageId organizationId sectionType name content settings sectionOrder
  createdAt updatedAt
`;

const pageFields = `
  id organizationId name description slug status seoTitle seoDescription
  seoKeywords ogImage faviconUrl theme customCss customJs customHead settings
  currentVersionId viewCount uniqueVisitors publishedAt createdBy createdByName
  createdAt updatedAt sectionCount sections { ${sectionFields} }
`;

const mapSection = (section: GqlSection): PageSection => ({
  id: section.id,
  page_id: section.pageId,
  organization_id: section.organizationId,
  section_type: section.sectionType,
  ...(section.name === null ? {} : { name: section.name }),
  content: section.content ?? {},
  settings: section.settings ?? {},
  section_order: section.sectionOrder,
  created_at: section.createdAt,
  updated_at: section.updatedAt,
});

const mapPage = (page: GqlPage): Page => ({
  id: page.id,
  organization_id: page.organizationId,
  name: page.name,
  ...(page.description === null ? {} : { description: page.description }),
  slug: page.slug,
  status: page.status,
  ...(page.seoTitle === null ? {} : { seo_title: page.seoTitle }),
  ...(page.seoDescription === null
    ? {}
    : { seo_description: page.seoDescription }),
  ...(page.seoKeywords === null ? {} : { seo_keywords: page.seoKeywords }),
  ...(page.ogImage === null ? {} : { og_image: page.ogImage }),
  ...(page.faviconUrl === null ? {} : { favicon_url: page.faviconUrl }),
  theme: page.theme,
  ...(page.customCss === null ? {} : { custom_css: page.customCss }),
  ...(page.customJs === null ? {} : { custom_js: page.customJs }),
  ...(page.customHead === null ? {} : { custom_head: page.customHead }),
  settings: page.settings,
  view_count: page.viewCount,
  unique_visitors: page.uniqueVisitors,
  ...(page.publishedAt === null ? {} : { published_at: page.publishedAt }),
  ...(page.createdBy === null ? {} : { created_by: page.createdBy }),
  ...(page.createdByName === null
    ? {}
    : { created_by_name: page.createdByName }),
  created_at: page.createdAt,
  updated_at: page.updatedAt,
  section_count: page.sectionCount,
  sections: (page.sections ?? []).map(mapSection),
});

const mapSectionInput = (section: Partial<PageSection>): SectionInput => ({
  sectionType: String(section.section_type),
  ...(section.name === undefined ? {} : { name: section.name }),
  content: section.content ?? {},
  settings: section.settings ?? {},
});

const mapPageInput = (
  page: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    name: 'name',
    description: 'description',
    slug: 'slug',
    status: 'status',
    theme: 'theme',
    settings: 'settings',
    seo_title: 'seoTitle',
    seo_description: 'seoDescription',
    seo_keywords: 'seoKeywords',
    og_image: 'ogImage',
    favicon_url: 'faviconUrl',
    custom_css: 'customCss',
    custom_js: 'customJs',
    custom_head: 'customHead',
  };
  for (const [source, target] of Object.entries(mapping)) {
    if (page[source] !== undefined) result[target] = page[source];
  }
  if (Array.isArray(page.sections)) {
    result.sections = (page.sections as Partial<PageSection>[]).map(mapSectionInput);
  }
  return result;
};

export const getLandingPagesViaGraphql = async (
  params: { status?: Page['status'] | 'all'; search?: string; page?: number; limit?: number },
  organizationId?: number,
) => {
  const variables = {
    filter: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search ? { search: params.search } : {}),
    },
    page: { page: params.page ?? 1, pageSize: params.limit ?? 20 },
  };
  const data = await graphqlRequest<
    {
      landingPages: {
        nodes: GqlPage[];
        pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
      };
    },
    typeof variables
  >(
    `query LandingPages($filter: LandingPageFilterInput, $page: PageInput) {
      landingPages(filter: $filter, page: $page) {
        nodes { ${pageFields} }
        pageInfo { page pageSize total totalPages }
      }
    }`,
    variables,
    organizationId,
  );
  return {
    pages: data.landingPages.nodes.map(mapPage),
    pagination: {
      page: data.landingPages.pageInfo.page,
      limit: data.landingPages.pageInfo.pageSize,
      total: data.landingPages.pageInfo.total,
      totalPages: data.landingPages.pageInfo.totalPages,
    },
  };
};

export const getLandingPageViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Page> => {
  const data = await graphqlRequest<{ landingPage: GqlPage }, { id: number }>(
    `query LandingPage($id: Int!) { landingPage(id: $id) { ${pageFields} } }`,
    { id },
    organizationId,
  );
  return mapPage(data.landingPage);
};

export const createLandingPageViaGraphql = async (
  page: Record<string, unknown>,
  organizationId?: number,
): Promise<Page> => {
  const variables = { input: mapPageInput(page) };
  const data = await graphqlMutationRequest<
    { createLandingPage: GqlPage },
    typeof variables
  >(
    `mutation CreateLandingPage($input: CreateLandingPageInput!) {
      createLandingPage(input: $input) { ${pageFields} }
    }`,
    variables,
    organizationId,
  );
  return mapPage(data.createLandingPage);
};

export const updateLandingPageViaGraphql = async (
  id: number,
  page: Record<string, unknown>,
  organizationId?: number,
): Promise<Page> => {
  const variables = { id, input: mapPageInput(page) };
  const data = await graphqlMutationRequest<
    { updateLandingPage: GqlPage },
    typeof variables
  >(
    `mutation UpdateLandingPage($id: Int!, $input: UpdateLandingPageInput!) {
      updateLandingPage(id: $id, input: $input) { ${pageFields} }
    }`,
    variables,
    organizationId,
  );
  return mapPage(data.updateLandingPage);
};

export const deleteLandingPageViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteLandingPage: { deletedId: number } },
    { id: number }
  >(
    `mutation DeleteLandingPage($id: Int!) {
      deleteLandingPage(id: $id) { deletedId }
    }`,
    { id },
    organizationId,
  );
  return { success: data.deleteLandingPage.deletedId === id };
};

export const duplicateLandingPageViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Page> => {
  const data = await graphqlMutationRequest<
    { duplicateLandingPage: GqlPage },
    { id: number }
  >(
    `mutation DuplicateLandingPage($id: Int!) {
      duplicateLandingPage(id: $id) { ${pageFields} }
    }`,
    { id },
    organizationId,
  );
  return mapPage(data.duplicateLandingPage);
};

const sectionMutation = async (
  document: string,
  field: string,
  variables: Record<string, unknown>,
  organizationId?: number,
): Promise<PageSection> => {
  const data = await graphqlMutationRequest<
    Record<string, GqlSection>,
    Record<string, unknown>
  >(document, variables, organizationId);
  return mapSection(data[field]);
};

export const replaceLandingPageSectionsViaGraphql = async (
  pageId: number,
  sections: Partial<PageSection>[],
  organizationId?: number,
) => {
  const variables = { pageId, sections: sections.map(mapSectionInput) };
  const data = await graphqlMutationRequest<
    { replaceLandingPageSections: { sections: GqlSection[] } },
    typeof variables
  >(
    `mutation ReplaceLandingPageSections($pageId: Int!, $sections: [LandingPageSectionInput!]!) {
      replaceLandingPageSections(pageId: $pageId, sections: $sections) {
        sections { ${sectionFields} }
      }
    }`,
    variables,
    organizationId,
  );
  return { sections: data.replaceLandingPageSections.sections.map(mapSection) };
};

export const addLandingPageSectionViaGraphql = async (
  pageId: number,
  section: {
    section_type: SectionType;
    name?: string;
    content?: Record<string, unknown>;
    settings?: Partial<PageSectionSettings>;
    position?: number;
  },
  organizationId?: number,
) =>
  sectionMutation(
    `mutation AddLandingPageSection($pageId: Int!, $input: AddLandingPageSectionInput!) {
      addLandingPageSection(pageId: $pageId, input: $input) { ${sectionFields} }
    }`,
    'addLandingPageSection',
    {
      pageId,
      input: {
        ...mapSectionInput(section),
        ...(section.position === undefined ? {} : { position: section.position }),
      },
    },
    organizationId,
  );

export const updateLandingPageSectionViaGraphql = async (
  pageId: number,
  sectionId: number,
  section: Partial<Pick<PageSection, 'section_type' | 'name' | 'content' | 'settings'>>,
  organizationId?: number,
) =>
  sectionMutation(
    `mutation UpdateLandingPageSection($pageId: Int!, $sectionId: Int!, $input: UpdateLandingPageSectionInput!) {
      updateLandingPageSection(pageId: $pageId, sectionId: $sectionId, input: $input) {
        ${sectionFields}
      }
    }`,
    'updateLandingPageSection',
    {
      pageId,
      sectionId,
      input: {
        ...(section.section_type === undefined
          ? {}
          : { sectionType: section.section_type }),
        ...(section.name === undefined ? {} : { name: section.name }),
        ...(section.content === undefined ? {} : { content: section.content }),
        ...(section.settings === undefined ? {} : { settings: section.settings }),
      },
    },
    organizationId,
  );

export const deleteLandingPageSectionViaGraphql = async (
  pageId: number,
  sectionId: number,
  organizationId?: number,
) => {
  const data = await graphqlMutationRequest<
    { deleteLandingPageSection: { deletedId: number } },
    { pageId: number; sectionId: number }
  >(
    `mutation DeleteLandingPageSection($pageId: Int!, $sectionId: Int!) {
      deleteLandingPageSection(pageId: $pageId, sectionId: $sectionId) { deletedId }
    }`,
    { pageId, sectionId },
    organizationId,
  );
  return { success: data.deleteLandingPageSection.deletedId === sectionId };
};

export const reorderLandingPageSectionsViaGraphql = async (
  pageId: number,
  sectionIds: number[],
  organizationId?: number,
) => {
  const variables = { pageId, sectionIds };
  const data = await graphqlMutationRequest<
    { reorderLandingPageSections: { sections: GqlSection[] } },
    typeof variables
  >(
    `mutation ReorderLandingPageSections($pageId: Int!, $sectionIds: [Int!]!) {
      reorderLandingPageSections(pageId: $pageId, sectionIds: $sectionIds) {
        sections { ${sectionFields} }
      }
    }`,
    variables,
    organizationId,
  );
  return { sections: data.reorderLandingPageSections.sections.map(mapSection) };
};

export const getLandingPageAnalyticsViaGraphql = async (
  id: number,
  period: number,
  organizationId?: number,
): Promise<PageAnalytics> => {
  const data = await graphqlRequest<
    {
      landingPageAnalytics: {
        period: number;
        overall: {
          totalViews: number;
          uniqueVisitors: number;
          averageTimeOnPage: number;
          averageScrollDepth: number;
          conversions: number;
        };
        viewsOverTime: Array<{ date: string; views: number; uniqueVisitors: number }>;
        devices: Array<{ deviceType: string | null; count: number }>;
        referrers: Array<{ referrer: string; count: number }>;
        utmSources: Array<{
          utmSource: string;
          utmMedium: string | null;
          utmCampaign: string | null;
          count: number;
        }>;
      };
    },
    { id: number; period: number }
  >(
    `query LandingPageAnalytics($id: Int!, $period: Int!) {
      landingPageAnalytics(id: $id, period: $period) {
        period
        overall { totalViews uniqueVisitors averageTimeOnPage averageScrollDepth conversions }
        viewsOverTime { date views uniqueVisitors }
        devices { deviceType count }
        referrers { referrer count }
        utmSources { utmSource utmMedium utmCampaign count }
      }
    }`,
    { id, period },
    organizationId,
  );
  const value = data.landingPageAnalytics;
  return {
    period: value.period,
    overall: {
      total_views: value.overall.totalViews,
      unique_visitors: value.overall.uniqueVisitors,
      avg_time_on_page: value.overall.averageTimeOnPage,
      avg_scroll_depth: value.overall.averageScrollDepth,
      conversions: value.overall.conversions,
    },
    views_over_time: value.viewsOverTime.map((row) => ({
      date: row.date,
      views: row.views,
      unique_visitors: row.uniqueVisitors,
    })),
    devices: value.devices.map((row) => ({
      device_type: row.deviceType ?? 'unknown',
      count: row.count,
    })),
    referrers: value.referrers,
    utm_sources: value.utmSources.map((row) => ({
      utm_source: row.utmSource,
      utm_medium: row.utmMedium ?? '',
      utm_campaign: row.utmCampaign ?? '',
      count: row.count,
    })),
  };
};
