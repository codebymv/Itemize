import type { PageVersion } from './pageVersionsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GqlPageVersion = {
  id: number;
  pageId: number;
  versionNumber: number;
  content: PageVersion['content'];
  description: string | null;
  createdBy: number | null;
  createdByName: string | null;
  publishedAt: string | null;
  isCurrent: boolean;
  createdAt: string;
};

const versionFields = `
  id pageId versionNumber content description createdBy createdByName
  publishedAt isCurrent createdAt
`;

const mapVersion = (version: GqlPageVersion): PageVersion => ({
  id: version.id,
  page_id: version.pageId,
  version_number: version.versionNumber,
  content: version.content,
  description: version.description ?? '',
  ...(version.createdBy === null ? {} : { created_by: version.createdBy }),
  ...(version.createdByName === null
    ? {}
    : { created_by_name: version.createdByName }),
  ...(version.publishedAt === null
    ? {}
    : { published_at: version.publishedAt }),
  created_at: version.createdAt,
});

export const getLandingPageVersionsViaGraphql = async (
  pageId: number,
  organizationId?: number,
): Promise<{ versions: PageVersion[]; currentVersionId: number | null }> => {
  const data = await graphqlRequest<
    {
      landingPageVersions: {
        versions: GqlPageVersion[];
        currentVersionId: number | null;
      };
    },
    { pageId: number }
  >(
    `query LandingPageVersions($pageId: Int!) {
      landingPageVersions(pageId: $pageId) {
        currentVersionId
        versions { ${versionFields} }
      }
    }`,
    { pageId },
    organizationId,
  );
  return {
    versions: data.landingPageVersions.versions.map(mapVersion),
    currentVersionId: data.landingPageVersions.currentVersionId,
  };
};

export const getLandingPageVersionViaGraphql = async (
  pageId: number,
  versionId: number,
  organizationId?: number,
): Promise<PageVersion> => {
  const data = await graphqlRequest<
    { landingPageVersion: GqlPageVersion },
    { pageId: number; versionId: number }
  >(
    `query LandingPageVersion($pageId: Int!, $versionId: Int!) {
      landingPageVersion(pageId: $pageId, versionId: $versionId) {
        ${versionFields}
      }
    }`,
    { pageId, versionId },
    organizationId,
  );
  return mapVersion(data.landingPageVersion);
};

export const createLandingPageVersionViaGraphql = async (
  pageId: number,
  description?: string,
  organizationId?: number,
): Promise<PageVersion> => {
  const variables = { pageId, ...(description === undefined ? {} : { description }) };
  const data = await graphqlMutationRequest<
    { createLandingPageVersion: GqlPageVersion },
    typeof variables
  >(
    `mutation CreateLandingPageVersion($pageId: Int!, $description: String) {
      createLandingPageVersion(pageId: $pageId, description: $description) {
        ${versionFields}
      }
    }`,
    variables,
    organizationId,
  );
  return mapVersion(data.createLandingPageVersion);
};

const versionMutation = async (
  operation: 'publish' | 'restore',
  pageId: number,
  versionId: number,
  organizationId?: number,
): Promise<PageVersion> => {
  const field =
    operation === 'publish'
      ? 'publishLandingPageVersion'
      : 'restoreLandingPageVersion';
  const data = await graphqlMutationRequest<
    Record<string, GqlPageVersion>,
    { pageId: number; versionId: number }
  >(
    `mutation ${operation === 'publish' ? 'Publish' : 'Restore'}LandingPageVersion(
      $pageId: Int!, $versionId: Int!
    ) {
      ${field}(pageId: $pageId, versionId: $versionId) { ${versionFields} }
    }`,
    { pageId, versionId },
    organizationId,
  );
  return mapVersion(data[field]);
};

export const publishLandingPageVersionViaGraphql = (
  pageId: number,
  versionId: number,
  organizationId?: number,
) => versionMutation('publish', pageId, versionId, organizationId);

export const restoreLandingPageVersionViaGraphql = (
  pageId: number,
  versionId: number,
  organizationId?: number,
) => versionMutation('restore', pageId, versionId, organizationId);

export const deleteLandingPageVersionViaGraphql = async (
  pageId: number,
  versionId: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteLandingPageVersion: { deletedId: number } },
    { pageId: number; versionId: number }
  >(
    `mutation DeleteLandingPageVersion($pageId: Int!, $versionId: Int!) {
      deleteLandingPageVersion(pageId: $pageId, versionId: $versionId) {
        deletedId
      }
    }`,
    { pageId, versionId },
    organizationId,
  );
  return { success: data.deleteLandingPageVersion.deletedId === versionId };
};
