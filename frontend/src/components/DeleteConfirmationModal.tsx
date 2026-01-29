import React, { useState } from 'react';
import { Trash2, CheckSquare, StickyNote, Palette, AlertTriangle, GitBranch, KeyRound } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { UI_COLORS, UI_LABELS } from '@/constants/ui';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  itemType: 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
  itemTitle: string;
  itemColor?: string;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemTitle,
  itemColor
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Get the appropriate icon and text based on item type
  const getItemConfig = () => {
    switch (itemType) {
      case 'list':
        return {
          icon: CheckSquare,
          typeLabel: 'List',
          description: 'This will permanently delete the list and all its items. This action cannot be undone.',
          successTitle: 'List deleted',
          successDescription: 'The list has been permanently deleted.',
          errorDescription: 'Failed to delete the list. Please try again.',
          fallbackColor: 'var(--list-color)'
        };
      case 'note':
        return {
          icon: StickyNote,
          typeLabel: 'Note',
          description: 'This will permanently delete the note and all its content. This action cannot be undone.',
          successTitle: 'Note deleted',
          successDescription: 'The note has been permanently deleted.',
          errorDescription: 'Failed to delete the note. Please try again.',
          fallbackColor: 'var(--muted-foreground)'
        };
      case 'whiteboard':
        return {
          icon: Palette,
          typeLabel: 'Whiteboard',
          description: 'This will permanently delete the whiteboard and all its content. This action cannot be undone.',
          successTitle: 'Whiteboard deleted',
          successDescription: 'The whiteboard has been permanently deleted.',
          errorDescription: 'Failed to delete the whiteboard. Please try again.',
          fallbackColor: 'var(--whiteboard-color)'
        };
      case 'wireframe':
        return {
          icon: GitBranch,
          typeLabel: 'Wireframe',
          description: 'This will permanently delete the wireframe and all its diagram data. This action cannot be undone.',
          successTitle: 'Wireframe deleted',
          successDescription: 'The wireframe has been permanently deleted.',
          errorDescription: 'Failed to delete the wireframe. Please try again.',
          fallbackColor: 'var(--wireframe-color)'
        };
      case 'vault':
        return {
          icon: KeyRound,
          typeLabel: 'Vault',
          description: 'This will permanently delete the vault and all its encrypted contents. This action cannot be undone.',
          successTitle: 'Vault deleted',
          successDescription: 'The vault and all its contents have been permanently deleted.',
          errorDescription: 'Failed to delete the vault. Please try again.',
          fallbackColor: UI_COLORS.brandBlue
        };
      default:
        return {
          icon: Trash2,
          typeLabel: 'Item',
          description: 'This will permanently delete this item. This action cannot be undone.',
          successTitle: 'Item deleted',
          successDescription: 'The item has been permanently deleted.',
          errorDescription: 'Failed to delete the item. Please try again.',
          fallbackColor: 'var(--muted-foreground)'
        };
    }
  };

  const { icon: ItemIcon, typeLabel, description, successTitle, successDescription, errorDescription, fallbackColor } = getItemConfig();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onConfirm();
      if (success) {
        toast({
          title: successTitle,
          description: successDescription
        });
        onClose();
      } else {
        toast({
          title: 'Error',
          description: errorDescription,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: errorDescription,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-raleway">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete {typeLabel}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-raleway">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* Item display */}
          <div className="space-y-2">
            <label className="text-sm font-medium font-raleway">
              {typeLabel} to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2 font-raleway">
                <ItemIcon className="h-4 w-4" style={{ color: itemColor || fallbackColor }} />
                {itemTitle || `Untitled ${typeLabel}`}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={onClose}
            disabled={isLoading}
            className="font-raleway"
          >
            {UI_LABELS.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white font-raleway"
          >
            {isLoading ? 'Deleting...' : `${UI_LABELS.delete} ${typeLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmationModal;
