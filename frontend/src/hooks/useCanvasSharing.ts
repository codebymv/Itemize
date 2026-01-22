import { useState, useCallback } from 'react';
import { List, Note, Whiteboard } from '@/types';

interface ShareData {
  shareToken: string;
  shareUrl: string;
}

interface ShareItem {
  id: string | number;
  title: string;
  shareData?: ShareData;
}

interface UseCanvasSharingReturn {
  // List sharing
  showShareListModal: boolean;
  setShowShareListModal: (show: boolean) => void;
  openShareListModal: (list: List) => void;
  
  // Note sharing
  showShareNoteModal: boolean;
  setShowShareNoteModal: (show: boolean) => void;
  openShareNoteModal: (note: Note) => void;
  
  // Whiteboard sharing
  showShareWhiteboardModal: boolean;
  setShowShareWhiteboardModal: (show: boolean) => void;
  openShareWhiteboardModal: (whiteboard: Whiteboard) => void;
  
  // Current share item
  currentShareItem: ShareItem | null;
  setCurrentShareItem: (item: ShareItem | null) => void;
  
  // Close all modals
  closeAllShareModals: () => void;
}

/**
 * Hook for managing share modal states across lists, notes, and whiteboards
 */
export function useCanvasSharing(): UseCanvasSharingReturn {
  const [showShareListModal, setShowShareListModal] = useState(false);
  const [showShareNoteModal, setShowShareNoteModal] = useState(false);
  const [showShareWhiteboardModal, setShowShareWhiteboardModal] = useState(false);
  const [currentShareItem, setCurrentShareItem] = useState<ShareItem | null>(null);

  /**
   * Open share modal for a list
   */
  const openShareListModal = useCallback((list: List) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setCurrentShareItem({
      id: list.id,
      title: list.title,
      shareData: list.share_token
        ? {
            shareToken: list.share_token,
            shareUrl: `${origin}/shared/list/${list.share_token}`,
          }
        : undefined,
    });
    setShowShareListModal(true);
  }, []);

  /**
   * Open share modal for a note
   */
  const openShareNoteModal = useCallback((note: Note) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setCurrentShareItem({
      id: note.id,
      title: note.title || 'Untitled Note',
      shareData: note.share_token
        ? {
            shareToken: note.share_token,
            shareUrl: `${origin}/shared/note/${note.share_token}`,
          }
        : undefined,
    });
    setShowShareNoteModal(true);
  }, []);

  /**
   * Open share modal for a whiteboard
   */
  const openShareWhiteboardModal = useCallback((whiteboard: Whiteboard) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setCurrentShareItem({
      id: whiteboard.id,
      title: whiteboard.title || 'Untitled Whiteboard',
      shareData: whiteboard.share_token
        ? {
            shareToken: whiteboard.share_token,
            shareUrl: `${origin}/shared/whiteboard/${whiteboard.share_token}`,
          }
        : undefined,
    });
    setShowShareWhiteboardModal(true);
  }, []);

  /**
   * Close all share modals and clear current item
   */
  const closeAllShareModals = useCallback(() => {
    setShowShareListModal(false);
    setShowShareNoteModal(false);
    setShowShareWhiteboardModal(false);
    setCurrentShareItem(null);
  }, []);

  return {
    showShareListModal,
    setShowShareListModal,
    openShareListModal,
    
    showShareNoteModal,
    setShowShareNoteModal,
    openShareNoteModal,
    
    showShareWhiteboardModal,
    setShowShareWhiteboardModal,
    openShareWhiteboardModal,
    
    currentShareItem,
    setCurrentShareItem,
    
    closeAllShareModals,
  };
}

export default useCanvasSharing;
