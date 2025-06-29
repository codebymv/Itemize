import api from '../lib/api';

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

export interface CreateWhiteboardPayload {
  title?: string;
  category?: string;
  canvas_data?: any;
  canvas_width?: number;
  canvas_height?: number;
  background_color?: string;
  position_x: number;
  position_y: number;
  z_index?: number;
  color_value?: string;
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
  return response.data;
};

export const createList = async (listData: any, token?: string) => {
  // Transform frontend 'type' field to backend 'category' field
  const backendData = {
    ...listData,
    category: listData.type || listData.category || 'General', // Map type to category for backend
  };
  
  // Remove 'type' field to avoid confusion on backend
  delete backendData.type;
  
  const response = await api.post('/api/lists', backendData, {
    headers: getAuthHeaders(token)
  });
  
  // Transform backend response back to frontend format
  const responseData = {
    ...response.data,
    type: response.data.category // Map category back to type for frontend
  };
  
  return responseData;
};

export const updateList = async (listData: any, token?: string) => {
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
  
  // Transform backend response back to frontend format
  const responseData = {
    ...response.data,
    type: response.data.category // Map category back to type for frontend
  };
  
  return responseData;
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

export const updateNote = async (noteId: number, noteData: any, token?: string) => {
  const response = await api.put(`/api/notes/${noteId}`, noteData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const deleteNote = async (noteId: number, token?: string) => {
  const response = await api.delete(`/api/notes/${noteId}`, {
    headers: getAuthHeaders(token)
  });
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

export const updateWhiteboard = async (whiteboardId: number, whiteboardData: any, token?: string) => {
  console.log('Sending whiteboard update to backend:', { whiteboardId, whiteboardData });
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
