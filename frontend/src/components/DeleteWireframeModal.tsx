import React, { useState } from 'react';
import { GitBranch, AlertTriangle } from 'lucide-react';
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

interface DeleteWireframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  wireframeId: string;
  wireframeTitle: string;
  wireframeColor?: string;
  onDelete: (wireframeId: string) => Promise<boolean>;
}

export const DeleteWireframeModal: React.FC<DeleteWireframeModalProps> = ({
  isOpen,
  onClose,
  wireframeId,
  wireframeTitle,
  wireframeColor,
  onDelete
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onDelete(wireframeId);
      if (success) {
        toast({
          title: "Wireframe deleted",
          description: "The wireframe has been permanently deleted.",
        });
        onClose();
      } else {
        toast({
          title: "Error deleting wireframe",
          description: "Failed to delete the wireframe. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error deleting wireframe",
        description: "Failed to delete the wireframe. Please try again.",
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
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete Wireframe
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the wireframe and all its diagram data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* Wireframe display */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Wireframe to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2">
                <GitBranch className="h-4 w-4" style={{ color: wireframeColor || 'var(--wireframe-color)' }} />
                {wireframeTitle}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? 'Deleting...' : 'Delete Wireframe'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteWireframeModal;
