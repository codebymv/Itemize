import React from 'react';
import { Trash2, Edit3, Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListItem } from '@/types';

interface ListItemRowProps {
  item: ListItem;
  editingItemId: string | null;
  editingItemText: string;
  setEditingItemText: (value: string) => void;
  toggleItemCompleted: (itemId: string) => void;
  startEditingItem: (item: ListItem) => void;
  handleEditItem: () => void;
  removeItem: (itemId: string) => void;
}

export const ListItemRow: React.FC<ListItemRowProps> = ({
  item,
  editingItemId,
  editingItemText,
  setEditingItemText,
  toggleItemCompleted,
  startEditingItem,
  handleEditItem,
  removeItem
}) => {
  const isEditing = editingItemId === item.id;

  return (
    <div className="flex items-center py-1 group">
      {isEditing ? (
        <div className="flex items-center gap-1 w-full">
          <Input
            value={editingItemText}
            onChange={(e) => setEditingItemText(e.target.value)}
            className="h-8 flex-grow"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleEditItem();
              }
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleEditItem}
            className="h-8 w-8 p-0"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditingItemText('')}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div 
            className="flex items-center flex-grow cursor-pointer"
            onClick={() => toggleItemCompleted(item.id)}
          >
            <div className={`w-4 h-4 rounded-sm border mr-2 flex items-center justify-center ${
              item.completed ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'
            }`}>
              {item.completed && <Check className="h-3 w-3 text-white" />}
            </div>
            <span className={`${item.completed ? 'line-through text-gray-400' : ''}`}>
              {item.text}
            </span>
          </div>
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startEditingItem(item)}
              className="h-8 w-8 p-0"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeItem(item.id)}
              className="h-8 w-8 p-0 text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
