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
}

// Props for ListCard component
export interface ListCardProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
  existingCategories: string[];
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
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
