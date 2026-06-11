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

const mockChatMessages = [
  {
    id: 1,
    session_id: 123,
    organization_id: 1,
    sender_type: 'visitor',
    content: 'Talk to Sales',
    content_type: 'text',
    is_read: false,
    created_at: '2024-01-01T00:00:00Z',
  },
];

export const handlers = [
  // Lists
  http.get(`${API_BASE}/lists`, () => {
    return HttpResponse.json(mockLists);
  }),

  http.post(`${API_BASE}/lists`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
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
    const body = (await request.json()) as Record<string, unknown>;
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
    const body = (await request.json()) as Record<string, unknown>;
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
    const body = (await request.json()) as Record<string, unknown>;
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
    const body = (await request.json()) as Record<string, unknown>;
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
    const body = (await request.json()) as Record<string, unknown>;
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
    const body = (await request.json()) as Record<string, unknown>;
    const newCategory = {
      ...body,
      id: Date.now(),
      user_id: 1,
    };
    return HttpResponse.json(newCategory, { status: 201 });
  }),

  http.put(`${API_BASE}/categories/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const updated = {
      ...mockCategories[0],
      ...body,
      id: Number(params.id),
    };
    return HttpResponse.json(updated);
  }),

  // Public chat widget
  http.get(`${API_BASE}/chat-widget/public/config/:widgetKey`, ({ params }) => {
    return HttpResponse.json({
      widget_key: params.widgetKey,
      name: 'Itemize',
      primary_color: '#2563eb',
      text_color: '#ffffff',
      position: 'bottom-right',
      icon_style: 'chat',
      welcome_title: 'Hi there.',
      welcome_message: "Tell us what you're trying to organize or automate. We'll route this to the right person.",
      placeholder_text: 'Type your message...',
      require_email: true,
      require_name: true,
      require_phone: false,
      custom_fields: [],
      is_active: true,
      is_online: true,
      auto_open_delay: 0,
      show_branding: false,
      offline_message: 'We are currently offline.',
    });
  }),

  http.post(`${API_BASE}/chat-widget/public/session`, async () => {
    return HttpResponse.json({
      session_token: 'test-session-token',
      session_id: 123,
      resumed: false,
    }, { status: 201 });
  }),

  http.get(`${API_BASE}/chat-widget/public/messages/:sessionToken`, () => {
    return HttpResponse.json(mockChatMessages);
  }),

  http.post(`${API_BASE}/chat-widget/public/messages`, async ({ request }) => {
    const body = (await request.json()) as { content?: string };
    return HttpResponse.json({
      ...mockChatMessages[0],
      id: Date.now(),
      content: body.content || '',
      created_at: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.post(`${API_BASE}/chat-widget/public/end-session`, () => {
    return HttpResponse.json({ success: true });
  }),

  // Public marketing assistant
  http.get(`${API_BASE}/marketing-chat/token`, () => {
    return HttpResponse.json({ success: true, data: { token: 'test-ask-token' } });
  }),

  http.post(`${API_BASE}/marketing-chat/ask`, async () => {
    return HttpResponse.json({
      success: true,
      data: {
        reply: 'Itemize helps teams organize CRM, bookings, automations, and workspace notes.',
      },
    });
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
