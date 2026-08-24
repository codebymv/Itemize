import React from 'react';
import { Trash2, Edit3, Check, X, GripVertical } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListItem } from '@/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

const ListItemRow: React.FC<ListItemRowProps> = ({
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

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isEditing, // Disable dragging when editing
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className="flex items-center py-1 group"
      data-sortable-item
    >
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
            aria-label={`Save changes to ${item.text}`}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditingItemText('')}
            className="h-8 w-8 p-0"
            aria-label={`Cancel editing ${item.text}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          {/* Drag Handle - appears on hover */}
          <div 
            {...attributes}
            {...listeners}
            className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity cursor-grab active:cursor-grabbing mr-2 p-1"
            data-sortable-handle
            aria-label={`Reorder ${item.text}`}
          >
            <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-300" data-lucide="grip-vertical" />
          </div>
          
          <button
            type="button"
            role="checkbox"
            aria-checked={item.completed}
            aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.text}`}
            className="flex items-center flex-grow min-w-0 cursor-pointer text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => toggleItemCompleted(item.id)}
          >
            <div 
              style={item.completed ? { backgroundColor: 'var(--list-color)', borderColor: 'var(--list-color)' } : {}}
              className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border mr-2 flex items-center justify-center flex-shrink-0 ${
              item.completed ? '' : 'border-gray-300 hover:border-[var(--list-color)]'
            }`}>
              {item.completed && <Check className="h-3 w-3 text-white" />}
            </div>
            <span className={`${item.completed ? 'line-through text-gray-400 dark:text-gray-300' : ''}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
              {item.text}
            </span>
          </button>
          <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startEditingItem(item)}
              className="h-8 w-8 p-0"
              aria-label={`Edit ${item.text}`}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeItem(item.id)}
              className="h-8 w-8 p-0 text-red-600"
              aria-label={`Delete ${item.text}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export { ListItemRow };
