import type { JsonRecord, Organization } from '@/types';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlOrganization = {
  id: number;
  name: string;
  slug: string;
  settings: JsonRecord;
  logoUrl: string | null;
  role: Organization['role'];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

const organizationFields = `
  id
  name
  slug
  settings
  logoUrl
  role
  isDefault
  createdAt
  updatedAt
`;

const organizationsQuery = `
  query Organizations {
    organizations { ${organizationFields} }
  }
`;

const selectOrganizationMutation = `
  mutation SelectOrganization($id: Int!) {
    selectOrganization(id: $id) { ${organizationFields} }
  }
`;

const ensureDefaultOrganizationMutation = `
  mutation EnsureDefaultOrganization {
    ensureDefaultOrganization { ${organizationFields} }
  }
`;

const mapOrganization = (
  organization: GraphqlOrganization,
): Organization => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  settings: organization.settings ?? {},
  ...(organization.logoUrl === null
    ? {}
    : { logo_url: organization.logoUrl }),
  role: organization.role,
  is_default: organization.isDefault,
  created_at: organization.createdAt,
  updated_at: organization.updatedAt,
});

export const getOrganizationsViaGraphql = async (): Promise<Organization[]> => {
  const data = await graphqlRequest<
    { organizations: GraphqlOrganization[] },
    Record<string, never>
  >(organizationsQuery, {});
  return data.organizations.map(mapOrganization);
};

export const selectOrganizationViaGraphql = async (
  id: number,
): Promise<Organization> => {
  const data = await graphqlMutationRequest<
    { selectOrganization: GraphqlOrganization },
    { id: number }
  >(selectOrganizationMutation, { id });
  return mapOrganization(data.selectOrganization);
};

export const ensureDefaultOrganizationViaGraphql =
  async (): Promise<Organization> => {
    const data = await graphqlMutationRequest<
      { ensureDefaultOrganization: GraphqlOrganization },
      Record<string, never>
    >(ensureDefaultOrganizationMutation, {});
    return mapOrganization(data.ensureDefaultOrganization);
  };
