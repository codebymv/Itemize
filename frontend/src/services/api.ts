import api from '../lib/api';
import { logger } from '../lib/logger';
import { MIN_LIST_WIDTH } from '../constants/dimensions';
import type { JsonValue } from '@/types';
import {
  createCategoryViaGraphql,
  deleteCategoryViaGraphql,
  getCategoriesViaGraphql,
  updateCategoryViaGraphql,
} from './categoriesGraphql';
import {
  getCanvasListsViaGraphql,
  getWorkspaceListsViaGraphql,
  getWorkspaceNotesViaGraphql,
  getWorkspaceWhiteboardsViaGraphql,
  getWorkspaceWireframesViaGraphql,
  updateCanvasPositionsViaGraphql,
} from './workspaceContentGraphql';
import {
  createWorkspaceNoteViaGraphql,
  deleteWorkspaceNoteViaGraphql,
  updateWorkspaceNoteViaGraphql,
} from './workspaceNoteMutationsGraphql';
import {
  createWorkspaceListViaGraphql,
  deleteWorkspaceListViaGraphql,
  updateWorkspaceListViaGraphql,
} from './workspaceListMutationsGraphql';
import {
  createWorkspaceWhiteboardViaGraphql,
  deleteWorkspaceWhiteboardViaGraphql,
  updateWorkspaceWhiteboardViaGraphql,
} from './workspaceWhiteboardMutationsGraphql';
import {
  createWorkspaceWireframeViaGraphql,
  deleteWorkspaceWireframeViaGraphql,
  updateWorkspaceWireframeViaGraphql,
} from './workspaceWireframeMutationsGraphql';
import {
  disableListSharingViaGraphql,
  disableNoteSharingViaGraphql,
  disableWhiteboardSharingViaGraphql,
  enableListSharingViaGraphql,
  enableNoteSharingViaGraphql,
  enableWhiteboardSharingViaGraphql,
} from './workspaceSharingMutationsGraphql';
import {
  rememberWorkspaceWhiteboardRevision,
} from './workspaceWhiteboardRevision';
import {
  addVaultItemsViaGraphql,
  addVaultItemViaGraphql,
  createVaultViaGraphql,
  deleteVaultItemViaGraphql,
  deleteVaultViaGraphql,
  disableVaultSharingViaGraphql,
  enableVaultSharingViaGraphql,
  getVaultsViaGraphql,
  getVaultViaGraphql,
  removeVaultPasswordViaGraphql,
  reorderVaultItemsViaGraphql,
  setVaultPasswordViaGraphql,
  updateVaultItemViaGraphql,
  updateVaultViaGraphql,
} from './workspaceVaultGraphql';

// Types for API requests
export interface CreateNotePayload {
  title?: string;
  content?: string;
  category?: string;
  color_value: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
}

export type CanvasPositionUpdate = {
  type: 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
  id: number | string;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
};

export interface CanvasPath {
  drawMode: boolean;
  strokeColor: string;
  strokeWidth: number;
  paths: Array<{ x: number; y: number }>;
}

export interface CanvasData {
  paths: CanvasPath[];
  shapes?: unknown[];
}

export interface CreateWhiteboardPayload {
  title?: string;
  category?: string;
  canvas_data?: CanvasData | string;
  canvas_width?: number;
  canvas_height?: number;
  background_color?: string;
  position_x?: number;
  position_y?: number;
  z_index?: number;
  color_value?: string;
}

export interface ListPayload {
  id?: string | number;
  title: string;
  type?: string;
  category?: string;
  items?: Array<{ id: string; text: string; completed: boolean }>;
  color_value?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  updated_at?: string;
}

export interface NotePayload {
  id?: number;
  title?: string;
  content?: string;
  category?: string;
  color_value?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
}

export interface WhiteboardPayload {
  id?: number;
  title?: string;
  category?: string;
  canvas_data?: CanvasData | string;
  canvas_width?: number;
  canvas_height?: number;
  background_color?: string;
  position_x?: number;
  position_y?: number;
  z_index?: number;
  color_value?: string;
}

