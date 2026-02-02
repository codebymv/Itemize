import { useState, useCallback, useMemo } from 'react';
import { List } from '@/types';

export function useCanvasCollapsible(lists: List[]) {
  const [collapsedListIds, setCollapsedListIds] = useState<Set<string>>(new Set());
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<Set<number>>(new Set());
  const [collapsedWhiteboardIds, setCollapsedWhiteboardIds] = useState<Set<number>>(new Set());

  const isListCollapsed = useCallback((listId: string) => collapsedListIds.has(listId), [collapsedListIds]);

  const toggleListCollapsed = useCallback((listId: string) => {
    setCollapsedListIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(listId)) {
        newSet.delete(listId);
      } else {
        newSet.add(listId);
      }
      return newSet;
    });
  }, []);

  const isNoteCollapsed = useCallback((noteId: number) => collapsedNoteIds.has(noteId), [collapsedNoteIds]);

  const toggleNoteCollapsed = useCallback((noteId: number) => {
    setCollapsedNoteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  }, []);

  const isWhiteboardCollapsed = useCallback((whiteboardId: number) => collapsedWhiteboardIds.has(whiteboardId), [collapsedWhiteboardIds]);

  const toggleWhiteboardCollapsed = useCallback((whiteboardId: number) => {
    setCollapsedWhiteboardIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(whiteboardId)) {
        newSet.delete(whiteboardId);
      } else {
        newSet.add(whiteboardId);
      }
      return newSet;
    });
  }, []);

  // Create stable toggle callbacks for each list to prevent unnecessary re-renders
  const listToggleCallbacks = useMemo(() => {
    const callbacks: Record<string, () => void> = {};
    lists.forEach(list => {
      callbacks[list.id] = () => toggleListCollapsed(list.id);
    });
    return callbacks;
  }, [lists.map(l => l.id).join(','), toggleListCollapsed]);

  return {
    collapsedListIds,
    collapsedNoteIds,
    collapsedWhiteboardIds,
    isListCollapsed,
    toggleListCollapsed,
    isNoteCollapsed,
    toggleNoteCollapsed,
    isWhiteboardCollapsed,
    toggleWhiteboardCollapsed,
    listToggleCallbacks,
  };
}