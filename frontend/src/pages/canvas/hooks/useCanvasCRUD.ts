import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  createList as apiCreateList,
  updateList as apiUpdateList,
  deleteList as apiDeleteList,
  createNote as apiCreateNote,
  updateNote as apiUpdateNote,
  deleteNote as apiDeleteNote,
  CreateNotePayload,
  createWhiteboard as apiCreateWhiteboard,
  updateWhiteboard as apiUpdateWhiteboard,
  deleteWhiteboard as apiDeleteWhiteboard,
  CreateWhiteboardPayload,
  createWireframe as apiCreateWireframe,
  updateWireframe as apiUpdateWireframe,
  deleteWireframe as apiDeleteWireframe,
  CreateWireframePayload,
  createVault as apiCreateVault,
  updateVault as apiUpdateVault,
  deleteVault as apiDeleteVault,
  shareVault as apiShareVault,
  unshareVault as apiUnshareVault,
  CreateVaultPayload,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault } from '@/types';

export function useCanvasCRUD(
  token: string | null,
  categoriesHook: {
    isCategoryInUse: (name: string) => boolean;
    addCategory: (data: { name: string; color_value: string }) => Promise<any>;
  },
  updateState: {
    setLists: React.Dispatch<React.SetStateAction<List[]>>;
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
    setWhiteboards: React.Dispatch<React.SetStateAction<Whiteboard[]>>;
    setWireframes: React.Dispatch<React.SetStateAction<Wireframe[]>>;
    setVaults: React.Dispatch<React.SetStateAction<Vault[]>>;
  },
  enqueuePositionUpdate: (update: any) => void
) {
  const { toast } = useToast();
  const [recentlyCreatedListIds] = useState<Set<string>>(new Set());
  const { isCategoryInUse, addCategory } = categoriesHook;
  const { setLists, setNotes, setWhiteboards, setWireframes, setVaults } = updateState;

  const handleCreateNote = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const payloadWithDefaults: CreateNotePayload = {
        title: title,
        content: '',
        color_value: color,
        position_x: position.x,
        position_y: position.y,
        width: 570,
        height: 350,
        z_index: 0,
      };

      const newNote = await apiCreateNote(payloadWithDefaults, token);
      setNotes(prev => [newNote, ...prev]);

      return newNote;
    } catch (error) {
      logger.error('Failed to create note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your note. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return undefined;
    }
  };

  const handleUpdateNote = async (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => {
    let originalNotes: Note[] = [];
    setNotes(prev => {
      originalNotes = prev;
      return prev.map(n => n.id === noteId ? { ...n, ...updatedData } : n);
    });

    try {
      const updatedNote = await apiUpdateNote(noteId, updatedData, token);
      setNotes(prev => prev.map(n => n.id === noteId ? updatedNote : n));
      return updatedNote;
    } catch (error) {
      logger.error('Failed to update note:', error);
      setNotes(originalNotes);
      toast({
        title: "Error",
        description: "Failed to update note",
        variant: "destructive"
      });
      return null;
    }
  };

  const handleNotePositionUpdate = (noteId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => {
    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n,
      position_x: newPosition.x,
      position_y: newPosition.y,
      ...(newSize ? { width: newSize.width, height: newSize.height } : {})
    } : n));

    enqueuePositionUpdate({
      type: 'note',
      id: noteId,
      position_x: newPosition.x,
      position_y: newPosition.y,
      ...(newSize ? { width: newSize.width, height: newSize.height } : {})
    });
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      logger.log(`🗑️ Frontend: Attempting to delete note ${noteId}`);
      const result = await apiDeleteNote(noteId, token);
      logger.log(`✅ Frontend: Delete API response:`, result);

      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast({
        title: "Note deleted",
        description: "Your note has been successfully removed.",
      });
      return true;
    } catch (error) {
      logger.error('Frontend: Failed to delete note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not delete your note. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  const handleCreateWhiteboard = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const payloadWithDefaults: CreateWhiteboardPayload = {
        title: title,
        category: category,
        canvas_data: '{"paths": [], "shapes": []}',
        canvas_width: 750,
        canvas_height: 620,
        background_color: '#FFFFFF',
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
        color_value: color,
      };
      logger.log('handleCreateWhiteboard payload:', payloadWithDefaults);

      const newWhiteboard = await apiCreateWhiteboard(payloadWithDefaults, token);
      setWhiteboards(prev => [newWhiteboard, ...prev]);

      return newWhiteboard;
    } catch (error) {
      logger.error('Failed to create whiteboard:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your whiteboard. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return undefined;
    }
  };

  const handleUpdateWhiteboard = async (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      let originalWhiteboards: Whiteboard[] = [];
      setWhiteboards(prev => {
        originalWhiteboards = prev;
        return prev.map(w => w.id === whiteboardId ? { ...w, ...updatedData } : w);
      });

      logger.log('🎨 CanvasPage: Updating whiteboard:', {
        whiteboardId,
        updatedFields: Object.keys(updatedData),
        hasCanvasData: !!updatedData.canvas_data,
        canvasDataType: typeof updatedData.canvas_data,
        canvasDataPreview: updatedData.canvas_data ? JSON.stringify(updatedData.canvas_data).substring(0, 200) : 'N/A'
      });

      const updatedWhiteboard = await apiUpdateWhiteboard(whiteboardId, updatedData, token);

      logger.log('🎨 CanvasPage: Whiteboard update response:', {
        whiteboardId: updatedWhiteboard.id,
        hasCanvasData: !!updatedWhiteboard.canvas_data,
        canvasDataType: typeof updatedWhiteboard.canvas_data,
        updatedAt: updatedWhiteboard.updated_at
      });

      setWhiteboards(prev => prev.map(w => w.id === whiteboardId ? updatedWhiteboard : w));
      return updatedWhiteboard;
    } catch (error) {
      logger.error('Failed to update whiteboard:', error);
      setWhiteboards(originalWhiteboards);
      const errorMessage = error instanceof Error ? error.message : 'Could not update your whiteboard. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    }
  };

  const handleDeleteWhiteboard = async (whiteboardId: number) => {
    try {
      await apiDeleteWhiteboard(whiteboardId, token);
      setWhiteboards(prev => prev.filter(w => w.id !== whiteboardId));
      toast({
        title: "Whiteboard deleted",
        description: "Your whiteboard has been successfully removed.",
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete whiteboard:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not delete your whiteboard. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  const handleCreateWireframe = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const payloadWithDefaults: CreateWireframePayload = {
        title: title,
        category: category,
        flow_data: '{"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}',
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
        color_value: color,
      };
      logger.log('handleCreateWireframe payload:', payloadWithDefaults);

      const newWireframe = await apiCreateWireframe(payloadWithDefaults, token);
      setWireframes(prev => [newWireframe, ...prev]);

      return newWireframe;
    } catch (error) {
      logger.error('Failed to create wireframe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your wireframe. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return undefined;
    }
  };

  const handleUpdateWireframe = async (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const updatedWireframe = await apiUpdateWireframe(wireframeId, updatedData, token);
      setWireframes(prev => prev.map(w => w.id === wireframeId ? updatedWireframe : w));
      return updatedWireframe;
    } catch (error) {
      logger.error('Failed to update wireframe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not update your wireframe. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    }
  };

  const handleDeleteWireframe = async (wireframeId: number) => {
    try {
      await apiDeleteWireframe(wireframeId, token);
      setWireframes(prev => prev.filter(w => w.id !== wireframeId));
      toast({
        title: "Wireframe deleted",
        description: "Your wireframe has been successfully removed.",
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete wireframe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete wireframe';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  const handleWireframePositionChange = (wireframeId: number, newPosition: { x: number; y: number }) => {
    setWireframes(prev => prev.map(w => w.id === wireframeId ? { ...w, position_x: newPosition.x, position_y: newPosition.y } : w));

    enqueuePositionUpdate({
      type: 'wireframe',
      id: wireframeId,
      position_x: newPosition.x,
      position_y: newPosition.y
    });
  };

  const handleCreateVault = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const payloadWithDefaults: CreateVaultPayload = {
        title: title,
        category: category,
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
        color_value: color,
      };
      logger.log('handleCreateVault payload:', payloadWithDefaults);

      const newVault = await apiCreateVault(payloadWithDefaults, token);
      setVaults(prev => [newVault, ...prev]);

      return newVault;
    } catch (error) {
      logger.error('Failed to create vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your vault. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return undefined;
    }
  };

  const handleUpdateVault = async (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const updatedVault = await apiUpdateVault(vaultId, updatedData, token);
      setVaults(prev => prev.map(v => v.id === vaultId ? updatedVault : v));
      return updatedVault;
    } catch (error) {
      logger.error('Failed to update vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not update your vault. Please try again.';
      toast({
        title: "Error",
        description: "Failed to update vault",
        variant: "destructive"
      });
      return null;
    }
  };

  const handleDeleteVault = async (vaultId: number) => {
    try {
      await apiDeleteVault(vaultId, token);
      setVaults(prev => prev.filter(v => v.id !== vaultId));
      toast({
        title: "Vault deleted",
        description: "Your vault has been successfully removed.",
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not delete your vault. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  const handleVaultPositionChange = (vaultId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => {
    if (newSize) {
      setVaults(prev => prev.map(v => v.id === vaultId 
        ? { ...v, position_x: newPosition.x, position_y: newPosition.y, width: newSize.width, height: newSize.height } 
        : v
      ));
    } else {
      setVaults(prev => prev.map(v => v.id === vaultId 
        ? { ...v, position_x: newPosition.x, position_y: newPosition.y } 
        : v
      ));
    }

    enqueuePositionUpdate({
      type: 'vault',
      id: vaultId,
      position_x: newPosition.x,
      position_y: newPosition.y,
      ...(newSize ? { width: newSize.width, height: newSize.height } : {})
    });
  };

  const handleWhiteboardPositionUpdate = (whiteboardId: number, newPosition: { x: number; y: number }) => {
    setWhiteboards(prev => prev.map(whiteboard => whiteboard.id === whiteboardId ? {
      ...whiteboard,
      position_x: newPosition.x,
      position_y: newPosition.y
    } : whiteboard));

    enqueuePositionUpdate({
      type: 'whiteboard',
      id: whiteboardId,
      position_x: newPosition.x,
      position_y: newPosition.y
    });
  };

  const handleListPositionUpdate = (listId: string, newPosition: { x: number; y: number }, newSize?: { width: number }) => {
    setLists(prev => {
      return prev.map(list => list.id === listId ? {
        ...list,
        position_x: newPosition.x,
        position_y: newPosition.y,
        ...(newSize ? { width: newSize.width } : {})
      } : list);
    });

    enqueuePositionUpdate({
      type: 'list',
      id: listId,
      position_x: newPosition.x,
      position_y: newPosition.y,
      ...(newSize ? { width: newSize.width } : {})
    });
  };

  const updateList = async (updatedList: List) => {
    try {
      const updatedListFromAPI = await apiUpdateList(updatedList, token);

      const transformedList: List = {
        id: updatedListFromAPI.id,
        title: updatedListFromAPI.title,
        type: updatedListFromAPI.type || 'General',
        items: updatedListFromAPI.items || [],
        createdAt: updatedListFromAPI.createdAt ? new Date(updatedListFromAPI.createdAt) : undefined,
        position_x: updatedListFromAPI.position_x,
        position_y: updatedListFromAPI.position_y,
        width: updatedListFromAPI.width,
        height: updatedListFromAPI.height,
        color_value: updatedListFromAPI.color_value,
        share_token: updatedListFromAPI.share_token,
        is_public: updatedListFromAPI.is_public,
        shared_at: updatedListFromAPI.shared_at ? new Date(updatedListFromAPI.shared_at).toISOString() : undefined,
      };

      setLists(prev =>
        prev.map(list => list.id === updatedList.id ? transformedList : list)
      );
    } catch (error: any) {
      logger.error('Failed to update list:', error);

      if (error?.response?.status === 404 || error?.status === 404) {
        logger.warn(`List ${updatedList.id} no longer exists in backend, removing from frontend state`);
        setLists(prev => prev.filter(list => list.id !== updatedList.id));
        toast({
          title: "List no longer exists",
          description: "This list has been removed as it no longer exists.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Could not update your list. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const deleteList = async (listId: string): Promise<boolean> => {
    try {
      await apiDeleteList(listId, token);

      setLists(prev => prev.filter(list => list.id !== listId));

      toast({
        title: "List deleted",
        description: "Your list has been successfully removed.",
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete list:', error);
      toast({
        title: "Error",
        description: "Failed to delete list",
        variant: "destructive"
      });

      return false;
    }
  };

  const handleCreateList = async (title: string, type: string, color: string, position: { x: number; y: number }) => {
    try {
      if (!isCategoryInUse(type) && type !== 'General') {
        await addCategory({ name: type, color_value: color });
      }

      const response = await apiCreateList({
        title,
        type,
        items: [],
        position_x: position.x,
        position_y: position.y,
        color_value: color
      }, token);

      const newList: List = {
        id: response.id,
        title: response.title,
        type: response.type || 'General',
        items: response.items || [],
        createdAt: response.createdAt ? new Date(response.createdAt) : undefined,
        position_x: response.position_x || position.x,
        position_y: response.position_y || position.y,
        width: response.width,
        height: response.height,
        color_value: response.color_value || color,
        share_token: response.share_token,
        is_public: response.is_public,
        shared_at: response.shared_at ? new Date(response.shared_at).toISOString() : undefined,
      };

      recentlyCreatedListIds.current.add(newList.id);
      setTimeout(() => {
        recentlyCreatedListIds.current.delete(newList.id);
      }, 2000);

      setLists(prev => [newList, ...prev]);
      return newList;
    } catch (error) {
      logger.error('Failed to create list:', error);
      toast({
        title: "Error",
        description: "Could not create your list. Please try again.",
        variant: "destructive"
      });
      return undefined;
    }
  };

  const handleShareVault = async (vaultId: number) => {
    try {
      const result = await apiShareVault(vaultId, token);
      setVaults(prev => prev.map(v => v.id === vaultId 
        ? { ...v, share_token: result.shareToken, is_public: true, shared_at: new Date().toISOString() } 
        : v
      ));
      return result;
    } catch (error) {
      logger.error('Failed to share vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not share your vault. Please try again.';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      throw error;
    }
  };

  const handleUnshareVault = async (vaultId: number) => {
    try {
      await apiUnshareVault(vaultId, token);
      setVaults(prev => prev.map(v => v.id === vaultId 
        ? { ...v, is_public: false } 
        : v
      ));
    } catch (error) {
      logger.error('Failed to unshare vault:', error);
      toast({
        title: "Error",
        description: "Failed to revoke share",
        variant: "destructive"
      });
      throw error;
    }
  };

  return {
    handleCreateList,
    updateList,
    deleteList,
    handleListPositionUpdate,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    handleNotePositionUpdate,
    handleCreateWhiteboard,
    handleUpdateWhiteboard,
    handleDeleteWhiteboard,
    handleWhiteboardPositionUpdate,
    handleCreateWireframe,
    handleUpdateWireframe,
    handleDeleteWireframe,
    handleWireframePositionChange,
    handleCreateVault,
    handleUpdateVault,
    handleDeleteVault,
    handleVaultPositionChange,
    handleShareVault,
    handleUnshareVault,
    recentlyCreatedListIds,
  };
}