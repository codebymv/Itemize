import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  List as ListIcon,
  Search,
  Map,
  CheckSquare,
  StickyNote,
  Palette,
  GitBranch,
  KeyRound,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from '@/contexts/AuthContext';
import {
  fetchCanvasLists,
  getNotes,
  getWhiteboards,
  getWireframes,
  getVaults,
  createList as apiCreateList,
  createNote as apiCreateNote,
  createWhiteboard as apiCreateWhiteboard,
  createWireframe as apiCreateWireframe,
  createVault as apiCreateVault,
  deleteList as apiDeleteList,
  deleteNote as apiDeleteNote,
  deleteWhiteboard as apiDeleteWhiteboard,
  deleteWireframe as apiDeleteWireframe,
  deleteVault as apiDeleteVault,
  updateList as apiUpdateList,
  updateNote as apiUpdateNote,
  updateWhiteboard as apiUpdateWhiteboard,
  updateWireframe as apiUpdateWireframe,
  updateVault as apiUpdateVault,
  shareList as apiShareList,
  shareNote as apiShareNote,
  shareWhiteboard as apiShareWhiteboard,
  unshareList as apiUnshareList,
  unshareNote as apiUnshareNote,
  unshareWhiteboard as apiUnshareWhiteboard,
  shareVault,
  unshareVault,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault, Category } from '@/types';
import { useDatabaseCategories } from '@/hooks/useDatabaseCategories';
import ListCard from '@/components/ListCard/ListCard';
import NoteCard from '@/components/NoteCard/NoteCard';
import WhiteboardCard from '@/components/WhiteboardCard/WhiteboardCard';
import WireframeCard from '@/components/WireframeCard/WireframeCard';
import { VaultCard } from '@/components/VaultCard/VaultCard';
import { CreateItemModal } from '@/components/CreateItemModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { ShareModal } from '@/components/ShareModal';
import { appendShareFragment } from '@/lib/vaultZkCrypto';
import {
  decryptZkeVaultItems,
  encryptVaultShareSnapshot,
  isVaultZke,
} from '@/lib/vaultZkSession';
import { enableVaultSharingViaGraphql, getVaultViaGraphql } from '@/services/workspaceVaultGraphql';
import {
  disableWorkspaceWireframeSharingViaGraphql,
  enableWorkspaceWireframeSharingViaGraphql,
} from '@/services/workspaceWireframeMutationsGraphql';

type ContentType = 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
type SortOption = 'updated' | 'created' | 'title';
type ViewMode = 'grid' | 'list';
type WorkspaceShareTarget = {
  itemType: 'list' | 'note' | 'whiteboard' | 'wireframe';
  itemId: string | number;
  itemTitle: string;
  isPublic?: boolean;
  shareToken?: string;
};