// Backend response types
export interface BackendListResponse {
  id: string | number;
  title: string;
  category?: string;
  type?: string;
  items?: Array<{ id: string; text: string; completed: boolean }>;
  created_at?: string;
  color_value?: string | null;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  share_token?: string;
  is_public?: boolean;
  shared_at?: string;
}

export interface Category {
  id: number;
  name: string;
  color_value: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryPayload {
  name: string;
  color_value?: string;
}

// Helper function to get auth headers with token
const getAuthHeaders = (_token?: string) => ({});

// List API functions
export const fetchCanvasLists = async (token?: string) => {
  void token;
  const responseData = await getCanvasListsViaGraphql();
  
  // Transform backend response to match frontend List interface
  const transformedLists = responseData.map((listFromBackend: BackendListResponse) => ({
    id: listFromBackend.id,
    title: listFromBackend.title,
    type: listFromBackend.category || listFromBackend.type || 'General',
    items: listFromBackend.items || [],
    createdAt: listFromBackend.created_at ? new Date(listFromBackend.created_at) : undefined,
    updated_at: listFromBackend.updated_at,
    color_value: listFromBackend.color_value,
    position_x: listFromBackend.position_x,
    position_y: listFromBackend.position_y,
    width: listFromBackend.width,
    height: listFromBackend.height,
    share_token: listFromBackend.share_token,
    is_public: listFromBackend.is_public,
    shared_at: listFromBackend.shared_at ? new Date(listFromBackend.shared_at).toISOString() : undefined
  }));
  
  return transformedLists;
};

export const getLists = async (token?: string) => {
  void token;
  return getWorkspaceListsViaGraphql();
};

export const createList = async (listData: ListPayload, token?: string) => {
  try {
    void token;
    const response = await createWorkspaceListViaGraphql({
      ...listData,
      width: MIN_LIST_WIDTH,
    });
    return {
      id: response.id,
      title: response.title,
      type: response.category,
      items: response.items,
      createdAt: response.created_at
        ? new Date(response.created_at)
        : undefined,
      updated_at: response.updated_at,
      color_value: response.color_value,
      position_x: response.position_x,
      position_y: response.position_y,
      width: MIN_LIST_WIDTH,
      height: response.height,
      share_token: response.share_token,
      is_public: response.is_public,
      shared_at: response.shared_at
        ? new Date(response.shared_at)
        : undefined,
    };
  } catch (error) {
    console.error('Failed to create list:', error);
    throw error;
  }
};

export const updateList = async (listData: ListPayload & { id: string | number }, token?: string) => {
  void token;
  const response = await updateWorkspaceListViaGraphql(listData);
  return {
    id: response.id,
    title: response.title,
    type: response.category,
    items: response.items,
    createdAt: response.created_at
      ? new Date(response.created_at)
      : undefined,
    updated_at: response.updated_at,
    color_value: response.color_value,
    position_x: response.position_x,
    position_y: response.position_y,
    width: response.width,
    height: response.height,
    share_token: response.share_token,
    is_public: response.is_public,
    shared_at: response.shared_at
      ? new Date(response.shared_at)
      : undefined,
  };
};

export const deleteList = async (listId: string, token?: string) => {
  void token;
  return deleteWorkspaceListViaGraphql(listId);
};

export const updateCanvasPositions = async (updates: CanvasPositionUpdate[], token?: string) => {
  return updateCanvasPositionsViaGraphql(updates);
};

// Note API functions
export const getNotes = async (token?: string) => {
  void token;
  return getWorkspaceNotesViaGraphql();
};

export const createNote = async (noteData: CreateNotePayload, token?: string) => {
  void token;
  return createWorkspaceNoteViaGraphql(noteData);
};

export const updateNote = async (noteId: number, noteData: NotePayload, token?: string) => {
  void token;
  return updateWorkspaceNoteViaGraphql(noteId, noteData);
};

// Granular note update functions for real-time updates
export const updateNoteContent = async (noteId: number, content: string, token?: string) => {
  void token;
  return updateWorkspaceNoteViaGraphql(noteId, { content });
};

export const updateNoteTitle = async (noteId: number, title: string, token?: string) => {
  void token;
  return updateWorkspaceNoteViaGraphql(noteId, { title });
};

export const updateNoteCategory = async (noteId: number, category: string, token?: string) => {
  void token;
  return updateWorkspaceNoteViaGraphql(noteId, { category });
};

export const deleteNote = async (noteId: number, token?: string) => {
  void token;
  return deleteWorkspaceNoteViaGraphql(noteId);
};

// Whiteboard API functions
export const getWhiteboards = async (token?: string) => {
  void token;
  const data = await getWorkspaceWhiteboardsViaGraphql();
  const rows = Array.isArray(data) ? data : data?.whiteboards;
  if (Array.isArray(rows)) {
    rows.forEach((whiteboard) => {
      rememberWorkspaceWhiteboardRevision(
        Number(whiteboard.id),
        whiteboard.updated_at,
      );
    });
  }
  return data;
};

export const createWhiteboard = async (whiteboardData: CreateWhiteboardPayload, token?: string) => {
  void token;
  return createWorkspaceWhiteboardViaGraphql(whiteboardData);
};

export const updateWhiteboard = async (whiteboardId: number, whiteboardData: WhiteboardPayload, token?: string) => {
  logger.log('Sending whiteboard update to backend:', { whiteboardId, whiteboardData });
  void token;
  return updateWorkspaceWhiteboardViaGraphql(
    whiteboardId,
    whiteboardData,
  );
};

export const deleteWhiteboard = async (whiteboardId: number, token?: string) => {
  void token;
  return deleteWorkspaceWhiteboardViaGraphql(whiteboardId);
};

// Wireframe types and API functions
export interface FlowData {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: { label: string; [key: string]: JsonValue };
    style?: Record<string, JsonValue>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
    animated?: boolean;
  }>;
  viewport: { x: number; y: number; zoom: number };
}

