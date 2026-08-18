import type { Vault, VaultItem } from '@/types';
import type {
  CreateVaultPayload,
  VaultItemPayload,
  VaultPayload,
} from './api';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlVaultItem = {
  id: number;
  vaultId: number;
  itemType: 'key_value' | 'secure_note';
  label: string;
  value: string;
  ciphertext?: string | null;
  iv?: string | null;
  cryptoVersion?: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type GraphqlKdf = {
  algorithm: string;
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
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
  cryptoVersion?: number;
  kdf?: GraphqlKdf | null;
  wrappedVek?: string | null;
  wrappedVekRecovery?: string | null;
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

type GraphqlVaultPasswordResult = {
  vaultId: number;
  isLocked: boolean;
  encryptionSalt: string | null;
};

type GraphqlVaultSharingResult = {
  vaultId: number;
  shareToken: string | null;
  shareUrl: string | null;
  isPublic: boolean;
  sharedAt: string | null;
};

const VAULT_FIELDS = `
  id userId title category colorValue positionX positionY width height zIndex
  isLocked encryptionSalt cryptoVersion wrappedVek wrappedVekRecovery
  itemCount requiresUnlock shareToken isPublic sharedAt
  createdAt updatedAt
  kdf { algorithm salt memoryKiB iterations parallelism }
  items {
    id vaultId itemType label value ciphertext iv cryptoVersion orderIndex createdAt updatedAt
  }
`;

const VAULT_ITEM_FIELDS =
  'id vaultId itemType label value ciphertext iv cryptoVersion orderIndex createdAt updatedAt';

const legacyVaultItem = (item: GraphqlVaultItem): VaultItem => ({
  id: item.id,
  vault_id: item.vaultId,
  item_type: item.itemType,
  label: item.label,
  value: item.value,
  ciphertext: item.ciphertext ?? null,
  iv: item.iv ?? null,
  crypto_version: item.cryptoVersion ?? 1,
  order_index: item.orderIndex,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
});

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
  crypto_version: vault.cryptoVersion ?? 1,
  kdf: vault.kdf ?? null,
  wrapped_vek: vault.wrappedVek ?? null,
  wrapped_vek_recovery: vault.wrappedVekRecovery ?? null,
  item_count: vault.itemCount,
  items: vault.items.map(legacyVaultItem),
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

const itemInput = (item: VaultItemPayload) => ({
  itemType: item.item_type,
  ...(item.ciphertext && item.iv
    ? { ciphertext: item.ciphertext, iv: item.iv }
    : { label: item.label, value: item.value }),
});

const withMasterPassword = <T extends Record<string, unknown>>(
  variables: T,
  masterPassword?: string,
) => (masterPassword ? { ...variables, masterPassword } : variables);

export const addVaultItemViaGraphql = async (
  vaultId: number,
  item: VaultItemPayload,
  masterPassword?: string,
): Promise<VaultItem> => {
  const data = await graphqlMutationRequest<
    { addWorkspaceVaultItem: GraphqlVaultItem },
    { vaultId: number; input: ReturnType<typeof itemInput>; masterPassword?: string }
  >(
    `mutation AddWorkspaceVaultItem(
      $vaultId: Int!
      $input: CreateWorkspaceVaultItemInput!
      $masterPassword: String
    ) {
      addWorkspaceVaultItem(
        vaultId: $vaultId
        input: $input
        masterPassword: $masterPassword
      ) {
        ${VAULT_ITEM_FIELDS}
      }
    }`,
    withMasterPassword({ vaultId, input: itemInput(item) }, masterPassword),
  );
  return legacyVaultItem(data.addWorkspaceVaultItem);
};

export const addVaultItemsViaGraphql = async (
  vaultId: number,
  items: VaultItemPayload[],
  masterPassword?: string,
): Promise<{ items: VaultItem[]; count: number }> => {
  const data = await graphqlMutationRequest<
    {
      addWorkspaceVaultItems: {
        items: GraphqlVaultItem[];
        count: number;
      };
    },
    {
      vaultId: number;
      items: Array<ReturnType<typeof itemInput>>;
      masterPassword?: string;
    }
  >(
    `mutation AddWorkspaceVaultItems(
      $vaultId: Int!
      $items: [CreateWorkspaceVaultItemInput!]!
      $masterPassword: String
    ) {
      addWorkspaceVaultItems(
        vaultId: $vaultId
        items: $items
        masterPassword: $masterPassword
      ) {
        count
        items { ${VAULT_ITEM_FIELDS} }
      }
    }`,
    withMasterPassword(
      { vaultId, items: items.map(itemInput) },
      masterPassword,
    ),
  );
  return {
    count: data.addWorkspaceVaultItems.count,
    items: data.addWorkspaceVaultItems.items.map(legacyVaultItem),
  };
};

export const updateVaultItemViaGraphql = async (
  vaultId: number,
  itemId: number,
  input: { label?: string; value?: string; ciphertext?: string; iv?: string },
  masterPassword?: string,
): Promise<VaultItem> => {
  const data = await graphqlMutationRequest<
    { updateWorkspaceVaultItem: GraphqlVaultItem },
    {
      vaultId: number;
      itemId: number;
      input: { label?: string; value?: string; ciphertext?: string; iv?: string };
      masterPassword?: string;
    }
  >(
    `mutation UpdateWorkspaceVaultItem(
      $vaultId: Int!
      $itemId: Int!
      $input: UpdateWorkspaceVaultItemInput!
      $masterPassword: String
    ) {
      updateWorkspaceVaultItem(
        vaultId: $vaultId
        itemId: $itemId
        input: $input
        masterPassword: $masterPassword
      ) { ${VAULT_ITEM_FIELDS} }
    }`,
    withMasterPassword({ vaultId, itemId, input }, masterPassword),
  );
  return legacyVaultItem(data.updateWorkspaceVaultItem);
};

export const deleteVaultItemViaGraphql = async (
  vaultId: number,
  itemId: number,
  masterPassword?: string,
): Promise<{ message: string; deletedId: number }> => {
  const data = await graphqlMutationRequest<
    { deleteWorkspaceVaultItem: { deletedId: number } },
    { vaultId: number; itemId: number; masterPassword?: string }
  >(
    `mutation DeleteWorkspaceVaultItem(
      $vaultId: Int!
      $itemId: Int!
      $masterPassword: String
    ) {
      deleteWorkspaceVaultItem(
        vaultId: $vaultId
        itemId: $itemId
        masterPassword: $masterPassword
      ) {
        deletedId
      }
    }`,
    withMasterPassword({ vaultId, itemId }, masterPassword),
  );
  return {
    message: 'Item deleted successfully',
    deletedId: data.deleteWorkspaceVaultItem.deletedId,
  };
};

export const reorderVaultItemsViaGraphql = async (
  vaultId: number,
  itemIds: number[],
  masterPassword?: string,
): Promise<{ message: string; items: VaultItem[] }> => {
  const data = await graphqlMutationRequest<
    {
      reorderWorkspaceVaultItems: {
        items: GraphqlVaultItem[];
      };
    },
    { vaultId: number; itemIds: number[]; masterPassword?: string }
  >(
    `mutation ReorderWorkspaceVaultItems(
      $vaultId: Int!
      $itemIds: [Int!]!
      $masterPassword: String
    ) {
      reorderWorkspaceVaultItems(
        vaultId: $vaultId
        itemIds: $itemIds
        masterPassword: $masterPassword
      ) {
        items { ${VAULT_ITEM_FIELDS} }
      }
    }`,
    withMasterPassword({ vaultId, itemIds }, masterPassword),
  );
  return {
    message: 'Items reordered successfully',
    items: data.reorderWorkspaceVaultItems.items.map(legacyVaultItem),
  };
};

export const setVaultPasswordViaGraphql = async (
  vaultId: number,
  newPassword: string,
  currentPassword?: string,
): Promise<{
  message: string;
  vaultId: number;
  isLocked: boolean;
  encryptionSalt: string | null;
}> => {
  const data = await graphqlMutationRequest<
    { setWorkspaceVaultPassword: GraphqlVaultPasswordResult },
    { vaultId: number; newPassword: string; currentPassword?: string }
  >(
    `mutation SetWorkspaceVaultPassword(
      $vaultId: Int!
      $newPassword: String!
      $currentPassword: String
    ) {
      setWorkspaceVaultPassword(
        vaultId: $vaultId
        newPassword: $newPassword
        currentPassword: $currentPassword
      ) {
        vaultId isLocked encryptionSalt
      }
    }`,
    {
      vaultId,
      newPassword,
      ...(currentPassword ? { currentPassword } : {}),
    },
  );
  return {
    message: 'Vault locked successfully',
    ...data.setWorkspaceVaultPassword,
  };
};

export const removeVaultPasswordViaGraphql = async (
  vaultId: number,
  password: string,
): Promise<{
  message: string;
  vaultId: number;
  isLocked: boolean;
  encryptionSalt: string | null;
}> => {
  const data = await graphqlMutationRequest<
    { removeWorkspaceVaultPassword: GraphqlVaultPasswordResult },
    { vaultId: number; password: string }
  >(
    `mutation RemoveWorkspaceVaultPassword(
      $vaultId: Int!
      $password: String!
    ) {
      removeWorkspaceVaultPassword(vaultId: $vaultId, password: $password) {
        vaultId isLocked encryptionSalt
      }
    }`,
    { vaultId, password },
  );
  return {
    message: 'Vault unlocked successfully',
    ...data.removeWorkspaceVaultPassword,
  };
};

export const enableVaultSharingViaGraphql = async (
  vaultId: number,
  snapshot?: { ciphertext: string; iv: string },
): Promise<{ shareToken: string; shareUrl: string }> => {
  const data = await graphqlMutationRequest<
    { enableWorkspaceVaultSharing: GraphqlVaultSharingResult },
    {
      vaultId: number;
      confirmDecryptedSharing: boolean;
      snapshotCiphertext?: string;
      snapshotIv?: string;
    }
  >(
    `mutation EnableWorkspaceVaultSharing(
      $vaultId: Int!
      $confirmDecryptedSharing: Boolean!
      $snapshotCiphertext: String
      $snapshotIv: String
    ) {
      enableWorkspaceVaultSharing(
        vaultId: $vaultId
        confirmDecryptedSharing: $confirmDecryptedSharing
        snapshotCiphertext: $snapshotCiphertext
        snapshotIv: $snapshotIv
      ) {
        vaultId shareToken shareUrl isPublic sharedAt
      }
    }`,
    {
      vaultId,
      confirmDecryptedSharing: true,
      ...(snapshot
        ? { snapshotCiphertext: snapshot.ciphertext, snapshotIv: snapshot.iv }
        : {}),
    },
  );
  const result = data.enableWorkspaceVaultSharing;
  if (
    result.vaultId !== vaultId ||
    !result.shareToken ||
    !result.shareUrl ||
    !result.isPublic ||
    !result.sharedAt
  ) {
    throw new Error('GraphQL vault sharing mutation returned an invalid link');
  }
  return { shareToken: result.shareToken, shareUrl: result.shareUrl };
};

export const disableVaultSharingViaGraphql = async (
  vaultId: number,
): Promise<{ message: string }> => {
  const data = await graphqlMutationRequest<
    { disableWorkspaceVaultSharing: GraphqlVaultSharingResult },
    { vaultId: number }
  >(
    `mutation DisableWorkspaceVaultSharing($vaultId: Int!) {
      disableWorkspaceVaultSharing(vaultId: $vaultId) {
        vaultId shareToken shareUrl isPublic sharedAt
      }
    }`,
    { vaultId },
  );
  const result = data.disableWorkspaceVaultSharing;
  if (
    result.vaultId !== vaultId ||
    result.isPublic ||
    result.shareToken ||
    result.shareUrl ||
    result.sharedAt
  ) {
    throw new Error('GraphQL vault sharing revocation did not commit');
  }
  return { message: 'Vault sharing disabled' };
};

export const migrateVaultToV2ViaGraphql = async (
  vaultId: number,
  input: {
    kdfSalt: string;
    kdfMemoryKiB: number;
    kdfIterations: number;
    kdfParallelism: number;
    wrappedVek: string;
    wrappedVekRecovery?: string;
    items: Array<{ id: number; ciphertext: string; iv: string }>;
  },
  currentPassword?: string,
): Promise<Vault> => {
  const data = await graphqlMutationRequest<
    { migrateWorkspaceVaultToV2: GraphqlVault },
    {
      vaultId: number;
      input: typeof input;
      currentPassword?: string;
    }
  >(
    `mutation MigrateWorkspaceVaultToV2(
      $vaultId: Int!
      $input: MigrateWorkspaceVaultToV2Input!
      $currentPassword: String
    ) {
      migrateWorkspaceVaultToV2(
        vaultId: $vaultId
        input: $input
        currentPassword: $currentPassword
      ) { ${VAULT_FIELDS} }
    }`,
    {
      vaultId,
      input,
      ...(currentPassword ? { currentPassword } : {}),
    },
  );
  return legacyVault(data.migrateWorkspaceVaultToV2);
};

export const rewrapVaultViaGraphql = async (
  vaultId: number,
  input: { wrappedVek: string; wrappedVekRecovery?: string },
): Promise<{ vaultId: number; isLocked: boolean; encryptionSalt: string | null }> => {
  const data = await graphqlMutationRequest<
    { rewrapWorkspaceVault: GraphqlVaultPasswordResult },
    { vaultId: number; input: typeof input }
  >(
    `mutation RewrapWorkspaceVault(
      $vaultId: Int!
      $input: RewrapWorkspaceVaultInput!
    ) {
      rewrapWorkspaceVault(vaultId: $vaultId, input: $input) {
        vaultId isLocked encryptionSalt
      }
    }`,
    { vaultId, input },
  );
  return data.rewrapWorkspaceVault;
};

