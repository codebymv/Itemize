import React, { useState } from 'react';
import { Trash2, StickyNote, AlertTriangle } from 'lucide-react';
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

interface DeleteNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
  noteColor?: string;
  onDelete: (noteId: string) => Promise<boolean>;
}

export const DeleteNoteModal: React.FC<DeleteNoteModalProps> = ({
  isOpen,
  onClose,
  noteId,
  noteTitle,
  onDelete
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onDelete(noteId);
      if (success) {
        toast({
          title: "Note deleted",
          description: "The note has been permanently deleted.",
        });
        onClose();
      } else {
        toast({
          title: "Error deleting note",
          description: "Failed to delete the note. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error deleting note",
        description: "Failed to delete the note. Please try again.",
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
            Delete Note
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            This will permanently delete the note and all its content. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* Note display */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
              Note to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                <StickyNote className="h-4 w-4 text-slate-500" />
                <StickyNote className="h-4 w-4" style={{ color: noteColor || 'var(--note-color)' }} />
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
            {isLoading ? 'Deleting...' : 'Delete Note'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteNoteModal;