export interface CreateWireframePayload {
  title?: string;
  category?: string;
  flow_data?: FlowData | string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  color_value?: string;
}

export interface WireframePayload {
  id?: number;
  title?: string;
  category?: string;
  flow_data?: FlowData | string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  color_value?: string;
}

export const getWireframes = async (token?: string) => {
  void token;
  return getWorkspaceWireframesViaGraphql();
};

export const createWireframe = async (wireframeData: CreateWireframePayload, token?: string) => {
  void token;
  return createWorkspaceWireframeViaGraphql(wireframeData);
};

export const updateWireframe = async (wireframeId: number, wireframeData: WireframePayload, token?: string) => {
  void token;
  logger.log('Sending wireframe update to backend:', { wireframeId, wireframeData });
  return updateWorkspaceWireframeViaGraphql(wireframeId, wireframeData);
};

export const deleteWireframe = async (wireframeId: number, token?: string) => {
  void token;
  return deleteWorkspaceWireframeViaGraphql(wireframeId);
};

export const updateWireframePosition = async (wireframeId: number, x: number, y: number, token?: string) => {
  void token;
  return updateCanvasPositionsViaGraphql([{
    type: 'wireframe',
    id: wireframeId,
    position_x: x,
    position_y: y,
  }]);
};

// Category API functions
export const getCategories = async (token?: string): Promise<Category[]> => {
  void token;
  return getCategoriesViaGraphql();
};

export const createCategory = async (categoryData: CreateCategoryPayload, token?: string): Promise<Category> => {
  void token;
  return createCategoryViaGraphql(categoryData);
};

export const updateCategory = async (categoryId: number, categoryData: CreateCategoryPayload, token?: string): Promise<Category> => {
  void token;
  return updateCategoryViaGraphql(categoryId, categoryData);
};

export const deleteCategory = async (categoryId: number, token?: string) => {
  void token;
  return deleteCategoryViaGraphql(categoryId);
};

// ======================
// Vault API Functions (Encrypted Storage)
// ======================

export interface CreateVaultPayload {
  title?: string;
  category?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  color_value?: string;
  master_password?: string; // Optional - if provided, vault will be locked
}

export interface VaultPayload {
  title?: string;
  category?: string;
  color_value?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
}

export interface VaultItemPayload {
  item_type: 'key_value' | 'secure_note';
  label: string;
  value: string;
  ciphertext?: string;
  iv?: string;
}

// Get all vaults
export const getVaults = async (token?: string) => {
  void token;
  return getVaultsViaGraphql();
};

