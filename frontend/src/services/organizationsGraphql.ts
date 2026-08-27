import type {
  JsonRecord,
  Organization,
  OrganizationMember,
} from '@/types';
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

type GraphqlOrganizationMember = {
  id: number;
  organizationId: number;
  userId: number;
  role: OrganizationMember['role'];
  invitedAt: string;
  joinedAt: string | null;
  invitedBy: number | null;
  userName: string | null;
  email: string;
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

const organizationQuery = `
  query Organization($id: Int!) {
    organization(id: $id) { ${organizationFields} }
  }
`;

const organizationMembersQuery = `
  query OrganizationMembers($organizationId: Int!) {
    organizationMembers(organizationId: $organizationId) {
      id
      organizationId
      userId
      role
      invitedAt
      joinedAt
      invitedBy
      userName
      email
    }
  }
`;

const createOrganizationMutation = `
  mutation CreateOrganization($input: CreateOrganizationInput!) {
    createOrganization(input: $input) { ${organizationFields} }
  }
`;

const updateOrganizationMutation = `
  mutation UpdateOrganization($id: Int!, $input: UpdateOrganizationInput!) {
    updateOrganization(id: $id, input: $input) { ${organizationFields} }
  }
`;

const deleteOrganizationMutation = `
  mutation DeleteOrganization($id: Int!) {
    deleteOrganization(id: $id) { deletedId }
  }
`;

const addOrganizationMemberMutation = `
  mutation AddOrganizationMember(
    $organizationId: Int!
    $input: AddOrganizationMemberInput!
  ) {
    addOrganizationMember(organizationId: $organizationId, input: $input) {
      id organizationId userId role invitedAt joinedAt invitedBy userName email
    }
  }
`;

const updateOrganizationMemberRoleMutation = `
  mutation UpdateOrganizationMemberRole(
    $organizationId: Int!
    $memberId: Int!
    $role: String!
  ) {
    updateOrganizationMemberRole(
      organizationId: $organizationId
      memberId: $memberId
      role: $role
    ) {
      id organizationId userId role invitedAt joinedAt invitedBy userName email
    }
  }
`;

const removeOrganizationMemberMutation = `
  mutation RemoveOrganizationMember($organizationId: Int!, $memberId: Int!) {
    removeOrganizationMember(
      organizationId: $organizationId
      memberId: $memberId
    ) { removedMemberId }
  }
`;

const transferOrganizationOwnershipMutation = `
  mutation TransferOrganizationOwnership(
    $organizationId: Int!
    $memberId: Int!
  ) {
    transferOrganizationOwnership(
      organizationId: $organizationId
      memberId: $memberId
    ) {
      id organizationId userId role invitedAt joinedAt invitedBy userName email
    }
  }
`;

const leaveOrganizationMutation = `
  mutation LeaveOrganization($organizationId: Int!) {
    leaveOrganization(organizationId: $organizationId)
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

const mapOrganizationMember = (
  member: GraphqlOrganizationMember,
): OrganizationMember => ({
  id: member.id,
  organization_id: member.organizationId,
  user_id: member.userId,
  role: member.role,
  invited_at: member.invitedAt,
  ...(member.joinedAt === null ? {} : { joined_at: member.joinedAt }),
  ...(member.invitedBy === null ? {} : { invited_by: member.invitedBy }),
  ...(member.userName === null ? {} : { user_name: member.userName }),
  email: member.email,
});

export const getOrganizationsViaGraphql = async (): Promise<Organization[]> => {
  const data = await graphqlRequest<
    { organizations: GraphqlOrganization[] },
    Record<string, never>
  >(organizationsQuery, {});
  return data.organizations.map(mapOrganization);
};

export const getOrganizationViaGraphql = async (
  id: number,
): Promise<Organization> => {
  const data = await graphqlRequest<
    { organization: GraphqlOrganization },
    { id: number }
  >(organizationQuery, { id });
  return mapOrganization(data.organization);
};

export const getOrganizationMembersViaGraphql = async (
  organizationId: number,
): Promise<OrganizationMember[]> => {
  const data = await graphqlRequest<
    { organizationMembers: GraphqlOrganizationMember[] },
    { organizationId: number }
  >(organizationMembersQuery, { organizationId });
  return data.organizationMembers.map(mapOrganizationMember);
};

export const createOrganizationViaGraphql = async (input: {
  name: string;
  settings?: JsonRecord;
}): Promise<Organization> => {
  const data = await graphqlMutationRequest<
    { createOrganization: GraphqlOrganization },
    { input: { name: string; settings?: JsonRecord } }
  >(createOrganizationMutation, { input });
  return mapOrganization(data.createOrganization);
};

export const updateOrganizationViaGraphql = async (
  id: number,
  input: Partial<Organization>,
): Promise<Organization> => {
  const graphqlInput = {
    ...('name' in input ? { name: input.name } : {}),
    ...('settings' in input ? { settings: input.settings } : {}),
    ...('logo_url' in input ? { logoUrl: input.logo_url ?? null } : {}),
  };
  const data = await graphqlMutationRequest<
    { updateOrganization: GraphqlOrganization },
    { id: number; input: typeof graphqlInput }
  >(updateOrganizationMutation, { id, input: graphqlInput });
  return mapOrganization(data.updateOrganization);
};

export const deleteOrganizationViaGraphql = async (
  id: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { deleteOrganization: { deletedId: number } },
    { id: number }
  >(deleteOrganizationMutation, { id });
};

export const addOrganizationMemberViaGraphql = async (
  organizationId: number,
  email: string,
  role: string,
): Promise<OrganizationMember> => {
  const data = await graphqlMutationRequest<
    { addOrganizationMember: GraphqlOrganizationMember },
    { organizationId: number; input: { email: string; role: string } }
  >(addOrganizationMemberMutation, {
    organizationId,
    input: { email, role },
  });
  return mapOrganizationMember(data.addOrganizationMember);
};

export const updateOrganizationMemberRoleViaGraphql = async (
  organizationId: number,
  memberId: number,
  role: string,
): Promise<OrganizationMember> => {
  const data = await graphqlMutationRequest<
    { updateOrganizationMemberRole: GraphqlOrganizationMember },
    { organizationId: number; memberId: number; role: string }
  >(updateOrganizationMemberRoleMutation, {
    organizationId,
    memberId,
    role,
  });
  return mapOrganizationMember(data.updateOrganizationMemberRole);
};

export const removeOrganizationMemberViaGraphql = async (
  organizationId: number,
  memberId: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { removeOrganizationMember: { removedMemberId: number } },
    { organizationId: number; memberId: number }
  >(removeOrganizationMemberMutation, { organizationId, memberId });
};

export const transferOrganizationOwnershipViaGraphql = async (
  organizationId: number,
  memberId: number,
): Promise<OrganizationMember> => {
  const data = await graphqlMutationRequest<
    { transferOrganizationOwnership: GraphqlOrganizationMember },
    { organizationId: number; memberId: number }
  >(transferOrganizationOwnershipMutation, { organizationId, memberId });
  return mapOrganizationMember(data.transferOrganizationOwnership);
};

export const leaveOrganizationViaGraphql = async (
  organizationId: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { leaveOrganization: boolean },
    { organizationId: number }
  >(leaveOrganizationMutation, { organizationId });
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
