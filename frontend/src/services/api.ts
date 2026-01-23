import api from '../lib/api';
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