// Get a single vault with decrypted items
export const getVault = async (vaultId: number, masterPassword?: string, token?: string) => {
  void token;
  return getVaultViaGraphql(vaultId, masterPassword);
};

// Create a new vault
export const createVault = async (vaultData: CreateVaultPayload, token?: string) => {
  void token;
  return createVaultViaGraphql(vaultData);
};

// Update a vault
export const updateVault = async (vaultId: number, vaultData: VaultPayload, token?: string) => {
  void token;
  return updateVaultViaGraphql(vaultId, vaultData);
};

// Update vault position
export const updateVaultPosition = async (vaultId: number, x: number, y: number, token?: string) => {
  void token;
  return updateVaultViaGraphql(vaultId, { position_x: x, position_y: y });
};

// Delete a vault
export const deleteVault = async (vaultId: number, token?: string) => {
  void token;
  return deleteVaultViaGraphql(vaultId);
};

// Add item to vault
export const addVaultItem = async (
  vaultId: number,
  item: VaultItemPayload,
  token?: string,
  masterPassword?: string,
) => {
  void token;
  return addVaultItemViaGraphql(vaultId, item, masterPassword);
};

export const bulkAddVaultItems = async (
  vaultId: number,
  items: VaultItemPayload[],
  token?: string,
  masterPassword?: string,
) => {
  void token;
  return addVaultItemsViaGraphql(vaultId, items, masterPassword);
};

export const updateVaultItem = async (
  vaultId: number,
  itemId: number,
  data: { label?: string; value?: string },
  token?: string,
  masterPassword?: string,
) => {
  void token;
  return updateVaultItemViaGraphql(vaultId, itemId, data, masterPassword);
};

export const deleteVaultItem = async (
  vaultId: number,
  itemId: number,
  token?: string,
  masterPassword?: string,
) => {
  void token;
  return deleteVaultItemViaGraphql(vaultId, itemId, masterPassword);
};

export const reorderVaultItems = async (
  vaultId: number,
  itemIds: number[],
  token?: string,
  masterPassword?: string,
) => {
  void token;
  return reorderVaultItemsViaGraphql(vaultId, itemIds, masterPassword);
};

// Enable vault sharing
export const shareVault = async (vaultId: number, token?: string) => {
  void token;
  return enableVaultSharingViaGraphql(vaultId);
};

// Disable vault sharing
export const unshareVault = async (vaultId: number, token?: string) => {
  void token;
  return disableVaultSharingViaGraphql(vaultId);
};

// Get shared vault (public)
export const getSharedVault = async (shareToken: string) => {
  const response = await api.get(`/api/shared/vault/${shareToken}`);
  return response.data.data;
};

// Lock vault with master password
export const lockVault = async (vaultId: number, masterPassword: string, currentPassword?: string, token?: string) => {
  void token;
  return setVaultPasswordViaGraphql(vaultId, masterPassword, currentPassword);
};

// Unlock vault (remove master password)
export const unlockVault = async (vaultId: number, masterPassword: string, token?: string) => {
  void token;
  return removeVaultPasswordViaGraphql(vaultId, masterPassword);
};

// Share list
export const shareList = async (listId: string, _token?: string) => {
  return enableListSharingViaGraphql(Number(listId));
};

// Unshare list
export const unshareList = async (listId: string, _token?: string) => {
  await disableListSharingViaGraphql(Number(listId));
  return { message: 'List sharing revoked successfully' };
};

// Share note
export const shareNote = async (noteId: number, _token?: string) => {
  return enableNoteSharingViaGraphql(noteId);
};

// Unshare note
export const unshareNote = async (noteId: number, _token?: string) => {
  await disableNoteSharingViaGraphql(noteId);
  return { message: 'Note sharing revoked successfully' };
};

// Share whiteboard
export const shareWhiteboard = async (whiteboardId: number, _token?: string) => {
  return enableWhiteboardSharingViaGraphql(whiteboardId);
};

// Unshare whiteboard
export const unshareWhiteboard = async (whiteboardId: number, _token?: string) => {
  await disableWhiteboardSharingViaGraphql(whiteboardId);
  return { message: 'Whiteboard sharing revoked successfully' };
};

export default api;
