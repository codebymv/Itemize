import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import {
  fetchCanvasLists,
  getNotes,
  getVaults,
  getWhiteboards,
  getWireframes,
} from '@/services/api';
import type { List, Note, Vault, Whiteboard, Wireframe } from '@/types';

const rowsFrom = <T,>(response: unknown, key: string): T[] => {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === 'object') {
    const rows = (response as Record<string, unknown>)[key];
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
};

export function useWorkspaceContent(token?: string | null) {
  const [lists, setLists] = useState<List[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [wireframes, setWireframes] = useState<Wireframe[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const hasLoadedSnapshot = useRef(false);

  const refresh = useCallback(async (): Promise<boolean> => {
    const requestId = ++requestSequence.current;
    const isInitialLoad = !hasLoadedSnapshot.current;
    if (isInitialLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [listsResponse, notesResponse, whiteboardsResponse, wireframesResponse, vaultsResponse] = await Promise.all([
        fetchCanvasLists(token ?? undefined),
        getNotes(token ?? undefined),
        getWhiteboards(token ?? undefined),
        getWireframes(token ?? undefined),
        getVaults(token ?? undefined),
      ]);

      if (requestId !== requestSequence.current) return false;

      // Commit one complete snapshot so a partial provider failure never looks
      // like the user deleted one class of workspace content.
      setLists(rowsFrom<List>(listsResponse, 'lists'));
      setNotes(rowsFrom<Note>(notesResponse, 'notes'));
      setWhiteboards(rowsFrom<Whiteboard>(whiteboardsResponse, 'whiteboards'));
      setWireframes(rowsFrom<Wireframe>(wireframesResponse, 'wireframes'));
      setVaults(rowsFrom<Vault>(vaultsResponse, 'vaults'));
      hasLoadedSnapshot.current = true;
      return true;
    } catch (loadError) {
      logger.error('Failed to load workspace content:', loadError);
      if (requestId === requestSequence.current) {
        setError('We could not load your workspace content. Your existing items have not been changed.');
      }
      return false;
    } finally {
      if (requestId === requestSequence.current) {
        if (isInitialLoad) setLoading(false);
        else setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    lists,
    notes,
    whiteboards,
    wireframes,
    vaults,
    setLists,
    setNotes,
    setWhiteboards,
    setWireframes,
    setVaults,
    loading,
    isLoading: loading,
    refreshing,
    isRefreshing: refreshing,
    error,
    refresh,
  };
}