export function ContentsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { token } = useAuthState();
  const isMobile = useIsMobile();

  const {
    showModal: showOnboarding,
    handleComplete: handleOnboardingComplete,
    handleDismiss: handleOnboardingDismiss,
    handleClose: handleOnboardingClose,
    featureKey: onboardingFeatureKey,
  } = useRouteOnboarding();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [typeFilter, setTypeFilter] = useState<ContentType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  const [lists, setLists] = useState<List[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [wireframes, setWireframes] = useState<Wireframe[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);

  const [loading, setLoading] = useState(true);

  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [showNewWhiteboardModal, setShowNewWhiteboardModal] = useState(false);
  const [showNewWireframeModal, setShowNewWireframeModal] = useState(false);
  const [showNewVaultModal, setShowNewVaultModal] = useState(false);
  const [workspaceShareTarget, setWorkspaceShareTarget] = useState<WorkspaceShareTarget | null>(null);
  const [vaultToShare, setVaultToShare] = useState<Vault | null>(null);

  const {
    categories: dbCategories,
    addCategory,
    editCategory: updateCategoryInDB,
    getCategoryByName,
  } = useDatabaseCategories();

  const editCategory = async (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => {
    try {
      const existingCategory = getCategoryByName(categoryName);
      if (!existingCategory) {
        throw new Error(`Category "${categoryName}" not found`);
      }

      const updatedCategory = await updateCategoryInDB(existingCategory.id, {
        name: updatedData.name || existingCategory.name,
        color_value: updatedData.color_value || existingCategory.color_value
      });

      if (!updatedCategory) {
        throw new Error('Failed to update category');
      }

      fetchAllContent();
    } catch (error) {
      console.error('Error updating category:', error);
    }
  };

  const [collapsedListIds, setCollapsedListIds] = useState<Set<string>>(new Set());
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<Set<number>>(new Set());
  const [collapsedWhiteboardIds, setCollapsedWhiteboardIds] = useState<Set<number>>(new Set());
  const [collapsedWireframeIds, setCollapsedWireframeIds] = useState<Set<number>>(new Set());
  const [collapsedVaultIds, setCollapsedVaultIds] = useState<Set<number>>(new Set());

  const isListCollapsed = (id: string) => collapsedListIds.has(id);
  const toggleListCollapsed = useCallback((id: string) => {
    setCollapsedListIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const isNoteCollapsed = (id: number) => collapsedNoteIds.has(id);
  const toggleNoteCollapsed = useCallback((id: number) => {
    setCollapsedNoteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const isWhiteboardCollapsed = (id: number) => collapsedWhiteboardIds.has(id);
  const toggleWhiteboardCollapsed = useCallback((id: number) => {
    setCollapsedWhiteboardIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const isWireframeCollapsed = (id: number) => collapsedWireframeIds.has(id);
  const toggleWireframeCollapsed = useCallback((id: number) => {
    setCollapsedWireframeIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const isVaultCollapsed = (id: number) => collapsedVaultIds.has(id);
  const toggleVaultCollapsed = useCallback((id: number) => {
    setCollapsedVaultIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const fetchAllContent = useCallback(async () => {
    setLoading(true);
    try {
      const [listsRes, notesRes, whiteboardsRes, wireframesRes, vaultsRes] = await Promise.all([
        fetchCanvasLists(token).catch(() => []),
        getNotes(token).catch(() => ({ notes: [] })),
        getWhiteboards(token).catch(() => ({ whiteboards: [] })),
        getWireframes(token).catch(() => ({ wireframes: [] })),
        getVaults(token).catch(() => ({ vaults: [] })),
      ]);

      setLists(listsRes || []);
      setNotes(notesRes?.notes || []);
      setWhiteboards(whiteboardsRes?.whiteboards || []);
      setWireframes(wireframesRes?.wireframes || []);
      setVaults(vaultsRes?.vaults || []);
    } catch (error) {
      console.error('Error fetching content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load content',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchAllContent();
  }, [fetchAllContent]);

  const handleListUpdate = useCallback(async (list: List) => {
    try {
      const updated = await apiUpdateList(list, token);
      fetchAllContent();
      return updated;
    } catch (error) {
      console.error('Failed to update list:', error);
      toast({
        title: 'Error',
        description: 'Failed to update list',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast, fetchAllContent]);

  const handleListDelete = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiDeleteList(id, token);
      toast({ title: 'List deleted', description: 'List removed successfully' });
      fetchAllContent();
      return true;
    } catch (error) {
      console.error('Failed to delete list:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete list',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, fetchAllContent]);

  const handleListShare = useCallback((id: string) => {
    const list = lists.find((candidate) => candidate.id === id);
    if (list) setWorkspaceShareTarget({
      itemType: 'list',
      itemId: id,
      itemTitle: list.title || 'Untitled List',
      isPublic: list.is_public,
      shareToken: list.share_token,
    });
  }, [lists]);

  const handleNoteUpdate = useCallback(async (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => {
    try {
      await apiUpdateNote(noteId, updatedData, token);
      fetchAllContent();
    } catch (error) {
      console.error('Failed to update note:', error);
      toast({
        title: 'Error',
        description: 'Failed to update note',
        variant: 'destructive',
      });
    }
  }, [token, toast, fetchAllContent]);

  const handleNoteDelete = useCallback(async (id: number): Promise<void> => {
    try {
      await apiDeleteNote(id, token);
      toast({ title: 'Note deleted', description: 'Note removed successfully' });
      fetchAllContent();
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete note',
        variant: 'destructive',
      });
    }
  }, [token, toast, fetchAllContent]);

  const handleNoteShare = useCallback((id: number) => {
    const note = notes.find((candidate) => candidate.id === id);
    if (note) setWorkspaceShareTarget({
      itemType: 'note',
      itemId: id,
      itemTitle: note.title || 'Untitled Note',
      isPublic: note.is_public,
      shareToken: note.share_token,
    });
  }, [notes]);

  const handleWhiteboardUpdate = useCallback(async (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const result = await apiUpdateWhiteboard(whiteboardId, updatedData, token);
      fetchAllContent();
      return result as Whiteboard;
    } catch (error) {
      console.error('Failed to update whiteboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to update whiteboard',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast, fetchAllContent]);

  const handleWireframeUpdate = useCallback(async (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const result = await apiUpdateWireframe(wireframeId, updatedData, token);
      fetchAllContent();
      return result as Wireframe;
    } catch (error) {
      console.error('Failed to update wireframe:', error);
      toast({
        title: 'Error',
        description: 'Failed to update wireframe',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast, fetchAllContent]);

  const handleVaultUpdate = useCallback(async (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const result = await apiUpdateVault(vaultId, updatedData, token);
      fetchAllContent();
      return result as Vault;
    } catch (error) {
      console.error('Failed to update vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to update vault',
        variant: 'destructive',
      });
      return null;
    }
  }, [token, toast, fetchAllContent]);

  const handleWhiteboardDelete = useCallback(async (id: number): Promise<boolean> => {
    try {
      await apiDeleteWhiteboard(id, token);
      toast({ title: 'Whiteboard deleted', description: 'Whiteboard removed successfully' });
      fetchAllContent();
      return true;
    } catch (error) {
      console.error('Failed to delete whiteboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete whiteboard',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, fetchAllContent]);

  const handleWhiteboardShare = useCallback((id: number) => {
    const whiteboard = whiteboards.find((candidate) => candidate.id === id);
    if (whiteboard) setWorkspaceShareTarget({
      itemType: 'whiteboard',
      itemId: id,
      itemTitle: whiteboard.title || 'Untitled Whiteboard',
      isPublic: whiteboard.is_public,
      shareToken: whiteboard.share_token,
    });
  }, [whiteboards]);

  const handleWireframeDelete = useCallback(async (id: number): Promise<boolean> => {
    try {
      await apiDeleteWireframe(id, token);
      toast({ title: 'Wireframe deleted', description: 'Wireframe removed successfully' });
      fetchAllContent();
      return true;
    } catch (error) {
      console.error('Failed to delete wireframe:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete wireframe',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, fetchAllContent]);

  const handleWireframeShare = useCallback((id: number) => {
    const wireframe = wireframes.find((candidate) => candidate.id === id);
    if (wireframe) setWorkspaceShareTarget({
      itemType: 'wireframe',
      itemId: id,
      itemTitle: wireframe.title || 'Untitled Wireframe',
      isPublic: wireframe.is_public,
      shareToken: wireframe.share_token,
    });
  }, [wireframes]);

  const enableSelectedWorkspaceSharing = useCallback(async (id: string | number) => {
    if (!workspaceShareTarget) throw new Error('No workspace item selected');
    let result: { shareToken: string; shareUrl: string };
    switch (workspaceShareTarget.itemType) {
      case 'list':
        result = await apiShareList(String(id), token);
        break;
      case 'note':
        result = await apiShareNote(Number(id), token);
        break;
      case 'whiteboard':
        result = await apiShareWhiteboard(Number(id), token);
        break;
      case 'wireframe':
        result = await enableWorkspaceWireframeSharingViaGraphql(Number(id));
        break;
    }
    await fetchAllContent();
    return result;
  }, [fetchAllContent, token, workspaceShareTarget]);

  const disableSelectedWorkspaceSharing = useCallback(async (id: string | number) => {
    if (!workspaceShareTarget) throw new Error('No workspace item selected');
    switch (workspaceShareTarget.itemType) {
      case 'list':
        await apiUnshareList(String(id), token);
        break;
      case 'note':
        await apiUnshareNote(Number(id), token);
        break;
      case 'whiteboard':
        await apiUnshareWhiteboard(Number(id), token);
        break;
      case 'wireframe':
        await disableWorkspaceWireframeSharingViaGraphql(Number(id));
        break;
    }
    await fetchAllContent();
  }, [fetchAllContent, token, workspaceShareTarget]);

  const handleVaultDelete = useCallback(async (id: number): Promise<boolean> => {
    try {
      await apiDeleteVault(id, token);
      toast({ title: 'Vault deleted', description: 'Vault removed successfully' });
      fetchAllContent();
      return true;
    } catch (error) {
      console.error('Failed to delete vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete vault',
        variant: 'destructive',
      });
      return false;
    }
  }, [token, toast, fetchAllContent]);

  const handleVaultShare = useCallback((id: number) => {
    const vault = vaults.find((candidate) => candidate.id === id);
    if (vault) setVaultToShare(vault);
  }, [vaults]);

  const enableSelectedVaultSharing = useCallback(async (id: number) => {
    const current = vaults.find((vault) => vault.id === id);
    let result: { shareToken: string; shareUrl: string };
    if (current && isVaultZke(current)) {
      const full = await getVaultViaGraphql(id);
      const items = await decryptZkeVaultItems(full);
      const snapshot = await encryptVaultShareSnapshot(id, items);
      const shared = await enableVaultSharingViaGraphql(id, {
        ciphertext: snapshot.ciphertext,
        iv: snapshot.iv,
      });
      result = {
        shareToken: shared.shareToken,
        shareUrl: appendShareFragment(shared.shareUrl, snapshot.shareSecret),
      };
    } else {
      result = await shareVault(id, token);
    }
    setVaults((currentVaults) => currentVaults.map((vault) => vault.id === id
      ? {
          ...vault,
          is_public: true,
          share_token: result.shareToken,
          shared_at: new Date().toISOString(),
        }
      : vault));
    return result;
  }, [token, vaults]);

  const disableSelectedVaultSharing = useCallback(async (id: number) => {
    await unshareVault(id, token);
    setVaults((current) => current.map((vault) => vault.id === id
      ? {
          ...vault,
          is_public: false,
          share_token: undefined,
          shared_at: undefined,
        }
      : vault));
  }, [token]);

  const filteredAndSortedLists = useMemo(() => {
    let filtered = [...lists];
    if (categoryFilter !== 'all') filtered = filtered.filter(l => (l.type || 'General') === categoryFilter);
    if (searchQuery) filtered = filtered.filter(l => l.title?.toLowerCase().includes(searchQuery.toLowerCase()));

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        case 'created': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'title': return (a.title || '').localeCompare(b.title || '');
        default: return 0;
      }
    });

    return filtered;
  }, [lists, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedNotes = useMemo(() => {
    let filtered = [...notes];
    if (categoryFilter !== 'all') filtered = filtered.filter(n => (n.category || 'General') === categoryFilter);
    if (searchQuery) filtered = filtered.filter(n => n.title?.toLowerCase().includes(searchQuery.toLowerCase()));

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        case 'created': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'title': return (a.title || '').localeCompare(b.title || '');
        default: return 0;
      }
    });

    return filtered;
  }, [notes, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedWhiteboards = useMemo(() => {
    let filtered = [...whiteboards];
    if (categoryFilter !== 'all') filtered = filtered.filter(w => (w.category || 'General') === categoryFilter);
    if (searchQuery) filtered = filtered.filter(w => w.title?.toLowerCase().includes(searchQuery.toLowerCase()));

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        case 'created': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'title': return (a.title || '').localeCompare(b.title || '');
        default: return 0;
      }
    });

    return filtered;
  }, [whiteboards, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedWireframes = useMemo(() => {
    let filtered = [...wireframes];
    if (categoryFilter !== 'all') filtered = filtered.filter(w => (w.category || 'General') === categoryFilter);
    if (searchQuery) filtered = filtered.filter(w => w.title?.toLowerCase().includes(searchQuery.toLowerCase()));

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        case 'created': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'title': return (a.title || '').localeCompare(b.title || '');
        default: return 0;
      }
    });

    return filtered;
  }, [wireframes, categoryFilter, searchQuery, sortBy]);

  const filteredAndSortedVaults = useMemo(() => {
    let filtered = [...vaults];
    if (categoryFilter !== 'all') filtered = filtered.filter(v => (v.category || 'General') === categoryFilter);
    if (searchQuery) filtered = filtered.filter(v => v.title?.toLowerCase().includes(searchQuery.toLowerCase()));

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated': return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        case 'created': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'title': return (a.title || '').localeCompare(b.title || '');
        default: return 0;
      }
    });

    return filtered;
  }, [vaults, categoryFilter, searchQuery, sortBy]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    lists.forEach(l => cats.add(l.type || 'General'));
    notes.forEach(n => cats.add(n.category || 'General'));
    whiteboards.forEach(w => cats.add(w.category || 'General'));
    wireframes.forEach(w => cats.add(w.category || 'General'));
    vaults.forEach(v => cats.add(v.category || 'General'));
    return Array.from(cats).sort();
  }, [lists, notes, whiteboards, wireframes, vaults]);

  const createNote = async (title: string, category: string, color: string) => {
    await apiCreateNote({ title, content: '', category, color_value: color, width: 570, height: 350, z_index: 0 }, token);
    fetchAllContent();
  };

  const createList = async (title: string, type: string, color: string) => {
    await apiCreateList({ title, type, items: [], color_value: color }, token);
    fetchAllContent();
  };

  const createWhiteboard = async (title: string, category: string, color: string) => {
    await apiCreateWhiteboard({ title, category, color_value: color, z_index: 0 }, token);
    fetchAllContent();
  };

  const createWireframe = async (title: string, category: string, color: string) => {
    await apiCreateWireframe({ title, category, color_value: color, z_index: 0 }, token);
    fetchAllContent();
  };

  const createVault = async (title: string, category: string, color: string) => {
    await apiCreateVault({ title, category, color_value: color, z_index: 0 }, token);
    fetchAllContent();
  };

  const categoriesForModal = useMemo(() => {
    return dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }));
  }, [dbCategories]);

  const totalItems = filteredAndSortedLists.length + filteredAndSortedNotes.length + filteredAndSortedWhiteboards.length + filteredAndSortedWireframes.length + filteredAndSortedVaults.length;

  return (
    <PageLayout
      title="CONTENTS"
      icon={<LayoutGrid className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      mobileClassName="flex-col items-stretch gap-3"
      headerActions={
        <>
          <div className="flex border rounded-md">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-r-none" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-l-none" onClick={() => setViewMode('list')}>
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9 bg-muted/20 border-border/50"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[140px] h-9 bg-muted/20 border-border/50"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ContentType)}>
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="list">Lists</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="whiteboard">Whiteboards</SelectItem>
              <SelectItem value="wireframe">Wireframes</SelectItem>
              <SelectItem value="vault">Vaults</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background font-raleway" />
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light" onClick={() => navigate('/canvas')}>
            <Map className="h-4 w-4 mr-2" />
            Canvas
          </Button>
        </>
      }
      mobileActions={
        <>
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-9 w-full bg-muted/20 border-border/50" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3">
                <Plus className="h-4 w-4" />
                {!isMobile && <span className="ml-1.5">Add</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setShowNewListModal(true)}><CheckSquare className="h-4 w-4 mr-2" />List</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNewNoteModal(true)}><StickyNote className="h-4 w-4 mr-2" />Note</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNewWhiteboardModal(true)}><Palette className="h-4 w-4 mr-2" />Whiteboard</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNewWireframeModal(true)}><GitBranch className="h-4 w-4 mr-2" />Wireframe</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNewVaultModal(true)}><KeyRound className="h-4 w-4 mr-2" />Vault</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ContentType)}>
            <SelectTrigger className="flex-1 flex-shrink h-9 pr-8 min-w-0" style={{ paddingLeft: '0.375rem', flexBasis: 0 }}><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="list">Lists</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="whiteboard">Whiteboards</SelectItem>
              <SelectItem value="wireframe">Wireframes</SelectItem>
              <SelectItem value="vault">Vaults</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="flex-1 flex-shrink h-9 pr-8 min-w-0" style={{ paddingLeft: '0.375rem', flexBasis: 0 }}><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex border rounded-md">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-r-none" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-l-none" onClick={() => setViewMode('list')}>
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </>
      }
    >
        <div className="flex items-center justify-end mb-6">
          <span className="text-sm text-muted-foreground">{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
        </div>

        <Card>
          <CardContent className="p-0">
        {loading ? (
          <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'} p-6`}>
            {[...Array(8)].map((_, i) => <Skeleton key={i} className={viewMode === 'grid' ? 'h-32' : 'h-16'} />)}
          </div>
        ) : totalItems === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No content"
            description="Get started by creating content"
            className="p-12"
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Content
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48">
                  <DropdownMenuItem onClick={() => setShowNewListModal(true)}><CheckSquare className="h-4 w-4 mr-2" />List</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowNewNoteModal(true)}><StickyNote className="h-4 w-4 mr-2" />Note</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowNewWhiteboardModal(true)}><Palette className="h-4 w-4 mr-2" />Whiteboard</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowNewWireframeModal(true)}><GitBranch className="h-4 w-4 mr-2" />Wireframe</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowNewVaultModal(true)}><KeyRound className="h-4 w-4 mr-2" />Vault</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ) : (
          <div className="space-y-6 p-6">
            {(typeFilter === 'all' || typeFilter === 'list') && filteredAndSortedLists.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><CheckSquare className="h-5 w-5 text-muted-foreground" /> Lists</h2>
                <div className="grid grid-cols-1 gap-4">
                  {filteredAndSortedLists.map(list => (
                    <ListCard
                      key={list.id}
                      list={list}
                      onUpdate={handleListUpdate}
                      onDelete={handleListDelete}
                      onShare={handleListShare}
                      existingCategories={dbCategories}
                      isCollapsed={isListCollapsed(list.id)}
                      onToggleCollapsed={() => toggleListCollapsed(list.id)}
                      addCategory={addCategory}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}

            {(typeFilter === 'all' || typeFilter === 'note') && filteredAndSortedNotes.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><StickyNote className="h-5 w-5 text-muted-foreground" /> Notes</h2>
                <div className="grid grid-cols-1 gap-4">
                  {filteredAndSortedNotes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onUpdate={handleNoteUpdate}
                      onDelete={handleNoteDelete}
                      onShare={handleNoteShare}
                      existingCategories={dbCategories}
                      isCollapsed={isNoteCollapsed(note.id)}
                      onToggleCollapsed={() => toggleNoteCollapsed(note.id)}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}

            {(typeFilter === 'all' || typeFilter === 'whiteboard') && filteredAndSortedWhiteboards.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><Palette className="h-5 w-5 text-muted-foreground" /> Whiteboards</h2>
                <div className="grid grid-cols-1 gap-4">
                  {filteredAndSortedWhiteboards.map(wb => (
                    <WhiteboardCard
                      key={wb.id}
                      whiteboard={wb}
                      onUpdate={handleWhiteboardUpdate}
                      onDelete={handleWhiteboardDelete}
                      onShare={handleWhiteboardShare}
                      existingCategories={dbCategories}
                      isCollapsed={isWhiteboardCollapsed(wb.id)}
                      onToggleCollapsed={() => toggleWhiteboardCollapsed(wb.id)}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}

            {(typeFilter === 'all' || typeFilter === 'wireframe') && filteredAndSortedWireframes.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><GitBranch className="h-5 w-5 text-muted-foreground" /> Wireframes</h2>
                <div className="grid grid-cols-1 gap-4">
                  {filteredAndSortedWireframes.map(wf => (
                    <WireframeCard
                      key={wf.id}
                      wireframe={wf}
                      onUpdate={handleWireframeUpdate}
                      onDelete={handleWireframeDelete}
                      onShare={handleWireframeShare}
                      existingCategories={dbCategories}
                      isCollapsed={isWireframeCollapsed(wf.id)}
                      onToggleCollapsed={() => toggleWireframeCollapsed(wf.id)}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}

            {(typeFilter === 'all' || typeFilter === 'vault') && filteredAndSortedVaults.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-muted-foreground" /> Vaults</h2>
                <div className="grid grid-cols-1 gap-4">
                  {filteredAndSortedVaults.map(vault => (
                    <VaultCard
                      key={vault.id}
                      vault={vault}
                      onUpdate={handleVaultUpdate}
                      onDelete={handleVaultDelete}
                      onShare={handleVaultShare}
                      existingCategories={dbCategories}
                      isCollapsed={isVaultCollapsed(vault.id)}
                      onToggleCollapsed={() => toggleVaultCollapsed(vault.id)}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </CardContent>
        </Card>

      {showNewNoteModal && <CreateItemModal open={showNewNoteModal} onOpenChange={(open) => { setShowNewNoteModal(open); if (!open) fetchAllContent(); }} itemType="note" onCreate={createNote} existingCategories={categoriesForModal} />}
      {showNewListModal && <CreateItemModal open={showNewListModal} onOpenChange={(open) => { setShowNewListModal(open); if (!open) fetchAllContent(); }} itemType="list" onCreate={createList} existingCategories={categoriesForModal} />}
      {showNewWhiteboardModal && <CreateItemModal open={showNewWhiteboardModal} onOpenChange={(open) => { setShowNewWhiteboardModal(open); if (!open) fetchAllContent(); }} itemType="whiteboard" onCreate={createWhiteboard} existingCategories={categoriesForModal} />}
      {showNewWireframeModal && <CreateItemModal open={showNewWireframeModal} onOpenChange={(open) => { setShowNewWireframeModal(open); if (!open) fetchAllContent(); }} itemType="wireframe" onCreate={createWireframe} existingCategories={categoriesForModal} />}
      {showNewVaultModal && <CreateItemModal open={showNewVaultModal} onOpenChange={(open) => { setShowNewVaultModal(open); if (!open) fetchAllContent(); }} itemType="vault" onCreate={createVault} existingCategories={categoriesForModal} />}
      {workspaceShareTarget && (
        <ShareModal
          open
          onOpenChange={(open) => {
            if (!open) setWorkspaceShareTarget(null);
          }}
          itemType={workspaceShareTarget.itemType}
          itemId={workspaceShareTarget.itemId}
          itemTitle={workspaceShareTarget.itemTitle}
          onShare={enableSelectedWorkspaceSharing}
          onUnshare={disableSelectedWorkspaceSharing}
          existingShareData={workspaceShareTarget.isPublic && workspaceShareTarget.shareToken
            ? {
                shareToken: workspaceShareTarget.shareToken,
                shareUrl: `${window.location.origin}/shared/${workspaceShareTarget.itemType}/${workspaceShareTarget.shareToken}`,
              }
            : undefined}
          autoGenerate={false}
        />
      )}
      {vaultToShare && (
        <ShareModal
          open
          onOpenChange={(open) => {
            if (!open) setVaultToShare(null);
          }}
          itemType="vault"
          itemId={vaultToShare.id}
          itemTitle={vaultToShare.title || 'Untitled Vault'}
          onShare={enableSelectedVaultSharing}
          onUnshare={disableSelectedVaultSharing}
          existingShareData={vaultToShare.share_token && vaultToShare.is_public
            ? {
                shareToken: vaultToShare.share_token,
                shareUrl: `${window.location.origin}/shared/vault/${vaultToShare.share_token}`,
              }
            : undefined}
          isLocked={vaultToShare.is_locked && !isVaultZke(vaultToShare)}
          showWarning
          autoGenerate={false}
        />
      )}

      {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          onComplete={handleOnboardingComplete}
          onDismiss={handleOnboardingDismiss}
          content={ONBOARDING_CONTENT[onboardingFeatureKey]}
        />
      )}
    </PageLayout>
  );
}

export default ContentsPage;
