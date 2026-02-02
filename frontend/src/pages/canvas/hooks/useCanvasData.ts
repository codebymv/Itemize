import { useState, useEffect } from 'react';
import { useAuthState } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  fetchCanvasLists,
  getNotes,
  getWhiteboards,
  getWireframes,
  getVaults,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault } from '@/types';

interface CanvasData {
  lists: List[];
  notes: Note[];
  whiteboards: Whiteboard[];
  wireframes: Wireframe[];
  vaults: Vault[];
  loadingLists: boolean;
  loadingNotes: boolean;
  loadingWhiteboards: boolean;
  loadingWireframes: boolean;
  loadingVaults: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCanvasData(): CanvasData {
  const { token } = useAuthState();
  const { toast } = useToast();

  const [lists, setLists] = useState<List[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [wireframes, setWireframes] = useState<Wireframe[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);

  const [error, setError] = useState<string | null>(null);
  
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingWhiteboards, setLoadingWhiteboards] = useState(true);
  const [loadingWireframes, setLoadingWireframes] = useState(true);
  const [loadingVaults, setLoadingVaults] = useState(true);
  
  const isLoading = loadingLists || loadingNotes || loadingWhiteboards || loadingWireframes || loadingVaults;

  const fetchLists = async () => {
    try {
      setLoadingLists(true);
      setError(null);
      const fetchedLists = await fetchCanvasLists(token);
      setLists(Array.isArray(fetchedLists) ? fetchedLists : []);
    } catch (err) {
      logger.error('Error fetching lists:', err);
      setError('Failed to load lists. Please try again.');
    } finally {
      setLoadingLists(false);
    }
  };

  const fetchNotes = async () => {
    if (!token) return;
    try {
      setLoadingNotes(true);
      const response = await getNotes(token);
      const fetchedNotes = response?.notes || response || [];
      setNotes(Array.isArray(fetchedNotes) ? fetchedNotes : []);
    } catch (err) {
      logger.error('Error fetching notes:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load notes. Please try again.';
      toast({ title: "Error", description: "Failed to fetch notes", variant: "destructive" });
    } finally {
      setLoadingNotes(false);
    }
  };

  const fetchWhiteboards = async () => {
    if (!token) return;
    try {
      setLoadingWhiteboards(true);
      const response = await getWhiteboards(token);
      const fetchedWhiteboards = response?.whiteboards || response || [];
      setWhiteboards(Array.isArray(fetchedWhiteboards) ? fetchedWhiteboards : []);
    } catch (err) {
      logger.error('Error fetching whiteboards:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load whiteboards. Please try again.';
      toast({ title: "Error", description: "Failed to fetch whiteboards", variant: "destructive" });
    } finally {
      setLoadingWhiteboards(false);
    }
  };

  const fetchWireframes = async () => {
    if (!token) return;
    try {
      setLoadingWireframes(true);
      const response = await getWireframes(token);
      const fetchedWireframes = response?.wireframes || response || [];
      setWireframes(Array.isArray(fetchedWireframes) ? fetchedWireframes : []);
    } catch (err) {
      logger.error('Error fetching wireframes:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load wireframes. Please try again.';
      toast({ title: "Error", description: "Failed to fetch wireframes", variant: "destructive" });
    } finally {
      setLoadingWireframes(false);
    }
  };

  const fetchVaults = async () => {
    if (!token) return;
    try {
      setLoadingVaults(true);
      const response = await getVaults(token);
      const fetchedVaults = response?.vaults || response || [];
      setVaults(Array.isArray(fetchedVaults) ? fetchedVaults : []);
    } catch (err) {
      logger.error('Error fetching vaults:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load vaults. Please try again.';
      toast({ title: "Error", description: "Failed to fetch vaults", variant: "destructive" });
    } finally {
      setLoadingVaults(false);
    }
  };

  const refresh = async () => {
    await Promise.all([
      fetchLists(),
      fetchNotes(),
      fetchWhiteboards(),
      fetchWireframes(),
      fetchVaults(),
    ]);
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  return {
    lists,
    notes,
    whiteboards,
    wireframes,
    vaults,
    loadingLists,
    loadingNotes,
    loadingWhiteboards,
    loadingWireframes,
    loadingVaults,
    isLoading,
    error,
    refresh,
  };
}