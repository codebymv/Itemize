import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from '@/contexts/AuthContext';
import {
  updateList as apiUpdateList,
  updateNote as apiUpdateNote,
  updateWhiteboard as apiUpdateWhiteboard,
  updateWireframe as apiUpdateWireframe,
  updateVault as apiUpdateVault,
  deleteList as apiDeleteList,
  deleteNote as apiDeleteNote,
  deleteWhiteboard as apiDeleteWhiteboard,
  deleteWireframe as apiDeleteWireframe,
  deleteVault as apiDeleteVault,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault, Category } from '@/types';
import ListCard from '@/components/ListCard/ListCard';
import NoteCard from '@/components/NoteCard/NoteCard';
import WhiteboardCard from '@/components/WhiteboardCard/WhiteboardCard';
import WireframeCard from '@/components/WireframeCard/WireframeCard';
import { VaultCard } from '@/components/VaultCard/VaultCard';

type ContentType = 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';

interface UnifiedContent {
  id: number | string;
  type: ContentType;
  title: string;
  category: string;
  color_value?: string;
  itemCount?: number;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  originalData: List | Note | Whiteboard | Wireframe | Vault;
}

interface ContentModalProps {
  content: UnifiedContent;
  onClose: () => void;
  categories: Category[];
}

export function ContentModal({ content, onClose, categories }: ContentModalProps) {
  const { toast } = useToast();
  const { token } = useAuthState();

  // Local state for the content data
  const [localData, setLocalData] = useState(content.originalData);

  // Update handlers for each content type
  const handleListUpdate = useCallback(async (updatedList: List) => {
    if (!token) return;
    try {
      await apiUpdateList(updatedList, token);
      setLocalData(updatedList);
    } catch (error) {
      console.error('Error updating list:', error);
      toast({
        title: 'Error',
        description: 'Failed to update list',
        variant: 'destructive',
      });
    }
  }, [token, toast]);

  const handleListDelete = useCallback(async (listId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      await apiDeleteList(listId, token);
      toast({ title: 'Deleted', description: 'List deleted successfully' });
      onClose();
      return true;
    } catch (error) {
      console.error('Error deleting list:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete list',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, onClose]);

  const handleNoteUpdate = useCallback(async (noteId: number, updatedData: Partial<Note>) => {
    if (!token) return;
    try {
      await apiUpdateNote(noteId, updatedData, token);
      setLocalData(prev => ({ ...prev, ...updatedData }));
    } catch (error) {
      console.error('Error updating note:', error);
      toast({
        title: 'Error',
        description: 'Failed to update note',
        variant: 'destructive',
      });
    }
  }, [token, toast]);

  const handleNoteDelete = useCallback(async (noteId: number): Promise<void> => {
    if (!token) return;
    try {
      await apiDeleteNote(noteId, token);
      toast({ title: 'Deleted', description: 'Note deleted successfully' });
      onClose();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete note',
        variant: 'destructive',
      });
    }
  }, [token, toast, onClose]);

  const handleWhiteboardUpdate = useCallback(async (whiteboardId: number, updatedData: Partial<Whiteboard>) => {
    if (!token) return null;
    try {
      const result = await apiUpdateWhiteboard(whiteboardId, updatedData, token);
      setLocalData(prev => ({ ...prev, ...updatedData }));
      return result;
    } catch (error) {
      console.error('Error updating whiteboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to update whiteboard',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast]);

  const handleWhiteboardDelete = useCallback(async (whiteboardId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      await apiDeleteWhiteboard(whiteboardId, token);
      toast({ title: 'Deleted', description: 'Whiteboard deleted successfully' });
      onClose();
      return true;
    } catch (error) {
      console.error('Error deleting whiteboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete whiteboard',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, onClose]);

  const handleWireframeUpdate = useCallback(async (wireframeId: number, updatedData: Partial<Wireframe>) => {
    if (!token) return null;
    try {
      const result = await apiUpdateWireframe(wireframeId, updatedData, token);
      setLocalData(prev => ({ ...prev, ...updatedData }));
      return result;
    } catch (error) {
      console.error('Error updating wireframe:', error);
      toast({
        title: 'Error',
        description: 'Failed to update wireframe',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast]);

  const handleWireframeDelete = useCallback(async (wireframeId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      await apiDeleteWireframe(wireframeId, token);
      toast({ title: 'Deleted', description: 'Wireframe deleted successfully' });
      onClose();
      return true;
    } catch (error) {
      console.error('Error deleting wireframe:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete wireframe',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, onClose]);

  const handleVaultUpdate = useCallback(async (vaultId: number, updatedData: Partial<Vault>) => {
    if (!token) return null;
    try {
      const result = await apiUpdateVault(vaultId, updatedData, token);
      setLocalData(prev => ({ ...prev, ...updatedData }));
      return result;
    } catch (error) {
      console.error('Error updating vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to update vault',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast]);

  const handleVaultDelete = useCallback(async (vaultId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      await apiDeleteVault(vaultId, token);
      toast({ title: 'Deleted', description: 'Vault deleted successfully' });
      onClose();
      return true;
    } catch (error) {
      console.error('Error deleting vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete vault',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, onClose]);

  // Dummy handlers for features not used in modal view
  const handleShare = () => {
    toast({ title: 'Share', description: 'Please use the canvas view to share content' });
  };

  const handleCategoryUpdate = async (categoryName: string, updatedData: Partial<Category>) => {
    // In modal view, we don't support category updates
  };

  // Render the appropriate card based on content type
  const renderCard = () => {
    switch (content.type) {
      case 'list':
        return (
          <ListCard
            list={localData as List}
            onUpdate={handleListUpdate}
            onDelete={handleListDelete}
            onShare={handleShare}
            existingCategories={categories}
            updateCategory={handleCategoryUpdate}
          />
        );

      case 'note':
        return (
          <NoteCard
            note={localData as Note}
            onUpdate={handleNoteUpdate}
            onDelete={handleNoteDelete}
            onShare={handleShare}
            existingCategories={categories}
            updateCategory={handleCategoryUpdate}
          />
        );

      case 'whiteboard':
        return (
          <WhiteboardCard
            whiteboard={localData as Whiteboard}
            onUpdate={handleWhiteboardUpdate}
            onDelete={handleWhiteboardDelete}
            onShare={handleShare}
            existingCategories={categories}
            updateCategory={handleCategoryUpdate}
          />
        );

      case 'wireframe':
        return (
          <WireframeCard
            wireframe={localData as Wireframe}
            onUpdate={handleWireframeUpdate}
            onDelete={handleWireframeDelete}
            onShare={handleShare}
            existingCategories={categories}
            updateCategory={handleCategoryUpdate}
          />
        );

      case 'vault':
        return (
          <VaultCard
            vault={localData as Vault}
            onUpdate={handleVaultUpdate}
            onDelete={handleVaultDelete}
            onShare={handleShare}
            existingCategories={categories}
            updateCategory={handleCategoryUpdate}
          />
        );

      default:
        return <div>Unknown content type</div>;
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-hidden p-0"
        style={{ width: 'calc(100vw - 2rem)' }}
      >
        <div className="flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle style={{ fontFamily: '"Raleway", sans-serif' }}>
                {content.title}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              {renderCard()}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ContentModal;
