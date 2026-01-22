/**
 * MSW Request Handlers
 * 
 * Define mock API handlers for testing.
 */

import { http, HttpResponse } from 'msw';

// Base URL for API requests
const API_BASE = 'http://localhost:3001/api';

// Sample data
const mockLists = [
  {
    id: 1,
    user_id: 1,
    title: 'Test List',
    type: 'General',
    color_value: '#3B82F6',
    position_x: 100,
    position_y: 100,
    width: 320,
    z_index: 1,
    items: [
      { id: '1', text: 'Item 1', checked: false },
      { id: '2', text: 'Item 2', checked: true },
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const mockNotes = [
  {
    id: 1,
    user_id: 1,
    title: 'Test Note',
    content: 'This is test content',
    category: 'General',
    color_value: '#3B82F6',
    position_x: 200,
    position_y: 200,
    width: 570,
    height: 400,
    z_index: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const mockWhiteboards = [
  {
    id: 1,
    user_id: 1,
    title: 'Test Whiteboard',
    category: 'General',
    canvas_data: [],
    canvas_width: 750,
    canvas_height: 620,
    background_color: '#ffffff',
    position_x: 300,
    position_y: 300,
    z_index: 1,
    color_value: '#3B82F6',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const mockCategories = [
  { id: 1, user_id: 1, name: 'General', color_value: '#3B82F6' },
  { id: 2, user_id: 1, name: 'Work', color_value: '#10B981' },
  { id: 3, user_id: 1, name: 'Personal', color_value: '#F59E0B' },
];

export const handlers = [
  // Lists
  http.get(`${API_BASE}/lists`, () => {
    return HttpResponse.json(mockLists);
  }),

  http.post(`${API_BASE}/lists`, async ({ request }) => {
    const body = await request.json();
    const newList = {
      ...body,
      id: Date.now(),
      user_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newList, { status: 201 });
  }),

  http.put(`${API_BASE}/lists/:id`, async ({ request, params }) => {
    const body = await request.json();
    const updated = {
      ...mockLists[0],
      ...body,
      id: Number(params.id),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(updated);
  }),

  http.delete(`${API_BASE}/lists/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Notes
  http.get(`${API_BASE}/notes`, () => {
    return HttpResponse.json(mockNotes);
  }),

  http.post(`${API_BASE}/notes`, async ({ request }) => {
    const body = await request.json();
    const newNote = {
      ...body,
      id: Date.now(),
      user_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newNote, { status: 201 });
  }),

  http.put(`${API_BASE}/notes/:id`, async ({ request, params }) => {
    const body = await request.json();
    const updated = {
      ...mockNotes[0],
      ...body,
      id: Number(params.id),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(updated);
  }),

  http.delete(`${API_BASE}/notes/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Whiteboards
  http.get(`${API_BASE}/whiteboards`, () => {
    return HttpResponse.json(mockWhiteboards);
  }),

  http.post(`${API_BASE}/whiteboards`, async ({ request }) => {
    const body = await request.json();
    const newWhiteboard = {
      ...body,
      id: Date.now(),
      user_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(newWhiteboard, { status: 201 });
  }),

  http.put(`${API_BASE}/whiteboards/:id`, async ({ request, params }) => {
    const body = await request.json();
    const updated = {
      ...mockWhiteboards[0],
      ...body,
      id: Number(params.id),
      updated_at: new Date().toISOString(),
    };
    return HttpResponse.json(updated);
  }),

  http.delete(`${API_BASE}/whiteboards/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Categories
  http.get(`${API_BASE}/categories`, () => {
    return HttpResponse.json(mockCategories);
  }),

  http.post(`${API_BASE}/categories`, async ({ request }) => {
    const body = await request.json();
    const newCategory = {
      ...body,
      id: Date.now(),
      user_id: 1,
    };
    return HttpResponse.json(newCategory, { status: 201 });
  }),

  http.put(`${API_BASE}/categories/:id`, async ({ request, params }) => {
    const body = await request.json();
    const updated = {
      ...mockCategories[0],
      ...body,
      id: Number(params.id),
    };
    return HttpResponse.json(updated);
  }),

  // Auth
  http.get(`${API_BASE}/auth/me`, () => {
    return HttpResponse.json({
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
    });
  }),
];

export { mockLists, mockNotes, mockWhiteboards, mockCategories };
