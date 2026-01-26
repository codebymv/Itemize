import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Search, Plus, Filter, Palette, CheckSquare, StickyNote, Map, GitBranch, KeyRound } from 'lucide-react';
import { CanvasContainer, CanvasContainerMethods } from '../components/Canvas/CanvasContainer';
import { ContextMenu } from '../components/Canvas/ContextMenu';
import {
  fetchCanvasLists,
  createList as apiCreateList,
  updateList as apiUpdateList,
  updateListPosition as apiUpdateListPosition,
  deleteList as apiDeleteList,
  getNotes,
  createNote as apiCreateNote,
  updateNote as apiUpdateNote,
  deleteNote as apiDeleteNote,
  CreateNotePayload,
  getWhiteboards,
  createWhiteboard as apiCreateWhiteboard,
  updateWhiteboard as apiUpdateWhiteboard,
  updateWhiteboardPosition as apiUpdateWhiteboardPosition,
  deleteWhiteboard as apiDeleteWhiteboard,
  CreateWhiteboardPayload,
  getWireframes,
  createWireframe as apiCreateWireframe,
  updateWireframe as apiUpdateWireframe,
  updateWireframePosition as apiUpdateWireframePosition,
  deleteWireframe as apiDeleteWireframe,
  CreateWireframePayload,
  getVaults,
  createVault as apiCreateVault,
  updateVault as apiUpdateVault,
  updateVaultPosition as apiUpdateVaultPosition,
  deleteVault as apiDeleteVault,
  shareVault as apiShareVault,
  unshareVault as apiUnshareVault,
  CreateVaultPayload,
  updateCategory as apiUpdateCategory
} from '../services/api';
import { List, Note, Whiteboard, Wireframe, Vault } from '../types';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

