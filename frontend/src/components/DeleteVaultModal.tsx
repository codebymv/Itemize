import React, { useState } from 'react';
import { KeyRound, AlertTriangle } from 'lucide-react';
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

interface DeleteVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultId: string;
  vaultTitle: string;
  vaultColor?: string;
  onConfirm: (vaultId: string) => Promise<boolean>;
}

export const DeleteVaultModal: React.FC<DeleteVaultModalProps> = ({
  isOpen,
  onClose,
  vaultId,
  vaultTitle,
  vaultColor,
  onConfirm
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const success = await onConfirm(vaultId);
      if (success) {
        toast({
          title: "Vault deleted",
          description: "The vault and all its contents have been permanently deleted.",
        });
        onClose();
      } else {
        toast({
          title: "Error deleting vault",
          description: "Failed to delete the vault. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error deleting vault",
        description: "Failed to delete the vault. Please try again.",
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
            Delete Vault
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            This will permanently delete the vault and all its encrypted contents. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4">
          {/* Vault display */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
              Vault to delete
            </label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md border">
              <p className="font-medium text-sm flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                <KeyRound className="h-4 w-4" style={{ color: vaultColor || '#6366F1' }} />
                {vaultTitle}
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
            {isLoading ? 'Deleting...' : 'Delete Vault'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteVaultModal;
