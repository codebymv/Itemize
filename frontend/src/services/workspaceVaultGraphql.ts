import type { Vault } from '@/types';
import type { CreateVaultPayload, VaultPayload } from './api';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlVaultItem = {
  id: number;
  vaultId: number;
  itemType: 'key_value' | 'secure_note';
  label: string;
  value: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type GraphqlVault = {
  id: number;
  userId: number;
  title: string;
  category: string;
  colorValue: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  isLocked: boolean;
  encryptionSalt: string | null;
  itemCount: number;
  items: GraphqlVaultItem[];
  requiresUnlock: boolean;
  shareToken: string | null;
  isPublic: boolean;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GraphqlPageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

const VAULT_FIELDS = `
  id userId title category colorValue positionX positionY width height zIndex
  isLocked encryptionSalt itemCount requiresUnlock shareToken isPublic sharedAt
  createdAt updatedAt
  items {
    id vaultId itemType label value orderIndex createdAt updatedAt
  }
`;

const legacyVault = (vault: GraphqlVault): Vault => ({
  id: vault.id,
  user_id: vault.userId,
  title: vault.title,
  category: vault.category,
  color_value: vault.colorValue,
  position_x: vault.positionX,
  position_y: vault.positionY,
  width: vault.width,
  height: vault.height,
  z_index: vault.zIndex,
  is_locked: vault.isLocked,
  ...(vault.encryptionSalt ? { encryption_salt: vault.encryptionSalt } : {}),
  item_count: vault.itemCount,
  items: vault.items.map((item) => ({
    id: item.id,
    vault_id: item.vaultId,
    item_type: item.itemType,
    label: item.label,
    value: item.value,
    order_index: item.orderIndex,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  })),
  requires_unlock: vault.requiresUnlock,
  ...(vault.shareToken ? { share_token: vault.shareToken } : {}),
  is_public: vault.isPublic,
  ...(vault.sharedAt ? { shared_at: vault.sharedAt } : {}),
  created_at: vault.createdAt,
  updated_at: vault.updatedAt,
});

export const getVaultsViaGraphql = async (): Promise<{
  vaults: Vault[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}> => {
  const data = await graphqlRequest<
    { workspaceVaults: { nodes: GraphqlVault[]; pageInfo: GraphqlPageInfo } },
    Record<string, never>
  >(
    `query WorkspaceVaults {
      workspaceVaults {
        nodes { ${VAULT_FIELDS} }
        pageInfo {
          page pageSize total totalPages hasNextPage hasPreviousPage
        }
      }
    }`,
    {},
  );
  const { nodes, pageInfo } = data.workspaceVaults;
  return {
    vaults: nodes.map(legacyVault),
    pagination: {
      page: pageInfo.page,
      limit: pageInfo.pageSize,
      total: pageInfo.total,
      totalPages: pageInfo.totalPages,
      hasNextPage: pageInfo.hasNextPage,
      hasPreviousPage: pageInfo.hasPreviousPage,
    },
  };
};

export const getVaultViaGraphql = async (
  id: number,
  masterPassword?: string,
): Promise<Vault> => {
  const data = await graphqlRequest<
    { workspaceVault: GraphqlVault },
    { id: number; masterPassword?: string }
  >(
    `query WorkspaceVault($id: Int!, $masterPassword: String) {
      workspaceVault(id: $id, masterPassword: $masterPassword) {
        ${VAULT_FIELDS}
      }
    }`,
    { id, ...(masterPassword ? { masterPassword } : {}) },
  );
  return legacyVault(data.workspaceVault);
};

const createInput = (payload: CreateVaultPayload) => ({
  ...(payload.title !== undefined ? { title: payload.title } : {}),
  ...(payload.category !== undefined ? { category: payload.category } : {}),
  ...(payload.color_value !== undefined ? { colorValue: payload.color_value } : {}),
  positionX: payload.position_x ?? 0,
  positionY: payload.position_y ?? 0,
  ...(payload.width !== undefined ? { width: payload.width } : {}),
  ...(payload.height !== undefined ? { height: payload.height } : {}),
  ...(payload.z_index !== undefined ? { zIndex: payload.z_index } : {}),
  ...(payload.master_password !== undefined
    ? { masterPassword: payload.master_password }
    : {}),
});

const updateInput = (payload: VaultPayload) => ({
  ...(payload.title !== undefined ? { title: payload.title } : {}),
  ...(payload.category !== undefined ? { category: payload.category } : {}),
  ...(payload.color_value !== undefined ? { colorValue: payload.color_value } : {}),
  ...(payload.position_x !== undefined ? { positionX: payload.position_x } : {}),
  ...(payload.position_y !== undefined ? { positionY: payload.position_y } : {}),
  ...(payload.width !== undefined ? { width: payload.width } : {}),
  ...(payload.height !== undefined ? { height: payload.height } : {}),
  ...(payload.z_index !== undefined ? { zIndex: payload.z_index } : {}),
});

export const createVaultViaGraphql = async (
  payload: CreateVaultPayload,
): Promise<Vault> => {
  const data = await graphqlMutationRequest<
    { createWorkspaceVault: GraphqlVault },
    { input: ReturnType<typeof createInput> }
  >(
    `mutation CreateWorkspaceVault($input: CreateWorkspaceVaultInput!) {
      createWorkspaceVault(input: $input) { ${VAULT_FIELDS} }
    }`,
    { input: createInput(payload) },
  );
  return legacyVault(data.createWorkspaceVault);
};

export const updateVaultViaGraphql = async (
  id: number,
  payload: VaultPayload,
): Promise<Vault> => {
  const data = await graphqlMutationRequest<
    { updateWorkspaceVault: GraphqlVault },
    { id: number; input: ReturnType<typeof updateInput> }
  >(
    `mutation UpdateWorkspaceVault($id: Int!, $input: UpdateWorkspaceVaultInput!) {
      updateWorkspaceVault(id: $id, input: $input) { ${VAULT_FIELDS} }
    }`,
    { id, input: updateInput(payload) },
  );
  return legacyVault(data.updateWorkspaceVault);
};

export const deleteVaultViaGraphql = async (
  id: number,
): Promise<{ message: string; deletedId: number }> => {
  const data = await graphqlMutationRequest<
    { deleteWorkspaceVault: { deletedId: number } },
    { id: number }
  >(
    `mutation DeleteWorkspaceVault($id: Int!) {
      deleteWorkspaceVault(id: $id) { deletedId }
    }`,
    { id },
  );
  return {
    message: 'Vault deleted successfully',
    deletedId: data.deleteWorkspaceVault.deletedId,
  };
};
