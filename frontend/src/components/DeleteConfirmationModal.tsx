import React from 'react';
import { Trash2, CheckSquare, StickyNote, Palette, AlertTriangle } from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from './ui/alert-dialog';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemType: 'list' | 'note' | 'whiteboard';
  itemTitle: string;
  isLoading?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemTitle,
  isLoading = false
}) => {
  // Get the appropriate icon and text based on item type
  const getItemConfig = () => {
    switch (itemType) {
      case 'list':
        return {
          icon: CheckSquare,
          typeLabel: 'List',
          description: 'This will permanently delete the list and all its items. This action cannot be undone.'
        };
      case 'note':
        return {
          icon: StickyNote,
          typeLabel: 'Note',
          description: 'This will permanently delete the note and all its content. This action cannot be undone.'
        };
      case 'whiteboard':
        return {
          icon: Palette,
          typeLabel: 'Whiteboard',
          description: 'This will permanently delete the whiteboard and all its content. This action cannot be undone.'
        };
      default:
        return {
          icon: Trash2,
          typeLabel: 'Item',
          description: 'This will permanently delete this item. This action cannot be undone.'
        };
    }
  };

  const { icon: ItemIcon, typeLabel, description } = getItemConfig();

  const handleConfirm = () => {
    onConfirm();
    // Note: onClose will be called by parent after successful deletion
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete {typeLabel}
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* Item display */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
              {typeLabel} to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                <ItemIcon className="h-4 w-4 text-slate-500" />
                {itemTitle}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={onClose}
            disabled={isLoading}
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
            style={{ fontFamily: '"Raleway", sans-serif' }}
          >
            {isLoading ? 'Deleting...' : `Delete ${typeLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmationModal;
