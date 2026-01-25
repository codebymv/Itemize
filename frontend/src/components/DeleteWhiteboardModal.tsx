import React, { useState } from 'react';
import { Trash2, Palette, AlertTriangle } from 'lucide-react';
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

interface DeleteWhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  whiteboardId: string;
  whiteboardTitle: string;
  whiteboardColor?: string;
  onDelete: (whiteboardId: string) => Promise<boolean>;
}

export const DeleteWhiteboardModal: React.FC<DeleteWhiteboardModalProps> = ({
  isOpen,
  onClose,
  whiteboardId,
  whiteboardTitle,
  whiteboardColor,
  onDelete
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onDelete(whiteboardId);
      if (success) {
        toast({
          title: "Whiteboard deleted",
          description: "The whiteboard has been permanently deleted.",
        });
        onClose();
      } else {
        toast({
          title: "Error",
          description: "Failed to delete whiteboard",
          description: "Failed to delete the whiteboard. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
          description: "Failed to delete whiteboard",
        description: "Failed to delete the whiteboard. Please try again.",
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
            Delete Whiteboard
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            This will permanently delete the whiteboard and all its content. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* Whiteboard display */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
              Whiteboard to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                <Palette className="h-4 w-4" style={{ color: whiteboardColor || 'var(--whiteboard-color)' }} />
                {whiteboardTitle}
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
            {isLoading ? 'Deleting...' : 'Delete Whiteboard'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteWhiteboardModal;
