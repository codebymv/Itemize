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
}

// Props for ListCard component
export interface ListCardProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
  existingCategories: string[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
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
}

// Props for WhiteboardCard component  
export interface WhiteboardCardProps {
  whiteboard: Whiteboard;
  onUpdate: (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Whiteboard | null>;
  onDelete: (whiteboardId: number) => Promise<boolean>;
  existingCategories: string[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}