import { useToast } from "../hooks/use-toast";
import CreateListModal from "../components/CreateListModal";
import CreateNoteModal from "../components/CreateNoteModal";
import { ListCard } from "../components/ListCard";
import { useAuth } from "../contexts/AuthContext";
import { NoteCard } from '../components/NoteCard';
import { WhiteboardCard } from '../components/WhiteboardCard';
import { NewNoteModal } from '../components/NewNoteModal';
import { NewListModal } from '../components/NewListModal';
import { NewWhiteboardModal } from '../components/NewWhiteboardModal';
import { NewWireframeModal } from '../components/NewWireframeModal';
import { NewVaultModal } from '../components/NewVaultModal';
import { ShareListModal } from '../components/ShareListModal';
import { ShareNoteModal } from '../components/ShareNoteModal';
import { ShareWhiteboardModal } from '../components/ShareWhiteboardModal';
import { ShareVaultModal } from '../components/ShareVaultModal';
import { useDatabaseCategories } from '../hooks/useDatabaseCategories';
import { useIsMobile } from '../hooks/use-mobile';
import { logger } from '../lib/logger';
import api, { getApiUrl } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import { useHeader } from '../contexts/HeaderContext';

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const CanvasPage: React.FC = () => {
  const { theme } = useTheme();
  // Use the header context to set the header content
  const { setHeaderContent } = useHeader();
  const location = useLocation();


  const [lists, setLists] = useState<List[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Unified loading states
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingWhiteboards, setLoadingWhiteboards] = useState(true);
  const [loadingWireframes, setLoadingWireframes] = useState(true);
  const [loadingVaults, setLoadingVaults] = useState(true);
  const isLoading = loadingLists || loadingNotes || loadingWhiteboards || loadingWireframes || loadingVaults;
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const isMobileView = useIsMobile();
  const [activeMobileMenu, setActiveMobileMenu] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [newNoteInitialPosition, setNewNoteInitialPosition] = useState<{ x: number, y: number } | null>(null);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListInitialPosition, setNewListInitialPosition] = useState<{ x: number, y: number } | null>(null);
  const [showNewWhiteboardModal, setShowNewWhiteboardModal] = useState(false);
  const [newWhiteboardInitialPosition, setNewWhiteboardInitialPosition] = useState<{ x: number, y: number } | null>(null);
  const [showNewWireframeModal, setShowNewWireframeModal] = useState(false);
  const [newWireframeInitialPosition, setNewWireframeInitialPosition] = useState<{ x: number, y: number } | null>(null);
  const [showNewVaultModal, setShowNewVaultModal] = useState(false);
  const [newVaultInitialPosition, setNewVaultInitialPosition] = useState<{ x: number, y: number } | null>(null);

  // Sharing modal states
  const [showShareListModal, setShowShareListModal] = useState(false);
  const [showShareNoteModal, setShowShareNoteModal] = useState(false);
  const [showShareWhiteboardModal, setShowShareWhiteboardModal] = useState(false);
  const [showShareVaultModal, setShowShareVaultModal] = useState(false);
  const [currentShareItem, setCurrentShareItem] = useState<{ id: string | number; title: string; isLocked?: boolean; shareData?: { shareToken: string; shareUrl: string } } | null>(null);

  const { toast } = useToast();
  const { token } = useAuth();

  // WebSocket state for real-time updates
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // State for Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [errorNotes, setErrorNotes] = useState<string | null>(null);

  // State for Whiteboards
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [errorWhiteboards, setErrorWhiteboards] = useState<string | null>(null);

  // State for Wireframes
  const [wireframes, setWireframes] = useState<Wireframe[]>([]);
  const [errorWireframes, setErrorWireframes] = useState<string | null>(null);

  // State for Vaults
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [errorVaults, setErrorVaults] = useState<string | null>(null);

  // Database-backed category management
  const {
    categories: dbCategories,
    categoryNames,
    loading: categoriesLoading,
    addCategory,
    editCategory: updateCategoryInDB,
    refreshCategories,
    isCategoryInUse,
    getCategoryByName
  } = useDatabaseCategories();

  // Create editCategory function for updating existing categories
  const editCategory = async (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => {
    try {
      const existingCategory = getCategoryByName(categoryName);
      if (!existingCategory) {
        throw new Error(`Category "${categoryName}" not found`);
      }

      // Use the hook's editCategory method which properly manages state and triggers refreshes
      const updatedCategory = await updateCategoryInDB(existingCategory.id, {
        name: updatedData.name || existingCategory.name,
        color_value: updatedData.color_value || existingCategory.color_value
      });

      if (!updatedCategory) {
        throw new Error('Failed to update category');
      }

      logger.log('Category updated successfully:', updatedCategory);

      // If color was updated, cascade the change to all linked items
      if (updatedData.color_value) {
        const newColor = updatedData.color_value;

        // Update all lists that belong to this category
        const listsToUpdate = lists.filter(list => (list.type || 'General') === categoryName);
        const failedListIds: string[] = [];

        for (const list of listsToUpdate) {
          try {
            await updateList({ ...list, color_value: newColor });
          } catch (error: any) {
            console.error(`Failed to update list ${list.id} color:`, error);

            // If it's a 404 error, the list no longer exists in the backend
            // Remove it from the frontend state to prevent future errors
            if (error?.response?.status === 404 || error?.status === 404) {
              logger.warn(`List ${list.id} no longer exists in backend, removing from frontend state`);
              failedListIds.push(list.id);
            }
          }
        }

        // Remove any lists that no longer exist in the backend
        if (failedListIds.length > 0) {
          setLists(prev => prev.filter(list => !failedListIds.includes(list.id)));
          console.log(`Removed ${failedListIds.length} stale list(s) from frontend state:`, failedListIds);
        }

        // Update all notes that belong to this category
        const notesToUpdate = notes.filter(note => (note.category || 'General') === categoryName);
        for (const note of notesToUpdate) {
          try {
            await handleUpdateNote(note.id, { color_value: newColor });
          } catch (error) {
            console.error(`Failed to update note ${note.id} color:`, error);
          }
        }

        // Update all whiteboards that belong to this category
        const whiteboardsToUpdate = whiteboards.filter(whiteboard => (whiteboard.category || 'General') === categoryName);
        for (const whiteboard of whiteboardsToUpdate) {
          try {
            await handleUpdateWhiteboard(whiteboard.id, { color_value: newColor });
          } catch (error) {
            console.error(`Failed to update whiteboard ${whiteboard.id} color:`, error);
          }
        }

        // Color change completed silently - no toast needed
        logger.log(`Category "${categoryName}" and ${listsToUpdate.length + notesToUpdate.length + whiteboardsToUpdate.length} linked items updated successfully.`);
      }

      // The useDatabaseCategories hook should automatically refresh its state
      // If it doesn't, we may need to implement a refresh mechanism in the hook

    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: 'Error',
        description: `Failed to update category "${categoryName}". Please try again.`,
        variant: 'destructive',
      });
    }
  };

  // Wrapper function to match NewListModal's expected signature
  const updateCategoryColor = (categoryName: string, newColor: string) => {
    editCategory(categoryName, { color_value: newColor });
  };

  // Convert database categories to old format for compatibility
  const categories = dbCategories.map(cat => ({
    name: cat.name,
    listCount: 0,
    noteCount: 0,
    totalCount: 0
  }));

  // Get unique categories from all content types
  const getUniqueCategories = useMemo(() => {
    const listCategories = lists.map(list => list.type || 'General').filter(Boolean);
    const noteCategories = notes.map(note => note.category || 'General').filter(Boolean);
    const whiteboardCategories = whiteboards.map(wb => wb.category || 'General').filter(Boolean);
    const wireframeCategories = wireframes.map(wf => wf.category || 'General').filter(Boolean);
    const vaultCategories = vaults.map(v => v.category || 'General').filter(Boolean);
    const allCategories = Array.from(new Set([...listCategories, ...noteCategories, ...whiteboardCategories, ...wireframeCategories, ...vaultCategories]));
    return ['all', ...allCategories];
  }, [lists, notes, whiteboards, wireframes, vaults]);

  // Get filter counts for each category
  const getCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 
      all: lists.length + notes.length + whiteboards.length + wireframes.length + vaults.length
    };
    
    lists.forEach(list => {
      const category = list.type || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    notes.forEach(note => {
      const category = note.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    whiteboards.forEach(whiteboard => {
      const category = whiteboard.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    wireframes.forEach(wireframe => {
      const category = wireframe.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    vaults.forEach(vault => {
      const category = vault.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    return counts;
  }, [lists, notes, whiteboards, wireframes, vaults]);

  // Filter function for backward compatibility
  const filterByCategory = (categoryFilter: string | null) => {
    // Ensure arrays are always defined (handle null/undefined)
    const safeLists = Array.isArray(lists) ? lists : [];
    const safeNotes = Array.isArray(notes) ? notes : [];
    const safeWhiteboards = Array.isArray(whiteboards) ? whiteboards : [];
    const safeWireframes = Array.isArray(wireframes) ? wireframes : [];

    if (!categoryFilter || categoryFilter === 'all') {
      return { filteredLists: safeLists, filteredNotes: safeNotes, filteredWhiteboards: safeWhiteboards, filteredWireframes: safeWireframes };
    }

    const filteredLists = safeLists.filter(list => (list.type || 'General') === categoryFilter);
    const filteredNotes = safeNotes.filter(note => (note.category || 'General') === categoryFilter);
    const filteredWhiteboards = safeWhiteboards.filter(whiteboard => (whiteboard.category || 'General') === categoryFilter);
    const filteredWireframes = safeWireframes.filter(wireframe => (wireframe.category || 'General') === categoryFilter);

    return { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes };
  };

  // Reference to canvas container methods
  const canvasMethodsRef = useRef<CanvasContainerMethods | null>(null);

  // Track recently created list IDs to prevent WebSocket duplicates
  const recentlyCreatedListIds = useRef<Set<string>>(new Set());

  // Button context menu state (separate from canvas context menu)
  const [showButtonContextMenu, setShowButtonContextMenu] = useState(false);
  const [buttonMenuPosition, setButtonMenuPosition] = useState({ x: 0, y: 0 });

  // Header content effect - Pushes search bar and controls to the AppShell header
  useEffect(() => {
    let subTitle = '';
    if (location.pathname.includes('/contents')) subTitle = ' | Contents';
    else if (location.pathname.includes('/shared')) subTitle = ' | Shared';
    else subTitle = ' | Canvas';

    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2">
          <Map className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-xl font-semibold italic truncate" style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}>
            WORKSPACE{subTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 ml-4 flex-1 justify-end mr-4">
          {/* Type filter */}
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50 hidden sm:flex">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="list">
                <div className="flex items-center">
                  <CheckSquare className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
                  <span>Lists</span>
                </div>
              </SelectItem>
              <SelectItem value="note">
                <div className="flex items-center">
                  <StickyNote className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
                  <span>Notes</span>
                </div>
              </SelectItem>
              <SelectItem value="whiteboard">
                <div className="flex items-center">
                  <Palette className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
                  <span>Whiteboards</span>
                </div>
              </SelectItem>
              <SelectItem value="wireframe">
                <div className="flex items-center">
                  <GitBranch className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
                  <span>Wireframes</span>
                </div>
              </SelectItem>
              <SelectItem value="vault">
                <div className="flex items-center">
                  <KeyRound className="h-4 w-4 mr-2 transition-colors group-hover/item:text-blue-600" />
                  <span>Vaults</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
            <SelectTrigger className="w-[180px] h-9 bg-muted/20 border-border/50 hidden sm:flex">
              <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue placeholder="Category">
                {categoryFilter === 'all' ? 'All Categories' : categoryFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {getUniqueCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === 'all' ? 'All Categories' : category} ({getCategoryCounts[category] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Desktop search */}
          <div className="relative hidden sm:block w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search canvas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            />
          </div>

          {/* New Button */}
          <Button
            id="new-canvas-button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (showButtonContextMenu) {
                setShowButtonContextMenu(false);
              } else {
                const buttonElement = document.getElementById('new-canvas-button');
                if (buttonElement) {
                  const rect = buttonElement.getBoundingClientRect();
                  setButtonMenuPosition({
                    x: rect.left + rect.width / 2,
                    y: rect.bottom + 5
                  });
                  setShowButtonContextMenu(true);
                }
              }
            }}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>
    );

    return () => setHeaderContent(null);
  }, [searchQuery, typeFilter, categoryFilter, theme, showButtonContextMenu, setHeaderContent, location.pathname, getUniqueCategories, getCategoryCounts]);

  // Collapsible state management - persists across filter changes
  const [collapsedListIds, setCollapsedListIds] = useState<Set<string>>(new Set());
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<Set<number>>(new Set());
  const [collapsedWhiteboardIds, setCollapsedWhiteboardIds] = useState<Set<number>>(new Set());

  // Note: Race condition prevention refs removed since WebSocket creation events are disabled

  // Utility function for intelligent positioning of mobile-created items
  const getIntelligentPosition = () => {
    const centerX = 2000; // Canvas center X coordinate
    const centerY = 2000; // Canvas center Y coordinate  
    const baseSpreadRadius = 300; // Base random spread area around center
    const itemWidth = 390; // Approximate width of list/note cards
    const itemHeight = 295; // Approximate height of list/note cards (accounting for headers)
    const minDistance = 50; // Minimum distance between items

    // Get all existing positions from lists, notes, whiteboards, and wireframes
    const existingPositions: Array<{ x: number; y: number }> = [
      ...lists.map(list => ({ x: list.position_x || 0, y: list.position_y || 0 })),
      ...notes.map(note => ({ x: note.position_x, y: note.position_y })),
      ...whiteboards.map(whiteboard => ({ x: whiteboard.position_x, y: whiteboard.position_y })),
      ...wireframes.map(wireframe => ({ x: wireframe.position_x, y: wireframe.position_y }))
    ];

    // Function to check if a position overlaps with existing items
    const hasOverlap = (newX: number, newY: number): boolean => {
      return existingPositions.some(pos => {
        const distanceX = Math.abs(newX - pos.x);
        const distanceY = Math.abs(newY - pos.y);
        return distanceX < (itemWidth + minDistance) && distanceY < (itemHeight + minDistance);
      });
    };

    // Try to find a non-overlapping position
    let attempts = 0;
    const maxAttempts = 20;
    let position;

    do {
      const spreadRadius = baseSpreadRadius + (attempts * 50); // Increase spread radius with each attempt
      const randomX = (Math.random() - 0.5) * spreadRadius * 2;
      const randomY = (Math.random() - 0.5) * spreadRadius * 2;

      position = {
        x: centerX + randomX,
        y: centerY + randomY
      };

      attempts++;
    } while (hasOverlap(position.x, position.y) && attempts < maxAttempts);

    return position;
  };

  // Helper functions for managing collapsible state
  const isListCollapsed = (listId: string) => collapsedListIds.has(listId);
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

  // Create stable toggle callbacks for each list to prevent unnecessary re-renders
  const listToggleCallbacks = useMemo(() => {
    const callbacks: Record<string, () => void> = {};
    lists.forEach(list => {
      callbacks[list.id] = () => toggleListCollapsed(list.id);
    });
    return callbacks;
  }, [lists.map(l => l.id).join(','), toggleListCollapsed]);

  const isNoteCollapsed = (noteId: number) => collapsedNoteIds.has(noteId);
  const toggleNoteCollapsed = (noteId: number) => {
    setCollapsedNoteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const isWhiteboardCollapsed = (whiteboardId: number) => collapsedWhiteboardIds.has(whiteboardId);
  const toggleWhiteboardCollapsed = (whiteboardId: number) => {
    setCollapsedWhiteboardIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(whiteboardId)) {
        newSet.delete(whiteboardId);
      } else {
        newSet.add(whiteboardId);
      }
      return newSet;
    });
  };

  // Filter data based on type filter
  const filteredData = useMemo(() => {
    if (typeFilter === 'all') {
      return {
        filteredLists: lists,
        filteredNotes: notes,
        filteredWhiteboards: whiteboards,
        filteredWireframes: wireframes,
        filteredVaults: vaults,
      };
    }

    return {
      filteredLists: typeFilter === 'list' ? lists : [],
      filteredNotes: typeFilter === 'note' ? notes : [],
      filteredWhiteboards: typeFilter === 'whiteboard' ? whiteboards : [],
      filteredWireframes: typeFilter === 'wireframe' ? wireframes : [],
      filteredVaults: typeFilter === 'vault' ? vaults : [],
    };
  }, [typeFilter, lists, notes, whiteboards, wireframes, vaults]);

  // Fetch lists on component mount
  useEffect(() => {
    const getLists = async () => {
      try {
        setLoadingLists(true);
        setError(null);
        const fetchedLists = await fetchCanvasLists(token);
        setLists(Array.isArray(fetchedLists) ? fetchedLists : []);

        // Categories are now managed by useUnifiedCategories hook
      } catch (error) {
        console.error('Error fetching lists:', error);
        setError('Failed to load lists. Please try again.');
      } finally {
        setLoadingLists(false);
      }
    };

    getLists();
  }, [token, toast]); // Ensure token and toast are in dependency array if used inside like in notes fetcher

  // Fetch notes on component mount
  useEffect(() => {
    const fetchNotesData = async () => {
      try {
        setLoadingNotes(true);
        setErrorNotes(null);
        const response = await getNotes(token);
        // API returns { notes: [...], pagination: {...} }
        const fetchedNotes = response?.notes || response || [];
        setNotes(Array.isArray(fetchedNotes) ? fetchedNotes : []);
      } catch (err) {
        console.error('Error fetching notes:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load notes. Please try again.';
        setErrorNotes(errorMessage);
        toast({ title: "Error", description: "Failed to fetch notes", variant: "destructive" });
      } finally {
        setLoadingNotes(false);
      }
    };

    if (token) { // Only fetch if authenticated
      fetchNotesData();
    }
  }, [token, toast]); // Re-fetch if token changes, include toast in dependencies

  // Fetch whiteboards on component mount
  useEffect(() => {
    const fetchWhiteboardsData = async () => {
      try {
        setLoadingWhiteboards(true);
        setErrorWhiteboards(null);
        const response = await getWhiteboards(token);
        // API returns { whiteboards: [...], pagination: {...} }
        const fetchedWhiteboards = response?.whiteboards || response || [];
        setWhiteboards(Array.isArray(fetchedWhiteboards) ? fetchedWhiteboards : []);
      } catch (err) {
        console.error('Error fetching whiteboards:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load whiteboards. Please try again.';
        setErrorWhiteboards(errorMessage);
        toast({ title: "Error", description: "Failed to fetch whiteboards", variant: "destructive" });
      } finally {
        setLoadingWhiteboards(false);
      }
    };

    if (token) { // Only fetch if authenticated
      fetchWhiteboardsData();
    }
  }, [token, toast]); // Re-fetch if token changes, include toast in dependencies

  // Fetch wireframes on component mount
  useEffect(() => {
    const fetchWireframesData = async () => {
      try {
        setLoadingWireframes(true);
        setErrorWireframes(null);
        const response = await getWireframes(token);
        const fetchedWireframes = response?.wireframes || response || [];
        setWireframes(Array.isArray(fetchedWireframes) ? fetchedWireframes : []);
      } catch (err) {
        console.error('Error fetching wireframes:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load wireframes. Please try again.';
        setErrorWireframes(errorMessage);
        toast({ title: "Error", description: "Failed to fetch wireframes", variant: "destructive" });
      } finally {
        setLoadingWireframes(false);
      }
    };

    if (token) {
      fetchWireframesData();
    }
  }, [token, toast]);

  // Fetch vaults on component mount
  useEffect(() => {
    const fetchVaultsData = async () => {
      try {
        setLoadingVaults(true);
        setErrorVaults(null);
        const response = await getVaults(token);
        const fetchedVaults = response?.vaults || response || [];
        setVaults(Array.isArray(fetchedVaults) ? fetchedVaults : []);
      } catch (err) {
        console.error('Error fetching vaults:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load vaults. Please try again.';
        setErrorVaults(errorMessage);
        toast({ title: "Error", description: "Failed to fetch vaults", variant: "destructive" });
      } finally {
        setLoadingVaults(false);
      }
    };

    if (token) {
      fetchVaultsData();
    }
  }, [token, toast]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!token) return;

    const BACKEND_URL = getApiUrl();
    console.log('Canvas: Connecting to WebSocket at:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      logger.log('Canvas: WebSocket connected, joining user canvas');
      setIsConnected(true);
      newSocket.emit('joinUserCanvas', { token });
    });

    newSocket.on('disconnect', () => {
      logger.log('Canvas: WebSocket disconnected');
      setIsConnected(false);
    });

    newSocket.on('joinedUserCanvas', (data) => {
      console.log('Canvas: Successfully joined user canvas:', data);

      // Send a test ping to verify connection
      console.log('Canvas: Sending test ping');
      newSocket.emit('testPing', { message: 'Hello from canvas' });
    });

    // Add debugging for all WebSocket events
    newSocket.onAny((eventName, ...args) => {
      logger.log('Canvas: Received WebSocket event:', eventName, args);
    });

    // Listen for test pong
    newSocket.on('testPong', (data) => {
      logger.log('Canvas: Received test pong:', data);
    });

    // Listen for real-time list updates
    // Note: WebSocket list update events removed to prevent conflicts with API-first approach
    // This eliminates the double-update issue that was causing UI flashing
    // Lists are now updated only through direct API calls for consistency

    // Listen for real-time wireframe updates (node text/flow changes)
    newSocket.on('userWireframeUpdated', (update) => {
      const updated = update?.data;
      if (!updated?.id) return;
      setWireframes(prev =>
        prev.map(wireframe =>
          wireframe.id === updated.id ? { ...wireframe, ...updated } : wireframe
        )
      );
    });

    newSocket.on('error', (error) => {
      console.error('Canvas: WebSocket error:', error);
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect to real-time updates",
        variant: "destructive",
      });
    });

    setSocket(newSocket);

    return () => {
      console.log('Canvas: Cleaning up WebSocket connection');
      newSocket.disconnect();
    };
  }, [token, toast]);

  // Handle clicking outside button context menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showButtonContextMenu) {
        const target = event.target as HTMLElement;
        // Don't close if clicking on the button itself or the context menu
        if (!target.closest('#new-canvas-button') && !target.closest('.context-menu')) {
          setShowButtonContextMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showButtonContextMenu]);

  // CRUD operations for Notes
  const handleCreateNote = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      // Check if the category exists, if not create it
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const payloadWithDefaults: CreateNotePayload = {
        title: title, // Set the note title properly
        content: '', // Initialize with empty content
        color_value: color, // Use selected color
        position_x: position.x,
        position_y: position.y,
        width: 570, // Wider to accommodate rich text toolbar
        height: 350, // Taller for better content editing
        z_index: 0,
      };

      const newNote = await apiCreateNote(payloadWithDefaults, token);
      setNotes(prev => [newNote, ...prev]);

      // Category is now managed by unified category system

      setShowNewNoteModal(false);
    } catch (error) {
      console.error('Failed to create note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your note. Please try again.';
      toast({
        title: "Error",
        description: "Failed to create note",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleUpdateNote = async (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => {
    // Save original state for potential rollback
    const originalNotes = [...notes];

    // Optimistic update - update UI immediately for smooth UX
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updatedData } : n));

    try {
      const updatedNote = await apiUpdateNote(noteId, updatedData, token);
      // Update with the authoritative API response (in case server made changes)
      setNotes(prev => prev.map(n => n.id === noteId ? updatedNote : n));
      return updatedNote;
    } catch (error) {
      console.error('Failed to update note:', error);
      // Rollback to original state on error
      setNotes(originalNotes);
      toast({
        title: "Error",
        description: "Failed to update note",
        variant: "destructive"
      });
      return null;
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      logger.log(`🗑️ Frontend: Attempting to delete note ${noteId}`);
      logger.log(`🔑 Frontend: Using token: ${token ? 'Present' : 'Missing'}`);

      const result = await apiDeleteNote(noteId, token);
      console.log(`✅ Frontend: Delete API response:`, result);

      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast({
        title: "Note deleted",
        description: "Your note has been successfully removed.",
      });
      return true;
    } catch (error) {
      console.error('❌ Frontend: Failed to delete note:', error);
      console.error('❌ Frontend: Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        status: (error as any)?.response?.status,
        data: (error as any)?.response?.data
      });

      const errorMessage = error instanceof Error ? error.message : 'Could not delete your note. Please try again.';
      toast({
        title: "Error",
        description: "Failed to delete note",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  // CRUD operations for Whiteboards
  const handleCreateWhiteboard = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      // Check if the category exists, if not create it
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const payloadWithDefaults: CreateWhiteboardPayload = {
        title: title, // Set the whiteboard title
        category: category, // Use selected category
        canvas_data: '{"paths": [], "shapes": []}', // Empty canvas
        canvas_width: 750, // Wide enough to show all toolbar controls with extra room
        canvas_height: 620, // Default size - accounts for header/footer space (620-120=500 usable)
        background_color: '#FFFFFF', // White background
        position_x: position.x,
        position_y: position.y,
        z_index: 0,
        color_value: color, // Border color
      };
      logger.log('handleCreateWhiteboard payload:', payloadWithDefaults);

      const newWhiteboard = await apiCreateWhiteboard(payloadWithDefaults, token);
      setWhiteboards(prev => [newWhiteboard, ...prev]);

      // Removed success toast - no need to distract user for routine whiteboard creation
    } catch (error) {
      console.error('Failed to create whiteboard:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your whiteboard. Please try again.';
      toast({
        title: "Error",
        description: "Failed to create whiteboard",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleUpdateWhiteboard = async (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    // Save original state for potential rollback
    const originalWhiteboards = [...whiteboards];

    // Optimistic update - update UI immediately for smooth UX
    setWhiteboards(prev => prev.map(w => w.id === whiteboardId ? { ...w, ...updatedData } : w));

    try {
      console.log('🎨 CanvasPage: Updating whiteboard:', {
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

      // Update with the authoritative API response (in case server made changes)
      setWhiteboards(prev => prev.map(w => w.id === whiteboardId ? updatedWhiteboard : w));
      return updatedWhiteboard;
    } catch (error) {
      console.error('Failed to update whiteboard:', error);
      // Rollback to original state on error
      setWhiteboards(originalWhiteboards);
      const errorMessage = error instanceof Error ? error.message : 'Could not update your whiteboard. Please try again.';
      toast({
        title: "Error",
        description: "Failed to update whiteboard",
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
      console.error('Failed to delete whiteboard:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not delete your whiteboard. Please try again.';
      toast({
        title: "Error",
        description: "Failed to delete whiteboard",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  // CRUD operations for Wireframes
  const handleCreateWireframe = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      // Check if the category exists, if not create it
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
    } catch (error) {
      console.error('Failed to create wireframe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your wireframe. Please try again.';
      toast({
        title: "Error",
        description: "Failed to create wireframe",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleUpdateWireframe = async (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    const originalWireframes = [...wireframes];

    // Optimistic update
    setWireframes(prev => prev.map(w => w.id === wireframeId ? { ...w, ...updatedData } : w));

    try {
      const updatedWireframe = await apiUpdateWireframe(wireframeId, updatedData, token);
      setWireframes(prev => prev.map(w => w.id === wireframeId ? updatedWireframe : w));
      return updatedWireframe;
    } catch (error) {
      console.error('Failed to update wireframe:', error);
      setWireframes(originalWireframes);
      const errorMessage = error instanceof Error ? error.message : 'Could not update your wireframe. Please try again.';
      toast({
        title: "Error",
        description: "Failed to update wireframe",
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
      console.error('Failed to delete wireframe:', error);
      toast({
        title: "Error",
        description: "Failed to delete wireframe",
        variant: "destructive"
      });
      return false;
    }
  };

  const handleWireframePositionChange = async (wireframeId: number, newPosition: { x: number; y: number }) => {
    try {
      await apiUpdateWireframePosition(wireframeId, newPosition.x, newPosition.y, token);
      setWireframes(prev => prev.map(w => w.id === wireframeId ? { ...w, position_x: newPosition.x, position_y: newPosition.y } : w));
    } catch (error) {
      console.error('Failed to update wireframe position:', error);
    }
  };

  // CRUD operations for vaults
  const handleCreateVault = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    try {
      // Check if the category exists, if not create it
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
    } catch (error) {
      console.error('Failed to create vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create your vault. Please try again.';
      toast({
        title: "Error",
        description: "Failed to create vault",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleUpdateVault = async (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    const originalVaults = [...vaults];

    // Optimistic update
    setVaults(prev => prev.map(v => v.id === vaultId ? { ...v, ...updatedData } : v));

    try {
      const updatedVault = await apiUpdateVault(vaultId, updatedData, token);
      setVaults(prev => prev.map(v => v.id === vaultId ? updatedVault : v));
      return updatedVault;
    } catch (error) {
      console.error('Failed to update vault:', error);
      setVaults(originalVaults);
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
      console.error('Failed to delete vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not delete your vault. Please try again.';
      toast({
        title: "Error",
        description: "Failed to delete vault",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  const handleVaultPositionChange = async (vaultId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => {
    try {
      // Update position
      await apiUpdateVaultPosition(vaultId, newPosition.x, newPosition.y, token);
      
      // If size was changed, update that too
      if (newSize) {
        await apiUpdateVault(vaultId, { width: newSize.width, height: newSize.height }, token);
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
    } catch (error) {
      console.error('Failed to update vault position:', error);
    }
  };

  // Vault sharing handlers
  const handleShareVault = async (vaultId: number) => {
    try {
      const result = await apiShareVault(vaultId, token);
      // Update local state with share data
      setVaults(prev => prev.map(v => v.id === vaultId 
        ? { ...v, share_token: result.shareToken, is_public: true, shared_at: new Date().toISOString() } 
        : v
      ));
      return result;
    } catch (error) {
      console.error('Failed to share vault:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not share your vault. Please try again.';
      toast({
        title: "Error",
        description: "Failed to share vault",
        description: errorMessage,
        variant: "destructive"
      });
      throw error;
    }
  };

  const handleUnshareVault = async (vaultId: number) => {
    try {
      await apiUnshareVault(vaultId, token);
      // Update local state
      setVaults(prev => prev.map(v => v.id === vaultId 
        ? { ...v, is_public: false } 
        : v
      ));
    } catch (error) {
      console.error('Failed to unshare vault:', error);
      toast({
        title: "Error",
        description: "Failed to revoke share",
        variant: "destructive"
      });
      throw error;
    }
  };

  // CRUD operations for lists (used by mobile view)
  const createList = async (title: string, type: string, color: string) => {
    try {
      const position = getIntelligentPosition();

      // Check if the category exists, if not create it
      if (!isCategoryInUse(type) && type !== 'General') {
        await addCategory({ name: type, color_value: color });
      }

      const response = await apiCreateList({
        title,
        type,
        items: [],
        position_x: position.x,
        position_y: position.y
      }, token);

      // Handle the response properly based on the API response structure
      const newList: List = {
        id: response.id,
        title: response.title,
        type: response.type || 'General', // Use the type field directly
        items: response.items || [], // Ensure items is an array
        createdAt: new Date(response.createdAt),
        position_x: response.position_x || position.x, // Ensure position is set
        position_y: response.position_y || position.y,
        // Add any other required List properties
      };

      // Track the created list ID to prevent WebSocket duplicates
      recentlyCreatedListIds.current.add(newList.id);
      console.log('📝 Mobile Creation: Tracking list ID to prevent duplicates:', newList.id);

      // Remove from tracking after a short delay
      setTimeout(() => {
        recentlyCreatedListIds.current.delete(newList.id);
        logger.log('📝 Mobile Creation: Stopped tracking list ID:', newList.id);
      }, 2000);

      setLists(prev => [newList, ...prev]);
      setShowCreateModal(false);

      // Update categories if needed
      // Category is now managed by unified category system

      // Removed success toast - no need to distract user for routine list creation
    } catch (error) {
      console.error('Failed to create list:', error);
      toast({
        title: "Error",
        description: "Failed to create list",
        description: "Could not create your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const updateList = async (updatedList: List) => {
    try {
      // Make API call first (like Prototype2 approach)
      const updatedListFromAPI = await apiUpdateList(updatedList, token);

      // Transform API response to match frontend List interface
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

      // Update local state only after successful API call
      setLists(prev =>
        prev.map(list => list.id === updatedList.id ? transformedList : list)
      );

    } catch (error: any) {
      console.error('Failed to update list:', error);

      // If it's a 404 error, the list no longer exists in the backend
      if (error?.response?.status === 404 || error?.status === 404) {
        console.warn(`List ${updatedList.id} no longer exists in backend, removing from frontend state`);
        setLists(prev => prev.filter(list => list.id !== updatedList.id));
        toast({
          title: "List no longer exists",
          description: "This list has been removed as it no longer exists.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update list",
          description: "Could not update your list. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const deleteList = async (listId: string): Promise<boolean> => {
    try {
      // Make API call first (like Prototype2 approach)
      await apiDeleteList(listId, token);

      // Update local state only after successful API call
      setLists(prev => prev.filter(list => list.id !== listId));

      toast({
        title: "List deleted",
        description: "Your list has been successfully removed.",
      });

      return true;
    } catch (error) {
      console.error('Failed to delete list:', error);
      toast({
        title: "Error",
        description: "Failed to delete list",
        variant: "destructive"
      });

      return false;
    }
  };

  // Desktop list creation function (matches notes/whiteboards pattern)
  const handleCreateList = async (title: string, type: string, color: string, position: { x: number; y: number }) => {
    try {
      // Check if the category exists, if not create it
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

      // Handle the response properly based on the API response structure
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

      // Update UI state after successful API call
      setLists(prev => [newList, ...prev]);
      setShowNewListModal(false);
      return newList; // Return the created list on success

      // Removed success toast - no need to distract user for routine list creation
    } catch (error) {
      console.error('Failed to create list:', error);
      toast({
        title: "Error",
        description: "Failed to create list",
        description: "Could not create your list. Please try again.",
        variant: "destructive"
      });
      return undefined; // Return undefined to indicate failure
    }
  };

  // Handler for NewListModal list creation (legacy - kept for compatibility)
  const handleNewListCreated = (newList: List) => {
    // The newList parameter is already the properly transformed API response from createList
    // This ensures the list has the correct position data and structure
    setLists(prev => [newList, ...prev]);
    setShowNewListModal(false);
  };

  const handleOpenNewNoteModal = (position: { x: number, y: number }) => {
    setNewNoteInitialPosition(position);
    setShowNewNoteModal(true);
  };

  const handleOpenNewListModal = (position: { x: number, y: number }) => {
    setNewListInitialPosition(position);
    setShowNewListModal(true);
  };

  const handleOpenNewWhiteboardModal = (position: { x: number, y: number }) => {
    logger.log('handleOpenNewWhiteboardModal called with position:', position);
    setNewWhiteboardInitialPosition(position);
    setShowNewWhiteboardModal(true);
  };

  // Handler for button context menu actions
  const handleButtonAddList = () => {
    setShowButtonContextMenu(false);
    setNewListInitialPosition(getIntelligentPosition()); // Use intelligent positioning for button creation
    setShowNewListModal(true);
  };

  const handleButtonAddNote = () => {
    setShowButtonContextMenu(false);
    setNewNoteInitialPosition(getIntelligentPosition()); // Use intelligent positioning for button creation
    setShowNewNoteModal(true);
  };

  const handleButtonAddWhiteboard = () => {
    setShowButtonContextMenu(false);
    setNewWhiteboardInitialPosition(getIntelligentPosition()); // Use intelligent positioning for button creation
    setShowNewWhiteboardModal(true);
  };

  const handleButtonAddWireframe = () => {
    setShowButtonContextMenu(false);
    setNewWireframeInitialPosition(getIntelligentPosition()); // Use intelligent positioning for button creation
    setShowNewWireframeModal(true);
  };

  // Sharing functions
  const handleShareList = async (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    // Check if list already has share data
    const existingShareData = list.share_token && list.is_public ? {
      shareToken: list.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/list/${list.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: listId,
      title: list.title,
      shareData: existingShareData
    });
    setShowShareListModal(true);
  };

  const handleShareNote = async (noteId: number) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    // Check if note already has share data
    const existingShareData = note.share_token && note.is_public ? {
      shareToken: note.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/note/${note.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: noteId,
      title: note.title,
      shareData: existingShareData
    });
    setShowShareNoteModal(true);
  };

  const handleShareWhiteboard = async (whiteboardId: number) => {
    const whiteboard = whiteboards.find(w => w.id === whiteboardId);
    if (!whiteboard) return;

    // Check if whiteboard already has share data
    const existingShareData = whiteboard.share_token && whiteboard.is_public ? {
      shareToken: whiteboard.share_token,
      shareUrl: `${window.location.protocol}//${window.location.host}/shared/whiteboard/${whiteboard.share_token}`
    } : undefined;

    setCurrentShareItem({
      id: whiteboardId,
      title: whiteboard.title,
      shareData: existingShareData
    });
    setShowShareWhiteboardModal(true);
  };

  const handleListShare = async (listId: string): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/lists/${listId}/share`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error sharing list:', error);
      throw error;
    }
  };

  const handleListUnshare = async (listId: string): Promise<void> => {
    try {
      await api.delete(`/api/lists/${listId}/share`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error unsharing list:', error);
      throw error;
    }
  };

  const handleNoteShare = async (noteId: number): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/notes/${noteId}/share`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error sharing note:', error);
      throw error;
    }
  };

  const handleNoteUnshare = async (noteId: number): Promise<void> => {
    try {
      await api.delete(`/api/notes/${noteId}/share`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error unsharing note:', error);
      throw error;
    }
  };

  const handleWhiteboardShare = async (whiteboardId: number): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/whiteboards/${whiteboardId}/share`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Error sharing whiteboard:', error);
      throw error;
    }
  };

  const handleWhiteboardUnshare = async (whiteboardId: number): Promise<void> => {
    try {
      await api.delete(`/api/whiteboards/${whiteboardId}/share`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error unsharing whiteboard:', error);
      throw error;
    }
  };

  // Mobile note creation function (mirrors createList)
  const createNote = async (title: string, category: string, color: string) => {
    try {
      // Check if the category exists, if not create it
      if (!isCategoryInUse(category) && category !== 'General') {
        await addCategory({ name: category, color_value: color });
      }

      const position = getIntelligentPosition();

      const response = await apiCreateNote({
        title: title, // Set the note title properly
        content: '', // Initialize with empty content
        color_value: color, // Use selected color
        position_x: position.x,
        position_y: position.y,
        width: 570, // Wider to accommodate rich text toolbar
        height: 350, // Taller for better content editing
        z_index: 0,
      }, token);

      setNotes(prev => [response, ...prev]);
      setShowCreateNoteModal(false);

      // Categories are now managed by database category system
    } catch (error) {
      console.error('Failed to create note:', error);
      toast({
        title: "Error",
        description: "Failed to create note",
        description: "Could not create your note. Please try again.",
        variant: "destructive"
      });
    }
  };

  // List position update (matches working Prototype2 pattern)
  const handleListPositionUpdate = (listId: string, newPosition: { x: number; y: number }, newSize?: { width: number }) => {
    // console.log('📍 handleListPositionUpdate called for listId:', listId, 'newPosition:', newPosition);
    // console.log('📍 Current lists before position update:', lists.length, lists.map(l => `${l.id}:(${l.position_x},${l.position_y})`));

    // Save original state for rollback (optimistic update pattern from Prototype1)
    const originalLists = [...lists];

    // Update local state immediately (optimistic update)
    setLists(prev => {
      const newLists = prev.map(list => list.id === listId ? {
        ...list,
        position_x: newPosition.x,
        position_y: newPosition.y,
        ...(newSize ? { width: newSize.width } : {})
      } : list);
      // console.log('📍 Optimistic update - updated lists:', newLists.map(l => `${l.id}:(${l.position_x},${l.position_y})`));
      return newLists;
    });

    // Make API call and rollback on error
    apiUpdateListPosition(listId, newPosition.x, newPosition.y, token)
      .then(() => {
        // console.log('📍 API position update successful');
      })
      .catch((error) => {
        console.error('📍 Failed to update list position:', error);
        // Rollback to original state on error
        // console.log('📍 Rolling back to original state');
        setLists(originalLists);
        toast({
          title: "Error",
          description: "Failed to update position",
          description: "Could not update list position. Please try again.",
          variant: "destructive"
        });
      });
  };

  // Whiteboard position update (similar to list position update)
  const handleWhiteboardPositionUpdate = (whiteboardId: number, newPosition: { x: number; y: number }) => {
    // Save original state for rollback
    const originalWhiteboards = [...whiteboards];

    // Update local state immediately (optimistic update)
    setWhiteboards(prev => prev.map(whiteboard => whiteboard.id === whiteboardId ? {
      ...whiteboard,
      position_x: newPosition.x,
      position_y: newPosition.y
    } : whiteboard));

    // Make API call and rollback on error
    apiUpdateWhiteboardPosition(whiteboardId, newPosition.x, newPosition.y, token)
      .then(() => {
        console.log('📍 Whiteboard position update successful');
      })
      .catch((error) => {
        console.error('📍 Failed to update whiteboard position:', error);
        // Rollback to original state on error
        setWhiteboards(originalWhiteboards);
        toast({
          title: "Error",
          description: "Failed to update position",
          description: "Could not update whiteboard position. Please try again.",
          variant: "destructive"
        });
      });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
          <span className="text-lg" style={{ color: theme === 'dark' ? '#ffffff' : '#374151' }}>Loading Workspace...</span>
        </div>
      </div>
    );
  }

  // Error handling is done in the main return statement

  // Utility functions for filtering lists and notes with unified categories
  const getUniqueTypes = () => {
    // Return only actual categories, no "all" filter
    return Array.from(new Set(categoryNames.filter(Boolean)));
  };

  const getFilteredContent = () => {
    // Use unified category filtering for lists, notes, whiteboards, and wireframes
    // null selectedFilter means show all content (no filtering)
    const { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes } = filterByCategory(selectedFilter);

    // Apply search filter to lists
    let searchFilteredLists = [...filteredLists];
    if (searchQuery) {
      searchFilteredLists = searchFilteredLists.filter(list => {
        return list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (list.items && list.items.some(item =>
            item.text?.toLowerCase().includes(searchQuery.toLowerCase())
          ));
      });
    }

    // Apply search filter to notes
    let searchFilteredNotes = [...filteredNotes];
    if (searchQuery) {
      searchFilteredNotes = searchFilteredNotes.filter(note => {
        return note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          note.content?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Apply search filter to whiteboards
    let searchFilteredWhiteboards = [...filteredWhiteboards];
    if (searchQuery) {
      searchFilteredWhiteboards = searchFilteredWhiteboards.filter(whiteboard => {
        return whiteboard.title?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Apply search filter to wireframes
    let searchFilteredWireframes = [...filteredWireframes];
    if (searchQuery) {
      searchFilteredWireframes = searchFilteredWireframes.filter(wireframe => {
        return wireframe.title?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    return {
      filteredLists: searchFilteredLists,
      filteredNotes: searchFilteredNotes,
      filteredWhiteboards: searchFilteredWhiteboards,
      filteredWireframes: searchFilteredWireframes
    };
  };

  // Get count of lists and notes per category for filter tabs
  const getFilterCounts = () => {
    const counts: Record<string, number> = {};

    // Count lists by category (lists use 'type' field)
    lists.forEach(list => {
      const category = list.type || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    // Count notes by category (notes use 'category' field)
    notes.forEach(note => {
      const category = note.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
  };

  const { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes } = getFilteredContent();

  // Mobile List View Component (similar to UserHome.tsx)
  const MobileListView = () => {
    const { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes } = getFilteredContent();

    return (
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-8">
        {/* Categories Section */}
        <div className="flex items-center gap-4 mb-8">
          <h3 className="text-lg font-light text-foreground flex-shrink-0">Categories</h3>

          {/* Filter Tabs - Horizontal scrolling */}
          <div className="flex gap-2 overflow-x-auto flex-1 pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {getUniqueTypes().map((filter) => {
              const count = getFilterCounts()[filter] || 0;
              const isActive = selectedFilter === filter;
              return (
                <Button
                  key={filter}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    // Toggle filter - if clicking active filter, turn it off (show all)
                    if (isActive) {
                      setSelectedFilter(null);
                    } else {
                      setSelectedFilter(filter);
                    }
                  }}
                  className={`capitalize font-light whitespace-nowrap flex-shrink-0 ${isActive ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                >
                  {filter} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {/* Content section - Lists, Notes, Whiteboards, and Wireframes */}
        {filteredLists.length === 0 && filteredNotes.length === 0 && filteredWhiteboards.length === 0 && filteredWireframes.length === 0 ? (
          <div className="text-center py-12">
            {lists.length === 0 && notes.length === 0 && whiteboards.length === 0 && wireframes.length === 0 ? (
              <div className="max-w-md mx-auto">
                <div className="bg-card rounded-lg shadow-sm border border-border p-8">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-light text-foreground mb-6">
                    No content on your canvas<br />(for now!)
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={() => setShowNewListModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-normal"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add List
                    </Button>
                    <Button
                      onClick={() => setShowCreateNoteModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-normal"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Note
                    </Button>
                    <Button
                      onClick={() => {
                        const position = getIntelligentPosition();
                        setNewWhiteboardInitialPosition(position);
                        setShowNewWhiteboardModal(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-normal"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Whiteboard
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No content matches your search criteria.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* My Lists section */}
            {filteredLists.length > 0 && (
              <>
                <h2 className="text-xl font-light text-foreground mb-6 flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-muted-foreground" />
                  My Lists
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredLists.map((list) => (
                    <ListCard
                      key={list.id}
                      list={list}
                      onUpdate={updateList}
                      onDelete={deleteList}
                      onShare={handleShareList}
                      existingCategories={dbCategories}
                      isCollapsed={isListCollapsed(list.id)}
                      onToggleCollapsed={listToggleCallbacks[list.id]}
                      addCategory={addCategory}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </>
            )}

            {/* My Notes section */}
            {filteredNotes.length > 0 && (
              <div className={filteredLists.length > 0 ? "mt-12" : ""}>
                <h2 className="text-xl font-light text-foreground mb-6 flex items-center gap-2">
                  <StickyNote className="h-5 w-5 text-muted-foreground" />
                  My Notes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onUpdate={async (noteId, updatedData) => {
                        await handleUpdateNote(noteId, updatedData);
                      }}
                      onDelete={async (noteId) => {
                        await handleDeleteNote(noteId);
                      }}
                      onShare={handleShareNote}
                      existingCategories={dbCategories}
                      isCollapsed={isNoteCollapsed(note.id)}
                      onToggleCollapsed={() => toggleNoteCollapsed(note.id)}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* My Whiteboards section */}
            {filteredWhiteboards.length > 0 && (
              <div className={(filteredLists.length > 0 || filteredNotes.length > 0) ? "mt-12" : ""}>
                <h2 className="text-xl font-light text-foreground mb-6 flex items-center gap-2">
                  <Palette className="h-5 w-5 text-muted-foreground" />
                  My Whiteboards
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredWhiteboards.map((whiteboard) => (
                    <WhiteboardCard
                      key={whiteboard.id}
                      whiteboard={whiteboard}
                      onUpdate={async (whiteboardId, updatedData) => {
                        return await handleUpdateWhiteboard(whiteboardId, updatedData);
                      }}
                      onDelete={async (whiteboardId) => {
                        return await handleDeleteWhiteboard(whiteboardId);
                      }}
                      onShare={handleShareWhiteboard}
                      existingCategories={dbCategories}
                      isCollapsed={isWhiteboardCollapsed(whiteboard.id)}
                      onToggleCollapsed={() => toggleWhiteboardCollapsed(whiteboard.id)}
                      updateCategory={editCategory}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Main render
  return (
    <>
      {/* Prevent body scrolling only for desktop canvas */}
      <style>{`
        ${!isMobileView ? `
          body { overflow: hidden !important; }
          html { overflow: hidden !important; }
        ` : ''}
        
        /* Hide scrollbar for horizontal category scrolling */
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className={`w-full flex flex-col ${isMobileView ? 'min-h-screen' : 'h-[calc(100vh-4rem)] overflow-hidden'}`}>
        {/* Mobile Search Bar - shown when not in desktop view */}
        {isMobileView && (
          <div className="px-4 py-2 border-b bg-background space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search canvas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 w-full"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-full h-9">
                <Filter className="h-4 w-4 mr-2" />
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
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
              <span className="text-lg" style={{ color: theme === 'dark' ? '#ffffff' : '#374151' }}>
                Loading Canvas...
              </span>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-destructive text-lg mb-4">⚠️ {error}</div>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : (
          // Conditional Rendering based on viewport size
          isMobileView ? (
            // Mobile: Stacked List View with scrolling
            <div className="flex-1 overflow-y-auto">
              <MobileListView />
            </div>
          ) : (
            // Desktop: Full-width Canvas View with drag and drop
            <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] absolute inset-x-0" style={{ top: 0, bottom: 0 }}>
              <CanvasContainer
                lists={filteredData.filteredLists}
                notes={filteredData.filteredNotes}
                whiteboards={filteredData.filteredWhiteboards}
                wireframes={filteredData.filteredWireframes}
                vaults={filteredData.filteredVaults}
                existingCategories={dbCategories}
                onListUpdate={updateList}
                onListPositionUpdate={handleListPositionUpdate}
                onListDelete={deleteList}
                onListShare={handleShareList}
                onNoteUpdate={handleUpdateNote}
                onNoteDelete={handleDeleteNote}
                onNoteShare={handleShareNote}
                onWhiteboardUpdate={handleUpdateWhiteboard}
                onWhiteboardDelete={handleDeleteWhiteboard}
                onWhiteboardShare={handleShareWhiteboard}
                onWireframeUpdate={handleUpdateWireframe}
                onWireframeDelete={handleDeleteWireframe}
                onWireframeShare={(wireframeId) => {
                  // TODO: Implement wireframe sharing
                  console.log('Share wireframe:', wireframeId);
                }}
                onWireframePositionUpdate={handleWireframePositionChange}
                onVaultUpdate={handleUpdateVault}
                onVaultDelete={handleDeleteVault}
                onVaultShare={(vaultId) => {
                  const vault = vaults.find(v => v.id === vaultId);
                  if (vault) {
                    setCurrentShareItem({
                      id: vaultId,
                      title: vault.title || 'Untitled Vault',
                      isLocked: vault.is_locked,
                      shareData: vault.share_token && vault.is_public ? {
                        shareToken: vault.share_token,
                        shareUrl: `${window.location.origin}/shared/vault/${vault.share_token}`
                      } : undefined
                    });
                    setShowShareVaultModal(true);
                  }
                }}
                onVaultPositionUpdate={handleVaultPositionChange}
                addCategory={addCategory}
                updateCategory={editCategory}
                onOpenNewNoteModal={handleOpenNewNoteModal}
                onOpenNewListModal={handleOpenNewListModal}
                onOpenNewWhiteboardModal={handleOpenNewWhiteboardModal}
                onOpenNewWireframeModal={(position) => {
                  setNewWireframeInitialPosition(position);
                  setShowNewWireframeModal(true);
                }}
                onOpenNewVaultModal={(position) => {
                  setNewVaultInitialPosition(position);
                  setShowNewVaultModal(true);
                }}
                searchQuery={searchQuery}
                categoryFilter={categoryFilter}
                onReady={(methods) => {
                  if (!canvasMethodsRef.current) {
                    canvasMethodsRef.current = methods;
                    logger.log('Canvas methods ready:', methods);
                  }
                }}
              />
            </div>
          )
        )}

        {/* Mobile View Modals */}
        {isMobileView ? (
          <>
            {/* Create List Modal - used by mobile view */}
            <CreateListModal
              isOpen={showCreateModal}
              onClose={() => setShowCreateModal(false)}
              onCreateList={createList}
              existingCategories={dbCategories}
            />

            {/* Create Note Modal - used by mobile view */}
            <CreateNoteModal
              isOpen={showCreateNoteModal}
              onClose={() => setShowCreateNoteModal(false)}
              onCreateNote={createNote}
              existingCategories={categoryNames}
            />
          </>
        ) : (
          <>
            {/* Desktop Canvas Note Modal */}
            {showNewNoteModal && newNoteInitialPosition && (
              <NewNoteModal
                isOpen={showNewNoteModal}
                onClose={() => setShowNewNoteModal(false)}
                onCreateNote={handleCreateNote}
                initialPosition={newNoteInitialPosition}
                existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
                updateCategory={updateCategoryColor}
              />
            )}

            {/* Desktop Canvas Whiteboard Modal */}
            {showNewWhiteboardModal && newWhiteboardInitialPosition && (
              <NewWhiteboardModal
                isOpen={showNewWhiteboardModal}
                onClose={() => setShowNewWhiteboardModal(false)}
                onCreateWhiteboard={handleCreateWhiteboard}
                initialPosition={newWhiteboardInitialPosition}
                existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
                updateCategory={updateCategoryColor}
              />
            )}

            {/* Desktop Canvas Wireframe Modal */}
            {showNewWireframeModal && newWireframeInitialPosition && (
              <NewWireframeModal
                isOpen={showNewWireframeModal}
                onClose={() => setShowNewWireframeModal(false)}
                onCreateWireframe={handleCreateWireframe}
                initialPosition={newWireframeInitialPosition}
                existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
                updateCategory={updateCategoryColor}
              />
            )}

            {/* Desktop Canvas Vault Modal */}
            {showNewVaultModal && newVaultInitialPosition && (
              <NewVaultModal
                isOpen={showNewVaultModal}
                onClose={() => setShowNewVaultModal(false)}
                onCreateVault={handleCreateVault}
                initialPosition={newVaultInitialPosition}
                existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
                updateCategory={updateCategoryColor}
              />
            )}

            {/* Desktop Canvas List Modal */}
            {showNewListModal && newListInitialPosition && (
              <NewListModal
                isOpen={showNewListModal}
                onClose={() => setShowNewListModal(false)}
                onCreateList={handleCreateList}
                existingCategories={dbCategories}
                position={newListInitialPosition}
                updateCategory={updateCategoryColor}
              />
            )}
          </>
        )}

        {/* Share Modals */}
        {showShareListModal && currentShareItem && (
          <ShareListModal
            isOpen={showShareListModal}
            onClose={() => {
              setShowShareListModal(false);
              setCurrentShareItem(null);
            }}
            listId={currentShareItem.id as string}
            listTitle={currentShareItem.title}
            onShare={handleListShare}
            onUnshare={handleListUnshare}
            existingShareData={currentShareItem.shareData}
          />
        )}

        {showShareNoteModal && currentShareItem && (
          <ShareNoteModal
            isOpen={showShareNoteModal}
            onClose={() => {
              setShowShareNoteModal(false);
              setCurrentShareItem(null);
            }}
            noteId={currentShareItem.id as number}
            noteTitle={currentShareItem.title}
            onShare={handleNoteShare}
            onUnshare={handleNoteUnshare}
            existingShareData={currentShareItem.shareData}
          />
        )}

        {showShareWhiteboardModal && currentShareItem && (
          <ShareWhiteboardModal
            isOpen={showShareWhiteboardModal}
            onClose={() => {
              setShowShareWhiteboardModal(false);
              setCurrentShareItem(null);
            }}
            whiteboardId={currentShareItem.id as number}
            whiteboardTitle={currentShareItem.title}
            onShare={handleWhiteboardShare}
            onUnshare={handleWhiteboardUnshare}
            existingShareData={currentShareItem.shareData}
          />
        )}

        {showShareVaultModal && currentShareItem && (
          <ShareVaultModal
            isOpen={showShareVaultModal}
            onClose={() => {
              setShowShareVaultModal(false);
              setCurrentShareItem(null);
            }}
            vaultId={currentShareItem.id as number}
            vaultTitle={currentShareItem.title}
            isLocked={currentShareItem.isLocked || false}
            onShare={handleShareVault}
            onUnshare={handleUnshareVault}
            existingShareData={currentShareItem.shareData}
          />
        )}

        {/* Button Context Menu - rendered outside canvas transform */}
        {showButtonContextMenu && (
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, pointerEvents: 'auto' }}
            onClick={() => setShowButtonContextMenu(false)} // Close menu when clicking outside
          >
            <ContextMenu
              position={{ x: 0, y: 0 }} // Not used for button context menu
              absolutePosition={buttonMenuPosition}
              onAddList={handleButtonAddList}
              onAddNote={handleButtonAddNote}
              onAddWhiteboard={handleButtonAddWhiteboard}
              onAddWireframe={handleButtonAddWireframe}
              onAddVault={() => {
                setShowButtonContextMenu(false);
                setNewVaultInitialPosition(getIntelligentPosition());
                setShowNewVaultModal(true);
              }}
              onClose={() => setShowButtonContextMenu(false)}
              isFromButton={true}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default CanvasPage;
