import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
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
import { Badge } from '@/components/ui/badge';
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
import { useHeader } from '@/contexts/HeaderContext';
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
  shareVault,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault, Category } from '@/types';
import { useDatabaseCategories } from '@/hooks/useDatabaseCategories';
import ListCard from '@/components/ListCard/ListCard';
import NoteCard from '@/components/NoteCard/NoteCard';
import WhiteboardCard from '@/components/WhiteboardCard/WhiteboardCard';
import WireframeCard from '@/components/WireframeCard/WireframeCard';
import { VaultCard } from '@/components/VaultCard/VaultCard';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { CreateItemModal } from '@/components/CreateItemModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';

type ContentType = 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
type SortOption = 'updated' | 'created' | 'title';
type ViewMode = 'grid' | 'list';

export function ContentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();
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
    if (!token) return;

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

  const handleListShare = useCallback(async (id: string) => {
    try {
      await apiShareList(id, token);
      toast({ title: 'Shared', description: 'List link copied' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to share list',
        variant: 'destructive',
      });
    }
  }, [token, toast]);

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

  const handleNoteShare = useCallback(async (id: number) => {
    try {
      await apiShareNote(id, token);
      toast({ title: 'Shared', description: 'Note link copied' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to share note',
        variant: 'destructive',
      });
    }
  }, [token, toast]);

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
      return null as any;
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
      return null as any;
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
      return null as any;
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

  const handleWhiteboardShare = useCallback(async (id: number) => {
    try {
      await apiShareWhiteboard(id, token);
      toast({ title: 'Shared', description: 'Whiteboard link copied' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to share whiteboard',
        variant: 'destructive',
      });
    }
  }, [token, toast]);

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

  const handleVaultShare = useCallback(async (id: number) => {
    try {
      await shareVault(id, token);
      toast({ title: 'Shared', description: 'Vault link copied' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to share vault',
        variant: 'destructive',
      });
    }
  }, [token, toast]);

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
    await apiCreateNote({ title, content: '', color_value: color, width: 570, height: 350, z_index: 0, position_x: 0, position_y: 0 }, token);
    fetchAllContent();
  };

  const createList = async (title: string, type: string, color: string) => {
    await apiCreateList({ title, type, items: [], position_x: 0, position_y: 0, color_value: color }, token);
    fetchAllContent();
  };

  const createWhiteboard = async (title: string, category: string, color: string) => {
    await apiCreateWhiteboard({ title, color_value: color, position_x: 0, position_y: 0, z_index: 0 }, token);
    fetchAllContent();
  };

  const createWireframe = async (title: string, category: string, color: string) => {
    await apiCreateWireframe({ title, color_value: color, position_x: 0, position_y: 0, z_index: 0 }, token);
    fetchAllContent();
  };

  const createVault = async (title: string, category: string, color: string) => {
    await apiCreateVault({ title, color_value: color, position_x: 0, position_y: 0, z_index: 0 }, token);
    fetchAllContent();
  };

  const categoriesForModal = useMemo(() => {
    return dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }));
  }, [dbCategories]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2">
          <LayoutGrid className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-xl font-semibold italic truncate" style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}>
            CONTENTS
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
          <div className="flex border rounded-md">
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-r-none" onClick={() => setViewMode('list')}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-l-none" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
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
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="list">Lists</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="whiteboard">Whiteboards</SelectItem>
              <SelectItem value="wireframe">Wireframes</SelectItem>
              <SelectItem value="vault">Vaults</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background" style={{ fontFamily: '"Raleway", sans-serif' }} />
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-light" onClick={() => navigate('/canvas')}>
            <Map className="h-4 w-4 mr-2" />
            Canvas
          </Button>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [theme, navigate, setHeaderContent, viewMode, typeFilter, categoryFilter, searchQuery, sortBy, uniqueCategories]);

  const totalItems = filteredAndSortedLists.length + filteredAndSortedNotes.length + filteredAndSortedWhiteboards.length + filteredAndSortedWireframes.length + filteredAndSortedVaults.length;

  return (
    <>
      <MobileControlsBar className="flex-col items-stretch gap-3">
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
              <SelectItem value="all">All</SelectItem>
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
              <SelectItem value="all">All</SelectItem>
              {uniqueCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex border rounded-md">
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-r-none" onClick={() => setViewMode('list')}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-9 px-3 rounded-l-none" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </MobileControlsBar>

      <div className="flex flex-col h-full">
        <div className="hidden md:flex justify-end mb-4">
          <span className="text-sm text-muted-foreground">{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
        </div>

        {loading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
            {[...Array(8)].map((_, i) => <Skeleton key={i} className={viewMode === 'grid' ? 'h-32' : 'h-16'} />)}
          </div>
        ) : totalItems === 0 ? (
          <Card className="m-4">
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <LayoutGrid className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No content</h3>
              <p className="text-muted-foreground mb-4">Get started by creating content</p>
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
            </CardContent>
          </Card>
        ) : (
          <div className="flex-1 space-y-6 px-4 overflow-y-auto">
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
                      onShare={() => {}}
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
      </div>

      {showNewNoteModal && <CreateItemModal open={showNewNoteModal} onOpenChange={(open) => { setShowNewNoteModal(open); if (!open) fetchAllContent(); }} itemType="note" onCreate={(_, __, color) => createNote('', '', color)} position={{ x: 0, y: 0 }} existingCategories={categoriesForModal} />}
      {showNewListModal && <CreateItemModal open={showNewListModal} onOpenChange={(open) => { setShowNewListModal(open); if (!open) fetchAllContent(); }} itemType="list" onCreate={createList} position={{ x: 0, y: 0 }} existingCategories={categoriesForModal} />}
      {showNewWhiteboardModal && <CreateItemModal open={showNewWhiteboardModal} onOpenChange={(open) => { setShowNewWhiteboardModal(open); if (!open) fetchAllContent(); }} itemType="whiteboard" onCreate={createWhiteboard} position={{ x: 0, y: 0 }} existingCategories={categoriesForModal} />}
      {showNewWireframeModal && <CreateItemModal open={showNewWireframeModal} onOpenChange={(open) => { setShowNewWireframeModal(open); if (!open) fetchAllContent(); }} itemType="wireframe" onCreate={createWireframe} position={{ x: 0, y: 0 }} existingCategories={categoriesForModal} />}
      {showNewVaultModal && <CreateItemModal open={showNewVaultModal} onOpenChange={(open) => { setShowNewVaultModal(open); if (!open) fetchAllContent(); }} itemType="vault" onCreate={createVault} position={{ x: 0, y: 0 }} existingCategories={categoriesForModal} />}

      {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          onComplete={handleOnboardingComplete}
          onDismiss={handleOnboardingDismiss}
          content={ONBOARDING_CONTENT[onboardingFeatureKey]}
        />
      )}
    </>
  );
}

export default ContentsPage;