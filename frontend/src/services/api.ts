// API functions for Itemize app

import { List, ListItem } from '@/types';
import api from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper function for API requests
const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('itemize_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token && { Authorization: `Bearer ${token}` })
  };
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'An error occurred' }));
    throw new Error(error.error || 'An error occurred');
  }
  
  return response.json();
};

// Authentication APIs
export const loginUser = async (email: string, password: string) => {
  return fetchWithAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
};

export const registerUser = async (email: string, password: string) => {
  return fetchWithAuth('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
};

export const requestPasswordReset = async (email: string) => {
  return fetchWithAuth('/auth/request-reset', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
};

// Lists APIs
export const fetchLists = async (): Promise<List[]> => {
  return fetchWithAuth('/api/lists');
};

export const fetchCanvasLists = async (): Promise<List[]> => {
  return fetchWithAuth('/api/canvas/lists');
};

export const createList = async (list: Omit<List, 'id'>, position?: { x: number, y: number }): Promise<List> => {
  const listData = { ...list };
  
  // If position is provided, add it to the list data
  if (position) {
    listData.position_x = position.x;
    listData.position_y = position.y;
  }
  
  return fetchWithAuth('/api/lists', {
    method: 'POST',
    body: JSON.stringify(listData)
  });
};

export const updateList = async (list: List): Promise<List> => {
  return fetchWithAuth(`/api/lists/${list.id}`, {
    method: 'PUT',
    body: JSON.stringify(list)
  });
};

export const updateListPosition = async (listId: string, x: number, y: number): Promise<List> => {
  return fetchWithAuth(`/api/lists/${listId}/position`, {
    method: 'PUT',
    body: JSON.stringify({ x, y })
  });
};

export const deleteList = async (listId: string): Promise<void> => {
  return fetchWithAuth(`/api/lists/${listId}`, {
    method: 'DELETE'
  });
};

// AI suggestion APIs
export const getSuggestions = async (listId: string): Promise<string[]> => {
  return fetchWithAuth(`/api/lists/${listId}/suggestions`);
};

// Export all API functions
export default {
  loginUser,
  registerUser,
  requestPasswordReset,
  fetchLists,
  fetchCanvasLists,
  createList,
  updateList,
  updateListPosition,
  deleteList,
  getSuggestions
};
