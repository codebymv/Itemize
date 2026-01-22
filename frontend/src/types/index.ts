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

export interface Whiteboard {
  id: number;
  user_id: number;
  title: string;
  category?: string; // Optional category field, defaults to "General" (null)
  canvas_data: any; // Raw library data - react-sketch-canvas format
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
