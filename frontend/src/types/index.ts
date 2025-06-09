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
}

// Props for ListCard component
export interface ListCardProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
  existingCategories: string[];
}
