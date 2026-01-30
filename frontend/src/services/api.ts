import api, { type RetryConfig } from '../lib/api';
import { logger } from '../lib/logger';
import { MIN_LIST_WIDTH } from '../constants/dimensions';

// Types for API requests
export interface CreateNotePayload {
  title?: string;
  content?: string;
  color_value: string;
  position_x: number;
  position_y: number;
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
  position_x: number;
  position_y: number;
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
interface BackendListResponse {
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
const getAuthHeaders = (token?: string) => {
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// List API functions
export const fetchCanvasLists = async (token?: string) => {
  const response = await api.get('/api/canvas/lists', {
    headers: getAuthHeaders(token)
  });
  
  // Transform backend response to match frontend List interface
  const transformedLists = response.data.map((listFromBackend: BackendListResponse) => ({
    id: listFromBackend.id,
    title: listFromBackend.title,
    type: listFromBackend.category || listFromBackend.type || 'General',
    items: listFromBackend.items || [],
    createdAt: listFromBackend.created_at ? new Date(listFromBackend.created_at) : undefined,
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

export const createList = async (listData: ListPayload, token?: string) => {
  try {
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
  const response = await api.put(
    '/api/canvas/positions',
    { updates },
    {
      headers: getAuthHeaders(token),
      retryOn429: true
    } as RetryConfig
  );
  return response.data;
};

// Note API functions
export const getNotes = async (token?: string) => {
  const response = await api.get('/api/notes', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createNote = async (noteData: CreateNotePayload, token?: string) => {
  const response = await api.post('/api/notes', noteData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateNote = async (noteId: number, noteData: NotePayload, token?: string) => {
  const response = await api.put(`/api/notes/${noteId}`, noteData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Granular note update functions for real-time updates
export const updateNoteContent = async (noteId: number, content: string, token?: string) => {
  const response = await api.put(`/api/notes/${noteId}/content`, { content }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateNoteTitle = async (noteId: number, title: string, token?: string) => {
  const response = await api.put(`/api/notes/${noteId}/title`, { title }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateNoteCategory = async (noteId: number, category: string, token?: string) => {
  const response = await api.put(`/api/notes/${noteId}/category`, { category }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteNote = async (noteId: number, token?: string) => {
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
  const response = await api.get('/api/whiteboards', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createWhiteboard = async (whiteboardData: CreateWhiteboardPayload, token?: string) => {
  const response = await api.post('/api/whiteboards', whiteboardData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateWhiteboard = async (whiteboardId: number, whiteboardData: WhiteboardPayload, token?: string) => {
  logger.log('Sending whiteboard update to backend:', { whiteboardId, whiteboardData });
  const response = await api.put(`/api/whiteboards/${whiteboardId}`, whiteboardData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteWhiteboard = async (whiteboardId: number, token?: string) => {
  const response = await api.delete(`/api/whiteboards/${whiteboardId}`, {
    headers: getAuthHeaders(token)
  });
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
    data: { label: string; [key: string]: any };
    style?: Record<string, any>;
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
  position_x: number;
  position_y: number;
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
  z_index?: number;
  color_value?: string;
}

export const getWireframes = async (token?: string) => {
  const response = await api.get('/api/wireframes', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createWireframe = async (wireframeData: CreateWireframePayload, token?: string) => {
  const response = await api.post('/api/wireframes', wireframeData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateWireframe = async (wireframeId: number, wireframeData: WireframePayload, token?: string) => {
  logger.log('Sending wireframe update to backend:', { wireframeId, wireframeData });
  const response = await api.put(`/api/wireframes/${wireframeId}`, wireframeData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteWireframe = async (wireframeId: number, token?: string) => {
  const response = await api.delete(`/api/wireframes/${wireframeId}`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateWireframePosition = async (wireframeId: number, x: number, y: number, token?: string) => {
  const response = await api.put(`/api/wireframes/${wireframeId}/position`, { x, y }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Category API functions
export const getCategories = async (token?: string): Promise<Category[]> => {
  const response = await api.get('/api/categories', {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const createCategory = async (categoryData: CreateCategoryPayload, token?: string): Promise<Category> => {
  const response = await api.post('/api/categories', categoryData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateCategory = async (categoryId: number, categoryData: CreateCategoryPayload, token?: string): Promise<Category> => {
  const response = await api.put(`/api/categories/${categoryId}`, categoryData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteCategory = async (categoryId: number, token?: string) => {
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
  position_x: number;
  position_y: number;
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
  const response = await api.get('/api/vaults', {
    headers: getAuthHeaders(token)
  });
  const payload = response.data;
  if (payload?.data) {
    return { vaults: payload.data, pagination: payload.pagination };
  }
  if (payload?.vaults) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return { vaults: payload };
  }
  return payload;
};

// Get a single vault with decrypted items
export const getVault = async (vaultId: number, masterPassword?: string, token?: string) => {
  const params = masterPassword ? { master_password: masterPassword } : {};
  const response = await api.get(`/api/vaults/${vaultId}`, {
    headers: getAuthHeaders(token),
    params
  });
  return response.data;
};

// Create a new vault
export const createVault = async (vaultData: CreateVaultPayload, token?: string) => {
  const response = await api.post('/api/vaults', vaultData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Update a vault
export const updateVault = async (vaultId: number, vaultData: VaultPayload, token?: string) => {
  const response = await api.put(`/api/vaults/${vaultId}`, vaultData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Update vault position
export const updateVaultPosition = async (vaultId: number, x: number, y: number, token?: string) => {
  const response = await api.put(`/api/vaults/${vaultId}/position`, { position_x: x, position_y: y }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Delete a vault
export const deleteVault = async (vaultId: number, token?: string) => {
  const response = await api.delete(`/api/vaults/${vaultId}`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Add item to vault
export const addVaultItem = async (vaultId: number, item: VaultItemPayload, token?: string) => {
  const response = await api.post(`/api/vaults/${vaultId}/items`, item, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Bulk add items to vault (for .env import)
export const bulkAddVaultItems = async (vaultId: number, items: VaultItemPayload[], token?: string) => {
  const response = await api.post(`/api/vaults/${vaultId}/items/bulk`, { items }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Update a vault item
export const updateVaultItem = async (vaultId: number, itemId: number, data: { label?: string; value?: string }, token?: string) => {
  const response = await api.put(`/api/vaults/${vaultId}/items/${itemId}`, data, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Delete a vault item
export const deleteVaultItem = async (vaultId: number, itemId: number, token?: string) => {
  const response = await api.delete(`/api/vaults/${vaultId}/items/${itemId}`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Reorder vault items
export const reorderVaultItems = async (vaultId: number, itemIds: number[], token?: string) => {
  const response = await api.put(`/api/vaults/${vaultId}/items/reorder`, { item_ids: itemIds }, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Enable vault sharing
export const shareVault = async (vaultId: number, token?: string) => {
  const response = await api.post(`/api/vaults/${vaultId}/share`, {}, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Disable vault sharing
export const unshareVault = async (vaultId: number, token?: string) => {
  const response = await api.delete(`/api/vaults/${vaultId}/share`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Get shared vault (public)
export const getSharedVault = async (shareToken: string) => {
  const response = await api.get(`/api/shared/vault/${shareToken}`);
  return response.data;
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
export const shareList = async (listId: string, token?: string) => {
  const response = await api.post(`/api/lists/${listId}/share`, {}, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Unshare list
export const unshareList = async (listId: string, token?: string) => {
  const response = await api.delete(`/api/lists/${listId}/share`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Share note
export const shareNote = async (noteId: number, token?: string) => {
  const response = await api.post(`/api/notes/${noteId}/share`, {}, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Unshare note
export const unshareNote = async (noteId: number, token?: string) => {
  const response = await api.delete(`/api/notes/${noteId}/share`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Share whiteboard
export const shareWhiteboard = async (whiteboardId: number, token?: string) => {
  const response = await api.post(`/api/whiteboards/${whiteboardId}/share`, {}, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

// Unshare whiteboard
export const unshareWhiteboard = async (whiteboardId: number, token?: string) => {
  const response = await api.delete(`/api/whiteboards/${whiteboardId}/share`, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};
