import React, { useState } from 'react';
import { Trash2, CheckSquare, AlertTriangle } from 'lucide-react';
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
import { useToast } from '../hooks/use-toast';

interface DeleteListModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId: string;
  listTitle: string;
  onDelete: (listId: string) => Promise<boolean>;
}

export const DeleteListModal: React.FC<DeleteListModalProps> = ({
  isOpen,
  onClose,
  listId,
  listTitle,
  onDelete
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onDelete(listId);
      if (success) {
        toast({
          title: "List deleted",
          description: "The list has been permanently deleted.",
        });
        onClose();
      } else {
        toast({
          title: "Error deleting list",
          description: "Failed to delete the list. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error deleting list",
        description: "Failed to delete the list. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete List
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            This will permanently delete the list and all its items. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* List display */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
              List to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                <CheckSquare className="h-4 w-4 text-slate-500" />
                {listTitle}
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
            {isLoading ? 'Deleting...' : 'Delete List'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteListModal;
