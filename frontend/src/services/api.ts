import api from '../lib/api';

// Types for API requests
export interface CreateNotePayload {
  content: string;
  color_value: string;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  z_index?: number;
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
  const response = await api.post('/api/lists', listData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
};

export const updateList = async (listData: any, token?: string) => {
  const response = await api.put(`/api/lists/${listData.id}`, listData, {
    headers: getAuthHeaders(token)
  });
  return response.data;
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
