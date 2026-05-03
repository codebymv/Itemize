import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import api from '@/lib/api';
import { List, Note, Whiteboard, Wireframe, Vault } from '@/types';

interface ShareItem {
  id: string | number;
  title: string;
  itemType: 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
  isLocked?: boolean;
  shareData?: { shareToken: string; shareUrl: string };
}

export function useCanvasSharing(
  lists: List[],
  notes: Note[],
  whiteboards: Whiteboard[],
  wireframes: Wireframe[],
  vaults: Vault[],
) {
  const { toast } = useToast();
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentShareItem, setCurrentShareItem] = useState<ShareItem | null>(null);

  const handleListShare = async (listId: string): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/lists/${listId}/share`, {});
      return response.data;
    } catch (error) {
      logger.error('Error sharing list:', error);
      throw error;
    }
  };

  const handleListUnshare = async (listId: string): Promise<void> => {
    try {
      await api.delete(`/api/lists/${listId}/share`);
    } catch (error) {
      logger.error('Error unsharing list:', error);
      throw error;
    }
  };

  const handleNoteShare = async (noteId: number): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/notes/${noteId}/share`, {});
      return response.data;
    } catch (error) {
      logger.error('Error sharing note:', error);
      throw error;
    }
  };

  const handleNoteUnshare = async (noteId: number): Promise<void> => {
    try {
      await api.delete(`/api/notes/${noteId}/share`);
    } catch (error) {
      logger.error('Error unsharing note:', error);
      throw error;
    }
  };

  const handleWhiteboardShare = async (whiteboardId: number): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/whiteboards/${whiteboardId}/share`, {});
      return response.data;
    } catch (error) {
      logger.error('Error sharing whiteboard:', error);
      throw error;
    }
  };

  const handleWhiteboardUnshare = async (whiteboardId: number): Promise<void> => {
    try {
      await api.delete(`/api/whiteboards/${whiteboardId}/share`);
    } catch (error) {
      logger.error('Error unsharing whiteboard:', error);
      throw error;
    }
  };

  const handleWireframeShare = async (wireframeId: number): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/wireframes/${wireframeId}/share`, {});
      return response.data;
    } catch (error) {
      logger.error('Error sharing wireframe:', error);
      throw error;
    }
  };

  const handleWireframeUnshare = async (wireframeId: number): Promise<void> => {
    try {
      await api.delete(`/api/wireframes/${wireframeId}/share`);
    } catch (error) {
      logger.error('Error unsharing wireframe:', error);
      throw error;
    }
  };

  const handleVaultShare = async (vaultId: number): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/vaults/${vaultId}/share`, {});
      return response.data;
    } catch (error) {
      logger.error('Error sharing vault:', error);
      throw error;
    }
  };

  const handleVaultUnshare = async (vaultId: number): Promise<void> => {
    try {
      await api.delete(`/api/vaults/${vaultId}/share`);
    } catch (error) {
      logger.error('Error unsharing vault:', error);
      throw error;
    }
  };

  const handleShareList = (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    const existingShareData = list.share_token && list.is_public ? {
      shareToken: list.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/list/${list.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: listId,
      title: list.title,
      itemType: 'list',
      shareData: existingShareData
    });
    setShowShareModal(true);
  };

  const handleShareNote = (noteId: number) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const existingShareData = note.share_token && note.is_public ? {
      shareToken: note.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/note/${note.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: noteId,
      title: note.title,
      itemType: 'note',
      shareData: existingShareData
    });
    setShowShareModal(true);
  };

  const handleShareWhiteboard = (whiteboardId: number) => {
    const whiteboard = whiteboards.find(w => w.id === whiteboardId);
    if (!whiteboard) return;

    const existingShareData = whiteboard.share_token && whiteboard.is_public ? {
      shareToken: whiteboard.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/whiteboard/${whiteboard.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: whiteboardId,
      title: whiteboard.title,
      itemType: 'whiteboard',
      shareData: existingShareData
    });
    setShowShareModal(true);
  };

  const handleShareWireframe = (wireframeId: number) => {
    const wireframe = wireframes.find(w => w.id === wireframeId);
    if (!wireframe) return;

    const existingShareData = wireframe.share_token && wireframe.is_public ? {
      shareToken: wireframe.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/wireframe/${wireframe.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: wireframeId,
      title: wireframe.title,
      itemType: 'wireframe',
      shareData: existingShareData
    });
    setShowShareModal(true);
  };

  const handleShareVault = (vaultId: number) => {
    const vault = vaults.find(v => v.id === vaultId);
    if (!vault) return;

    const existingShareData = vault.share_token && vault.is_public ? {
      shareToken: vault.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/vault/${vault.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: vaultId,
      title: vault.title || 'Untitled Vault',
      itemType: 'vault',
      isLocked: vault.is_locked,
      shareData: existingShareData
    });
    setShowShareModal(true);
  };

  const shareHandlers = useMemo(() => ({
    list: { onShare: handleListShare, onUnshare: handleListUnshare },
    note: { onShare: handleNoteShare, onUnshare: handleNoteUnshare },
    whiteboard: { onShare: handleWhiteboardShare, onUnshare: handleWhiteboardUnshare },
    vault: { onShare: handleVaultShare, onUnshare: handleVaultUnshare },
    wireframe: { onShare: handleWireframeShare, onUnshare: handleWireframeUnshare }
  }), []);

  return {
    showShareModal,
    setShowShareModal,
    currentShareItem,
    setCurrentShareItem,
    shareHandlers,
    handleShareList,
    handleShareNote,
    handleShareWhiteboard,
    handleShareWireframe,
    handleShareVault,
  };
}
