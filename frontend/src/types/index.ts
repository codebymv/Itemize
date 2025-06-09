// List and item type definitions
export interface ListItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface List {
  id: string;
  title: string;
  type: string;
  items: ListItem[];
  createdAt: Date;
  color: string;
}

// Props for ListCard component
export interface ListCardProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
  existingCategories: string[];
}
