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
  isCategoryGraphqlMutationsEnabled,
  isCategoryGraphqlReadsEnabled,
  isWorkspaceListGraphqlReadsEnabled,
  isWorkspaceListGraphqlMutationsEnabled,
  isWorkspaceNoteGraphqlMutationsEnabled,
  isWorkspaceNoteGraphqlReadsEnabled,
  isWorkspaceWhiteboardGraphqlMutationsEnabled,
  isWorkspaceWhiteboardGraphqlReadsEnabled,
} from './graphqlClient';
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
  forgetWorkspaceWhiteboardRevision,
  rememberWorkspaceWhiteboardRevision,
} from './workspaceWhiteboardRevision';
import {
  addVaultItemsViaGraphql,
  addVaultItemViaGraphql,
  createVaultViaGraphql,
  deleteVaultItemViaGraphql,
  deleteVaultViaGraphql,
  getVaultsViaGraphql,
  getVaultViaGraphql,
  reorderVaultItemsViaGraphql,
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
  const responseData = isWorkspaceListGraphqlReadsEnabled()
    ? await getCanvasListsViaGraphql()
    : (
        await api.get('/api/canvas/lists', {
          headers: getAuthHeaders(token)
        })
      ).data;
  
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
  if (isWorkspaceListGraphqlReadsEnabled()) {
    return getWorkspaceListsViaGraphql();
  }
  const response = await api.get('/api/lists', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createList = async (listData: ListPayload, token?: string) => {
  try {
    if (isWorkspaceListGraphqlMutationsEnabled()) {
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
    }
    // Transform frontend 'type' field to backend 'category' field
    const backendData = {
      ...listData,
      category: listData.type || listData.category || 'General', // Map type to category for backend
      width: MIN_LIST_WIDTH, // Always set width to MIN_LIST_WIDTH for new lists
    };
    
    // Remove 'type' field to avoid confusion on backend
    delete backendData.type;
    
    const response = await api.post('/api/lists', backendData, {
      headers: getAuthHeaders(token)
    });
    
    if (!response.data || !response.data.id) {
      throw new Error('Invalid response from server');
    }
    
    // Transform backend response to match frontend List interface
    const transformedList = {
      id: response.data.id,
      title: response.data.title,
      type: response.data.category || response.data.type || 'General',
      items: response.data.items || [],
      createdAt: response.data.created_at ? new Date(response.data.created_at) : undefined,
      updated_at: response.data.updated_at,
      color_value: response.data.color_value,
      position_x: response.data.position_x,
      position_y: response.data.position_y,
      width: MIN_LIST_WIDTH, // Ensure width is MIN_LIST_WIDTH even if backend returns something else
      height: response.data.height,
      share_token: response.data.share_token,
      is_public: response.data.is_public,
      shared_at: response.data.shared_at ? new Date(response.data.shared_at) : undefined
    };
    
    return transformedList;
  } catch (error) {
    console.error('Failed to create list:', error);
    throw error;
  }
};

export const updateList = async (listData: ListPayload & { id: string | number }, token?: string) => {
  if (isWorkspaceListGraphqlMutationsEnabled()) {
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
  }
  // Transform frontend 'type' field to backend 'category' field
  const backendData = {
    ...listData,
    category: listData.type || listData.category, // Map type to category for backend
  };
  
  // Remove 'type' field to avoid confusion on backend
  delete backendData.type;
  
  const response = await api.put(`/api/lists/${listData.id}`, backendData, {
    headers: getAuthHeaders(token)
  });
  
  // Transform backend response to match frontend List interface
  const transformedList = {
    id: response.data.id,
    title: response.data.title,
    type: response.data.category || response.data.type || 'General',
    items: response.data.items || [],
    createdAt: response.data.created_at ? new Date(response.data.created_at) : undefined,
    updated_at: response.data.updated_at,
    color_value: response.data.color_value,
    position_x: response.data.position_x,
    position_y: response.data.position_y,
    width: response.data.width,
    height: response.data.height,
    share_token: response.data.share_token,
    is_public: response.data.is_public,
    shared_at: response.data.shared_at ? new Date(response.data.shared_at) : undefined
  };
  
  return transformedList;
};

export const deleteList = async (listId: string, token?: string) => {
  if (isWorkspaceListGraphqlMutationsEnabled()) {
    return deleteWorkspaceListViaGraphql(listId);
  }
  const response = await api.delete(`/api/lists/${listId}`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateListPosition = async (listId: string, x: number, y: number, token?: string) => {
  const response = await api.put(`/api/lists/${listId}/position`, { x, y }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateCanvasPositions = async (updates: CanvasPositionUpdate[], token?: string) => {
  return updateCanvasPositionsViaGraphql(updates);
};

// Note API functions
export const getNotes = async (token?: string) => {
  if (isWorkspaceNoteGraphqlReadsEnabled()) {
    return getWorkspaceNotesViaGraphql();
  }
  const response = await api.get('/api/notes', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createNote = async (noteData: CreateNotePayload, token?: string) => {
  if (isWorkspaceNoteGraphqlMutationsEnabled()) {
    return createWorkspaceNoteViaGraphql(noteData);
  }
  const response = await api.post('/api/notes', noteData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateNote = async (noteId: number, noteData: NotePayload, token?: string) => {
  if (isWorkspaceNoteGraphqlMutationsEnabled()) {
    return updateWorkspaceNoteViaGraphql(noteId, noteData);
  }
  const response = await api.put(`/api/notes/${noteId}`, noteData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Granular note update functions for real-time updates
export const updateNoteContent = async (noteId: number, content: string, token?: string) => {
  if (isWorkspaceNoteGraphqlMutationsEnabled()) {
    return updateWorkspaceNoteViaGraphql(noteId, { content });
  }
  const response = await api.put(`/api/notes/${noteId}/content`, { content }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateNoteTitle = async (noteId: number, title: string, token?: string) => {
  if (isWorkspaceNoteGraphqlMutationsEnabled()) {
    return updateWorkspaceNoteViaGraphql(noteId, { title });
  }
  const response = await api.put(`/api/notes/${noteId}/title`, { title }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateNoteCategory = async (noteId: number, category: string, token?: string) => {
  if (isWorkspaceNoteGraphqlMutationsEnabled()) {
    return updateWorkspaceNoteViaGraphql(noteId, { category });
  }
  const response = await api.put(`/api/notes/${noteId}/category`, { category }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteNote = async (noteId: number, token?: string) => {
  if (isWorkspaceNoteGraphqlMutationsEnabled()) {
    return deleteWorkspaceNoteViaGraphql(noteId);
  }
  logger.log(`🌐 API: Making DELETE request to /api/notes/${noteId}`);
  logger.log(`🔑 API: Auth headers:`, getAuthHeaders(token));

  const response = await api.delete(`/api/notes/${noteId}`, {
    headers: getAuthHeaders(token)
  });

  console.log(`✅ API: Delete response:`, response.data);
  return response.data;
};

// Whiteboard API functions
export const getWhiteboards = async (token?: string) => {
  const data = isWorkspaceWhiteboardGraphqlReadsEnabled()
    ? await getWorkspaceWhiteboardsViaGraphql()
    : (
        await api.get('/api/whiteboards', {
          headers: getAuthHeaders(token)
        })
      ).data;
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
  if (isWorkspaceWhiteboardGraphqlMutationsEnabled()) {
    return createWorkspaceWhiteboardViaGraphql(whiteboardData);
  }
  const response = await api.post('/api/whiteboards', whiteboardData, {
    headers: getAuthHeaders(token)
  });
  rememberWorkspaceWhiteboardRevision(
    Number(response.data.id),
    response.data.updated_at,
  );
  return response.data;
};

export const updateWhiteboard = async (whiteboardId: number, whiteboardData: WhiteboardPayload, token?: string) => {
  logger.log('Sending whiteboard update to backend:', { whiteboardId, whiteboardData });
  if (isWorkspaceWhiteboardGraphqlMutationsEnabled()) {
    return updateWorkspaceWhiteboardViaGraphql(
      whiteboardId,
      whiteboardData,
    );
  }
  const response = await api.put(`/api/whiteboards/${whiteboardId}`, whiteboardData, {
    headers: getAuthHeaders(token)
  });
  rememberWorkspaceWhiteboardRevision(whiteboardId, response.data.updated_at);
  return response.data;
};

export const deleteWhiteboard = async (whiteboardId: number, token?: string) => {
  if (isWorkspaceWhiteboardGraphqlMutationsEnabled()) {
    return deleteWorkspaceWhiteboardViaGraphql(whiteboardId);
  }
  const response = await api.delete(`/api/whiteboards/${whiteboardId}`, {
    headers: getAuthHeaders(token)
  });
  forgetWorkspaceWhiteboardRevision(whiteboardId);
  return response.data;
};

export const updateWhiteboardPosition = async (whiteboardId: number, x: number, y: number, token?: string) => {
  const response = await api.put(`/api/whiteboards/${whiteboardId}/position`, { x, y }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
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
  if (isCategoryGraphqlReadsEnabled()) {
    return getCategoriesViaGraphql();
  }
  const response = await api.get('/api/categories', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createCategory = async (categoryData: CreateCategoryPayload, token?: string): Promise<Category> => {
  if (isCategoryGraphqlMutationsEnabled()) {
    return createCategoryViaGraphql(categoryData);
  }
  const response = await api.post('/api/categories', categoryData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateCategory = async (categoryId: number, categoryData: CreateCategoryPayload, token?: string): Promise<Category> => {
  if (isCategoryGraphqlMutationsEnabled()) {
    return updateCategoryViaGraphql(categoryId, categoryData);
  }
  const response = await api.put(`/api/categories/${categoryId}`, categoryData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteCategory = async (categoryId: number, token?: string) => {
  if (isCategoryGraphqlMutationsEnabled()) {
    return deleteCategoryViaGraphql(categoryId);
  }
  const response = await api.delete(`/api/categories/${categoryId}`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
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
export const addVaultItem = async (vaultId: number, item: VaultItemPayload, token?: string) => {
  void token;
  return addVaultItemViaGraphql(vaultId, item);
};

// Bulk add items to vault (for .env import)
export const bulkAddVaultItems = async (vaultId: number, items: VaultItemPayload[], token?: string) => {
  void token;
  return addVaultItemsViaGraphql(vaultId, items);
};

// Update a vault item
export const updateVaultItem = async (vaultId: number, itemId: number, data: { label?: string; value?: string }, token?: string) => {
  void token;
  return updateVaultItemViaGraphql(vaultId, itemId, data);
};

// Delete a vault item
export const deleteVaultItem = async (vaultId: number, itemId: number, token?: string) => {
  void token;
  return deleteVaultItemViaGraphql(vaultId, itemId);
};

// Reorder vault items
export const reorderVaultItems = async (vaultId: number, itemIds: number[], token?: string) => {
  void token;
  return reorderVaultItemsViaGraphql(vaultId, itemIds);
};

// Enable vault sharing
export const shareVault = async (vaultId: number, token?: string) => {
  const response = await api.post(`/api/vaults/${vaultId}/share`, {}, {
    headers: getAuthHeaders(token)
  });
  return response.data.data;
};

// Disable vault sharing
export const unshareVault = async (vaultId: number, token?: string) => {
  const response = await api.delete(`/api/vaults/${vaultId}/share`, {
    headers: getAuthHeaders(token)
  });
  return response.data.data;
};

// Get shared vault (public)
export const getSharedVault = async (shareToken: string) => {
  const response = await api.get(`/api/shared/vault/${shareToken}`);
  return response.data.data;
};

// Lock vault with master password
export const lockVault = async (vaultId: number, masterPassword: string, currentPassword?: string, token?: string) => {
  const response = await api.post(`/api/vaults/${vaultId}/lock`, {
    master_password: masterPassword,
    current_password: currentPassword
  }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Unlock vault (remove master password)
export const unlockVault = async (vaultId: number, masterPassword: string, token?: string) => {
  const response = await api.post(`/api/vaults/${vaultId}/unlock`, {
    master_password: masterPassword
  }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
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
