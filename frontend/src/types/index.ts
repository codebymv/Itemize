// List and item type definitions
export interface ListItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface List {
  id: string;
  title: string;
  type: string; // Represents category
  items: ListItem[];
  createdAt?: Date; // Made optional as it might not always be present or needed by frontend
  color_value?: string | null; // Changed from 'color' to 'color_value', stores hex, can be null or undefined
  position_x?: number; // X coordinate for canvas view
  position_y?: number; // Y coordinate for canvas view
  width?: number; // Width for resizing
  height?: number; // Height for resizing
  share_token?: string; // Share token for public sharing
  is_public?: boolean; // Whether the list is publicly shared
  shared_at?: Date | string; // Timestamp when sharing was enabled
}

// Category type for API responses
export interface Category {
  name: string;
  listCount?: number;
  noteCount?: number;
  totalCount?: number;
  color_value?: string;
  id?: number;
  created_at?: string;
  updated_at?: string;
}

// Props for ListCard component
export interface ListCardProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => Promise<boolean>;
  onShare: (listId: string) => void;
  existingCategories: Category[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

export interface Note {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category?: string; // Optional category field, defaults to "General" (null)
  color_value: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  created_at: string;
  updated_at: string;
  // Sharing fields
  share_token?: string;
  is_public?: boolean;
  shared_at?: string;
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

export interface Whiteboard {
  id: number;
  user_id: number;
  title: string;
  category?: string; // Optional category field, defaults to "General" (null)
  canvas_data: CanvasData | string; // Raw library data - react-sketch-canvas format
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  position_x: number;
  position_y: number;
  z_index: number;
  color_value: string; // Border/theme color
  created_at: string;
  updated_at: string;
  // Sharing fields
  share_token?: string;
  is_public?: boolean;
  shared_at?: string;
}

// Props for NoteCard component
export interface NoteCardProps {
  note: Note;
  onUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
  onShare: (noteId: number) => void;
  existingCategories: Category[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

// Props for WhiteboardCard component  
export interface WhiteboardCardProps {
  whiteboard: Whiteboard;
  onUpdate: (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Whiteboard | null>;
  onDelete: (whiteboardId: number) => Promise<boolean>;
  onShare: (whiteboardId: number) => void;
  existingCategories: Category[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

// React Flow node and edge types for wireframes
export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label: string; [key: string]: any };
  style?: Record<string, any>;
  width?: number;
  height?: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface FlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: FlowViewport;
}

export interface Wireframe {
  id: number;
  user_id: number;
  title: string;
  category?: string;
  flow_data: FlowData | string;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  z_index: number;
  color_value: string;
  created_at: string;
  updated_at: string;
  // Sharing fields
  share_token?: string;
  is_public?: boolean;
  shared_at?: string;
}

// Props for WireframeCard component
export interface WireframeCardProps {
  wireframe: Wireframe;
  onUpdate: (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Wireframe | null>;
  onDelete: (wireframeId: number) => Promise<boolean>;
  onShare: (wireframeId: number) => void;
  existingCategories: Category[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
}

// ======================
// CRM Types
// ======================

// Organization for multi-tenancy
export interface Organization {
  id: number;
  name: string;
  slug: string;
  settings: Record<string, any>;
  logo_url?: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
  updated_at: string;
}

// Organization member
export interface OrganizationMember {
  id: number;
  organization_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  invited_at: string;
  joined_at?: string;
  invited_by?: number;
  user_name?: string;
  email?: string;
}

// Contact address structure
export interface ContactAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// Contact - core CRM entity
export interface Contact {
  id: number;
  organization_id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  address: ContactAddress;
  source: 'manual' | 'import' | 'form' | 'integration' | 'api';
  status: 'active' | 'inactive' | 'archived';
  custom_fields: Record<string, any>;
  tags: string[];
  assigned_to?: number;
  assigned_to_name?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

// Contact activity for timeline
export interface ContactActivity {
  id: number;
  contact_id: number;
  user_id?: number;
  user_name?: string;
  user_email?: string;
  type: 'note' | 'email' | 'call' | 'task' | 'meeting' | 'status_change' | 'deal_update' | 'system';
  title?: string;
  content: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
}

// CRM Tag
export interface Tag {
  id: number;
  organization_id: number;
  name: string;
  color: string;
  created_at: string;
}

// Pipeline stage
export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
}

// Pipeline for deal management
export interface Pipeline {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  stages: PipelineStage[];
  is_default: boolean;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

// Deal/opportunity
export interface Deal {
  id: number;
  organization_id: number;
  pipeline_id: number;
  contact_id?: number;
  stage_id: string;
  title: string;
  value: number;
  currency: string;
  probability: number;
  expected_close_date?: string;
  assigned_to?: number;
  assigned_to_name?: string;
  created_by?: number;
  won_at?: string;
  lost_at?: string;
  lost_reason?: string;
  custom_fields: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
  // Joined data
  contact?: Contact;
  pipeline?: Pipeline;
}

// Task
export interface Task {
  id: number;
  organization_id: number;
  contact_id?: number;
  deal_id?: number;
  assigned_to?: number;
  assigned_to_name?: string;
  created_by?: number;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  reminder_at?: string;
  created_at: string;
  updated_at: string;
}

// Pagination response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Contacts API response
export interface ContactsResponse {
  contacts: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ======================
// Calendar & Booking Types
// ======================

// Availability window for recurring schedule
export interface AvailabilityWindow {
  id?: number;
  calendar_id?: number;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string; // HH:MM format
  end_time: string;
  is_active?: boolean;
}

// Date override (blocked dates or custom hours)
export interface CalendarDateOverride {
  id: number;
  calendar_id: number;
  override_date: string;
  is_available: boolean;
  start_time?: string;
  end_time?: string;
  reason?: string;
  created_at: string;
}

// Calendar for appointment scheduling
export interface Calendar {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  slug: string;
  timezone: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_hours: number;
  max_future_days: number;
  assigned_to?: number;
  assigned_to_name?: string;
  assignment_mode: 'specific' | 'round_robin';
  confirmation_email: boolean;
  reminder_email: boolean;
  reminder_hours: number;
  color: string;
  is_active: boolean;
  created_by?: number;
  created_at: string;
  updated_at: string;
  // Joined data
  availability_windows?: AvailabilityWindow[];
  date_overrides?: CalendarDateOverride[];
  upcoming_bookings?: number;
}

// Booking/Appointment
export interface Booking {
  id: number;
  organization_id: number;
  calendar_id: number;
  contact_id?: number;
  title?: string;
  start_time: string;
  end_time: string;
  timezone: string;
  attendee_name?: string;
  attendee_email?: string;
  attendee_phone?: string;
  assigned_to?: number;
  assigned_to_name?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  cancelled_at?: string;
  cancellation_reason?: string;
  cancellation_token?: string;
  notes?: string;
  internal_notes?: string;
  reminder_sent_at?: string;
  custom_fields: Record<string, any>;
  source: 'booking_page' | 'manual' | 'api' | 'import';
  created_at: string;
  updated_at: string;
  // Joined data
  calendar_name?: string;
  calendar_color?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
}

// Calendars API response
export interface CalendarsResponse {
  calendars: Calendar[];
}

// Bookings API response
export interface BookingsResponse {
  bookings: Booking[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Public calendar info for booking page
export interface PublicCalendarInfo {
  id: number;
  name: string;
  description?: string;
  slug: string;
  timezone: string;
  duration_minutes: number;
  min_notice_hours: number;
  max_future_days: number;
  color: string;
  is_active: boolean;
  organization_name: string;
  availability: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
  }>;
}

// Available slots response
export interface AvailableSlotsResponse {
  calendar: {
    id: number;
    duration_minutes: number;
    buffer_before: number;
    buffer_after: number;
    min_notice_hours: number;
    timezone: string;
  };
  availability: AvailabilityWindow[];
  overrides: CalendarDateOverride[];
  booked_slots: Array<{ start_time: string; end_time: string }>;
}

// ======================
// Forms & Surveys Types
// ======================

export type FormFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'number' | 'rating' | 'nps';

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormField {
  id?: number;
  form_id?: number;
  field_type: FormFieldType;
  label: string;
  placeholder?: string;
  help_text?: string;
  is_required: boolean;
  validation?: Record<string, any>;
  options?: FormFieldOption[];
  field_order: number;
  width: 'full' | 'half';
  conditions?: any[];
  map_to_contact_field?: string;
}

export interface Form {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  slug: string;
  type: 'form' | 'survey' | 'quiz';
  status: 'draft' | 'published' | 'archived';
  submit_button_text: string;
  success_message: string;
  redirect_url?: string;
  notify_on_submit: boolean;
  notification_emails: string[];
  theme: { primaryColor: string;[key: string]: any };
  create_contact: boolean;
  contact_tags: string[];
  created_by?: number;
  created_at: string;
  updated_at: string;
  fields?: FormField[];
  submission_count?: number;
  field_count?: number;
}

export interface FormSubmission {
  id: number;
  form_id: number;
  organization_id: number;
  contact_id?: number;
  data: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  referrer?: string;
  score?: number;
  created_at: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
}

export interface FormsResponse {
  forms: Form[];
}

export interface FormSubmissionsResponse {
  submissions: FormSubmission[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ======================
// Inbox/Conversations Types
// ======================

export interface Conversation {
  id: number;
  organization_id: number;
  contact_id?: number;
  assigned_to?: number;
  assigned_to_name?: string;
  status: 'open' | 'closed' | 'snoozed';
  snoozed_until?: string;
  channel: string;
  subject?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
  // Joined data
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_phone?: string;
  messages?: Message[];
}

export interface Message {
  id: number;
  conversation_id: number;
  organization_id: number;
  sender_type: 'user' | 'contact' | 'system';
  sender_user_id?: number;
  sender_contact_id?: number;
  sender_user_name?: string;
  sender_contact_first_name?: string;
  sender_contact_last_name?: string;
  channel: string;
  content: string;
  content_html?: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
