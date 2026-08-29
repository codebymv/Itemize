import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { DraggableListCard } from './DraggableListCard';
import { ContextMenu } from './ContextMenu';
import { useSidebar } from '../ui/sidebar';
import { List, Note, Whiteboard, Wireframe, Vault, Category } from '../../types';
import { useAuthState } from '../../contexts/AuthContext';
import { storage } from '../../lib/storage';

import Spinner from '../../components/ui/Spinner';
import { DraggableNoteCard } from './DraggableNoteCard';
import { DraggableWhiteboardCard } from './DraggableWhiteboardCard';
import { DraggableWireframeCard } from './DraggableWireframeCard';
import { DraggableVaultCard } from './DraggableVaultCard';
import { Plus, Minus, RotateCcw, Search } from 'lucide-react';

interface CanvasContainerProps {
  existingCategories: Category[];
  searchQuery?: string;
  categoryFilter?: string;
  onReady?: (methods: CanvasContainerMethods) => void;
  onOpenNewNoteModal?: (position: { x: number; y: number }) => void;
  onOpenNewListModal?: (position: { x: number; y: number }) => void;
  onListShare?: (listId: string) => void;
  lists: List[];
  onListUpdate: (updatedList: List) => Promise<unknown>;
  onListPositionUpdate: (listId: string, newPosition: { x: number; y: number }, newSize?: { width: number }) => void;
  onListDelete: (listId: string) => Promise<boolean>;
  notes: Note[];
  onNoteUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Note | null>;
  onNotePositionUpdate?: (noteId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onNoteDelete: (noteId: number) => Promise<boolean>;
  onNoteShare: (noteId: number) => void;
  whiteboards: Whiteboard[];
  onWhiteboardUpdate: (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Whiteboard | null>;
  onWhiteboardPositionUpdate?: (whiteboardId: number, newPosition: { x: number; y: number }) => void;
  onWhiteboardDelete: (whiteboardId: number) => Promise<boolean>;
  onWhiteboardShare: (whiteboardId: number) => void;
  onOpenNewWhiteboardModal?: (position: { x: number; y: number }) => void;
  wireframes?: Wireframe[];
  onWireframeUpdate?: (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Wireframe | null>;
  onWireframePositionUpdate?: (wireframeId: number, newPosition: { x: number; y: number }) => void;
  onWireframeDelete?: (wireframeId: number) => Promise<boolean>;
  onWireframeShare?: (wireframeId: number) => void;
  onOpenNewWireframeModal?: (position: { x: number; y: number }) => void;
  vaults?: Vault[];
  onVaultUpdate?: (vaultId: number, updatedData: Partial<Omit<Vault, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Vault | null>;
  onVaultPositionUpdate?: (vaultId: number, newPosition: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onVaultDelete?: (vaultId: number) => Promise<boolean>;
  onVaultShare?: (vaultId: number) => void;
  onOpenNewVaultModal?: (position: { x: number; y: number }) => void;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<Category>;
  updateCategory?: (categoryName: string, updatedData: Partial<{ name: string; color_value: string }>) => Promise<void>;
  isWhiteboardCollapsed?: (id: number) => boolean;
  onToggleWhiteboardCollapsed?: (id: number) => void;
  isWireframeCollapsed?: (id: number) => boolean;
  onToggleWireframeCollapsed?: (id: number) => void;
}

export interface CanvasContainerMethods {
  showAddListMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  showAddNoteMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  showAddWhiteboardMenu: (position: { x: number, y: number }, isFromButton?: boolean, absolutePosition?: { x: number, y: number }) => void;
  hideContextMenu: () => void;
  isMenuOpenFromButton: () => boolean;
  getViewportCenter: () => { x: number; y: number };
  focusPosition: (
    position: { x: number; y: number },
    size?: { width: number; height: number },
    options?: { fit?: boolean },
  ) => void;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({
  existingCategories,
  searchQuery = '',
  categoryFilter = 'all',
  onReady,
  onOpenNewNoteModal,
  onOpenNewListModal,
  onListShare,
  lists,
  onListUpdate,
  onListPositionUpdate,
  onListDelete,
  notes,
  onNoteUpdate,
  onNotePositionUpdate,
  onNoteDelete,
  onNoteShare,
  whiteboards,
  onWhiteboardUpdate,
  onWhiteboardPositionUpdate,
  onWhiteboardDelete,
  onWhiteboardShare,
  onOpenNewWhiteboardModal,
  wireframes = [],
  onWireframeUpdate,
  onWireframePositionUpdate,
  onWireframeDelete,
  onWireframeShare,
  onOpenNewWireframeModal,
  vaults = [],
  onVaultUpdate,
  onVaultPositionUpdate,
  onVaultDelete,
  onVaultShare,
  onOpenNewVaultModal,
  addCategory,
  updateCategory,
  isWhiteboardCollapsed,
  onToggleWhiteboardCollapsed,
  isWireframeCollapsed,
  onToggleWireframeCollapsed
}) => {
  const { theme } = useTheme();
  const isDark =
    theme === 'dark' ||
    (!theme && typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const { currentUser } = useAuthState();
  const { state: sidebarState, isMobile } = useSidebar();
  
  // Keep viewport controls anchored to the visible canvas edge as the sidebar changes.
  const sidebarWidth = isMobile ? 0 : (sidebarState === 'expanded' ? 256 : 64);
  
  const [loading, setLoading] = useState(false); // No longer need to load lists
  const [error, setError] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuAbsolutePosition, setMenuAbsolutePosition] = useState<{ x: number, y: number } | undefined>(undefined);
  const [menuIsFromButton, setMenuIsFromButton] = useState(false);

  const viewportKey = useMemo(
    () => `canvas_viewport:${currentUser?.uid ?? 'guest'}`,
    [currentUser?.uid]
  );
  const initialTransformAppliedRef = useRef(false);

  const getDefaultTransform = () => ({
    x: window.innerWidth / 2 - 2000,
    y: window.innerHeight / 2 - 2000,
    scale: 1,
  });

  // Canvas transform state - start centered for optimal panning
  const [canvasTransform, setCanvasTransform] = useState(getDefaultTransform);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Use categoryFilter from props instead of internal state
  const selectedFilter = categoryFilter;
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const canvasTransformRef = useRef(canvasTransform);
  const lastFocusedFilterRef = useRef('');
  canvasTransformRef.current = canvasTransform;

  const allPositions = useMemo(() => {
    const positions: { x: number; y: number }[] = [];
    const pushPosition = (x?: number | null, y?: number | null) => {
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        positions.push({ x, y });
      }
    };

    lists.forEach((list) => pushPosition(list.position_x, list.position_y));
    notes.forEach((note) => pushPosition(note.position_x, note.position_y));
    whiteboards.forEach((whiteboard) => pushPosition(whiteboard.position_x, whiteboard.position_y));
    wireframes.forEach((wireframe) => pushPosition(wireframe.position_x, wireframe.position_y));
    vaults.forEach((vault) => pushPosition(vault.position_x, vault.position_y));

    return positions;
  }, [lists, notes, whiteboards, wireframes, vaults]);

  const getViewportSize = useCallback(() => {
    const width = canvasRef.current?.clientWidth ?? window.innerWidth;
    const height = canvasRef.current?.clientHeight ?? window.innerHeight;
    return { width, height };
  }, []);

  const getViewportCenter = useCallback(() => {
    const { width, height } = getViewportSize();
    const transform = canvasTransformRef.current;
    return {
      x: (width / 2 - transform.x) / transform.scale,
      y: (height / 2 - transform.y) / transform.scale,
    };
  }, [getViewportSize]);

  const focusPosition = useCallback((
    position: { x: number; y: number },
    size: { width: number; height: number } = { width: 600, height: 420 },
    options: { fit?: boolean } = {},
  ) => {
    const { width, height } = getViewportSize();
    const scale = options.fit
      ? Math.max(
          0.1,
          Math.min(1, (width - 96) / size.width, (height - 96) / size.height),
        )
      : canvasTransformRef.current.scale;
    setCanvasTransform({
      x: width / 2 - (position.x + size.width / 2) * scale,
      y: height / 2 - (position.y + size.height / 2) * scale,
      scale,
    });
  }, [getViewportSize]);

  const getMedian = useCallback((values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }, []);

  const getContentCenter = useCallback((positions: { x: number; y: number }[]) => {
    if (positions.length === 0) {
      return { x: 2000, y: 2000 };
    }
    const xs = positions.map((pos) => pos.x);
    const ys = positions.map((pos) => pos.y);
    return { x: getMedian(xs), y: getMedian(ys) };
  }, [getMedian]);

  useEffect(() => {
    if (initialTransformAppliedRef.current) return;

    const saved = storage.getJson<{ x: number; y: number; scale: number }>(viewportKey);
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.scale)) {
      setCanvasTransform(saved);
      initialTransformAppliedRef.current = true;
      return;
    }

    if (allPositions.length > 0) {
      const { width, height } = getViewportSize();
      const { x: centerX, y: centerY } = getContentCenter(allPositions);
      setCanvasTransform({
        x: width / 2 - centerX,
        y: height / 2 - centerY,
        scale: 1,
      });
      initialTransformAppliedRef.current = true;
    }
  }, [allPositions, getContentCenter, getViewportSize, viewportKey]);

  const filteredPositionSignature = useMemo(
    () => allPositions.map(({ x, y }) => `${x}:${y}`).join('|'),
    [allPositions],
  );

  // Filtering a spatial canvas should reveal the matching work, not leave a
  // blank viewport while the result remains offscreen at its stored position.
  useEffect(() => {
    const hasActiveFilter = searchQuery.trim().length > 0 || categoryFilter !== 'all';
    if (!hasActiveFilter) {
      lastFocusedFilterRef.current = '';
      return;
    }
    if (allPositions.length === 0 || !initialTransformAppliedRef.current) return;

    const filterKey = `${searchQuery.trim()}|${categoryFilter}|${filteredPositionSignature}`;
    if (lastFocusedFilterRef.current === filterKey) return;
    lastFocusedFilterRef.current = filterKey;

    const timeout = window.setTimeout(() => {
      const center = getContentCenter(allPositions);
      focusPosition(center);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [
    allPositions,
    categoryFilter,
    filteredPositionSignature,
    focusPosition,
    getContentCenter,
    searchQuery,
  ]);

  useEffect(() => {
    if (!initialTransformAppliedRef.current) return;
    const timeout = window.setTimeout(() => {
      storage.setJson(viewportKey, canvasTransform);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [canvasTransform, viewportKey]);

  // Handler for when 'Add Note' is clicked in the context menu
  const handleRequestAddNote = () => {
    setShowContextMenu(false); 
    if (onOpenNewNoteModal) {
      onOpenNewNoteModal(menuPosition);
    }
  };

  // Handler for when 'Add Whiteboard' is clicked in the context menu
  const handleRequestAddWhiteboard = () => {
    setShowContextMenu(false); 
    // Use the stored menuPosition which is already in canvas coordinates
    if (onOpenNewWhiteboardModal) {
      console.log('Opening whiteboard modal at position:', menuPosition);
      onOpenNewWhiteboardModal(menuPosition);
    }
  };

  // Handler for when 'Add Wireframe' is clicked in the context menu
  const handleRequestAddWireframe = () => {
    setShowContextMenu(false); 
    if (onOpenNewWireframeModal) {
      console.log('Opening wireframe modal at position:', menuPosition);
      onOpenNewWireframeModal(menuPosition);
    }
  };

  // Handler for when 'Add Vault' is clicked in the context menu
  const handleRequestAddVault = () => {
    setShowContextMenu(false); 
    if (onOpenNewVaultModal) {
      console.log('Opening vault modal at position:', menuPosition);
      onOpenNewVaultModal(menuPosition);
    }
  };

  // Expose methods to parent component
  useEffect(() => {
    if (onReady) {
      onReady({
        showAddListMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open list modal instead of context menu for lists
          if (onOpenNewListModal) {
            onOpenNewListModal(position);
          }
        },
        showAddNoteMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open note modal instead of context menu for notes
          if (onOpenNewNoteModal) {
            onOpenNewNoteModal(position);
          }
        },
        showAddWhiteboardMenu: (position, isFromButton = false, absolutePosition) => {
          // Directly open whiteboard modal instead of context menu for whiteboards
          if (onOpenNewWhiteboardModal) {
            onOpenNewWhiteboardModal(position);
          }
        },
        hideContextMenu: () => {
          setShowContextMenu(false);
        },
        isMenuOpenFromButton: () => {
          return showContextMenu && menuIsFromButton;
        },
        getViewportCenter,
        focusPosition,
      });
    }
  }, [focusPosition, getViewportCenter, onReady, showContextMenu, menuIsFromButton]);

  // Set up event listeners
  useEffect(() => {
    const handleShowContextMenu = (event: CustomEvent) => {
      const { position, isFromButton = false, absolutePosition } = event.detail;
      setMenuPosition(position);
      setMenuIsFromButton(isFromButton);
      if (absolutePosition) {
        setMenuAbsolutePosition(absolutePosition);
      }
      setShowContextMenu(true);
    };

    document.addEventListener('showCanvasContextMenu', handleShowContextMenu as EventListener);

    return () => {
      document.removeEventListener('showCanvasContextMenu', handleShowContextMenu as EventListener);
    };
  }, []);

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    // Check if the right-click is within a text editor or input field
    const target = e.target as HTMLElement;
    const isInTextEditor = target.closest('.ProseMirror') || 
                          target.closest('textarea') || 
                          target.closest('input') || 
                          target.closest('[contenteditable="true"]') ||
                          target.closest('.tiptap') ||
                          target.closest('.rich-text-editor');
    
    // If right-clicking within a text editor, allow the default browser context menu
    if (isInTextEditor) {
      console.log('Right-click in text editor - allowing default context menu');
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Right-click context menu triggered');
    
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Convert screen coordinates to canvas coordinates
      const canvasX = (x - canvasTransform.x) / canvasTransform.scale;
      const canvasY = (y - canvasTransform.y) / canvasTransform.scale;
      
      console.log('Context menu position:', { canvasX, canvasY, screenX: x, screenY: y });
      
      // Pass both canvas-relative coordinates (for positioning items) and absolute screen coordinates (for menu positioning)
      setMenuPosition({ x: canvasX, y: canvasY });
      
      // Use screen coordinates for menu positioning so menu isn't affected by zoom
      setMenuAbsolutePosition({ x: e.clientX, y: e.clientY });
      setMenuIsFromButton(false);
      setShowContextMenu(true);
    }
  };

  // Canvas panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Close context menu on any mouse down except on the menu itself
    const target = e.target as HTMLElement;
    if (showContextMenu && !target.closest('.context-menu')) {
      setShowContextMenu(false);
    }
    
    // Only start panning on left click and if not clicking on a draggable item or interactive element
    const isInteractiveElement = target.closest('.draggable-list-card, .draggable-note-card, .draggable-whiteboard-card, .draggable-wireframe-card, .draggable-vault-card, .context-menu, button, input, textarea, select, .ProseMirror, .tiptap, .rich-text-editor, [contenteditable="true"]');
    
    if (e.button === 1) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX - canvasTransform.x,
        y: e.clientY - canvasTransform.y
      });
      e.preventDefault();
      return;
    }

    if (e.button === 0 && !isInteractiveElement && (e.target === canvasRef.current || e.target === canvasContentRef.current)) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX - canvasTransform.x,
        y: e.clientY - canvasTransform.y
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setCanvasTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
  };

  // React registers onWheel as passive, so preventDefault only works on a native listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;

      const isInTextEditor = target.closest('.ProseMirror') ||
        target.closest('textarea') ||
        target.closest('input') ||
        target.closest('[contenteditable="true"]') ||
        target.closest('.tiptap');
      if (isInTextEditor) return;

      const isInCard = target.closest('.draggable-note-card') ||
        target.closest('.draggable-list-card') ||
        target.closest('.draggable-vault-card') ||
        target.closest('.draggable-whiteboard-card') ||
        target.closest('.draggable-wireframe-card');
      const wantsCanvasZoom = e.ctrlKey || e.metaKey;

      if (isInCard && !wantsCanvasZoom) {
        const card = isInCard;
        let element: HTMLElement | null = target;
        while (element && element !== card) {
          const style = window.getComputedStyle(element);
          const overflowY = style.overflowY;
          const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight;
          if (isScrollable) {
            const canScrollUp = element.scrollTop > 0;
            const canScrollDown = element.scrollTop < (element.scrollHeight - element.clientHeight);
            if ((e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown)) {
              return;
            }
          }
          element = element.parentElement;
        }
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const transform = canvasTransformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.1, Math.min(3, transform.scale * scaleFactor));
      setCanvasTransform({
        x: mouseX - (mouseX - transform.x) * (newScale / transform.scale),
        y: mouseY - (mouseY - transform.y) * (newScale / transform.scale),
        scale: newScale,
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Setup global mouse event listeners for panning
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        setCanvasTransform(prev => ({
          ...prev,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y
        }));
      }
    };

    const handleGlobalMouseUp = () => {
      if (isPanning) {
        setIsPanning(false);
      }
    };

    if (isPanning) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, panStart]);
  
  const handleCanvasClick = () => {
  };

  const handleAddList = () => {
    setShowContextMenu(false);
    if (onOpenNewListModal) {
      onOpenNewListModal(menuPosition);
    }
  };

  const handleListUpdate = async (updatedList: List) => {
    try {
      // Use the passed handler from parent
      await onListUpdate(updatedList);
    } catch (error) {
      console.error('Failed to update list:', error);
    }
  };

  const handleListDelete = async (listId: string): Promise<boolean> => {
    try {
      // Use the passed handler from parent
      return await onListDelete(listId);
    } catch (error) {
      console.error('Failed to delete list:', error);
      return false;
    }
  };




  // Canvas control functions
  const handleZoomIn = () => {
    setCanvasTransform(prev => ({
      ...prev,
      scale: Math.min(3, prev.scale * 1.2)
    }));
  };

  const handleZoomOut = () => {
    setCanvasTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, prev.scale / 1.2)
    }));
  };

  const handleResetView = () => {
    if (allPositions.length === 0) {
      setCanvasTransform(getDefaultTransform());
      return;
    }

    const { width, height } = getViewportSize();
    const center = getContentCenter(allPositions);
    setCanvasTransform({
      x: width / 2 - (center.x + 300),
      y: height / 2 - (center.y + 210),
      scale: 1,
    });
  };

  // Filter logic
  const getFilteredContent = () => {
    let filteredLists = lists;
    let filteredNotes = notes;
    let filteredWhiteboards = whiteboards;
    let filteredWireframes = wireframes;
    let filteredVaults = vaults;

    // Apply search filter
    if (searchQuery) {
      filteredLists = lists.filter(list => {
        return (
          list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (list.items && list.items.some(item => 
            item.text && item.text.toLowerCase().includes(searchQuery.toLowerCase())
          ))
        );
      });

      filteredNotes = notes.filter(note => {
        return (note.title && note.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
               (note.content && note.content.toLowerCase().includes(searchQuery.toLowerCase()));
      });

      filteredWhiteboards = whiteboards.filter(whiteboard => {
        return whiteboard.title && whiteboard.title.toLowerCase().includes(searchQuery.toLowerCase());
      });

      filteredWireframes = wireframes.filter(wireframe => {
        return wireframe.title && wireframe.title.toLowerCase().includes(searchQuery.toLowerCase());
      });

      filteredVaults = vaults.filter(vault => {
        return vault.title && vault.title.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Apply category filter
    if (selectedFilter !== 'all') {
      filteredLists = filteredLists.filter(list => (list.type || 'General') === selectedFilter);
      filteredNotes = filteredNotes.filter(note => (note.category || 'General') === selectedFilter);
      filteredWhiteboards = filteredWhiteboards.filter(whiteboard => (whiteboard.category || 'General') === selectedFilter);
      filteredWireframes = filteredWireframes.filter(wireframe => (wireframe.category || 'General') === selectedFilter);
      filteredVaults = filteredVaults.filter(vault => (vault.category || 'General') === selectedFilter);
    }

    return { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes, filteredVaults };
  };

  const { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes, filteredVaults } = getFilteredContent();

  // Memoize the canvas transform string to prevent unnecessary recalculations
  const canvasTransformStyle = useMemo(() => {
    return `translate(${canvasTransform.x}px, ${canvasTransform.y}px) scale(${canvasTransform.scale})`;
  }, [canvasTransform.x, canvasTransform.y, canvasTransform.scale]);

  // Memoize the background image to prevent recalculation on every render
  const backgroundImageStyle = useMemo(() => {
    return isDark ? `
      radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
      radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(135deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.04) 50%, rgba(255, 255, 255, 0.01) 100%)
    ` : `
      radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
      radial-gradient(circle, rgba(0, 0, 0, 0.04) 1px, transparent 1px),
      linear-gradient(135deg, rgba(0, 0, 0, 0.01) 0%, rgba(0, 0, 0, 0.04) 50%, rgba(0, 0, 0, 0.01) 100%)
    `;
  }, [isDark]);

  // Global event listeners for mouse interaction outside canvas
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Close context menu if clicking outside
      if (showContextMenu) {
        const target = e.target as HTMLElement;
        const menuElement = document.querySelector('.context-menu');
        const buttonElement = document.getElementById('new-canvas-button');
        
        if (menuElement && menuElement.contains(e.target as Node)) {
          return;
        }
        
        if (menuIsFromButton && buttonElement && buttonElement.contains(e.target as Node)) {
          return;
        }
        
        if (!target.closest('.context-menu')) {
          setShowContextMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [showContextMenu, menuIsFromButton]);

  return (
    <div className="canvas-container-wrapper">
      
      {/* Canvas area */}
      <div 
        ref={canvasRef}
        className="canvas-area"
        onContextMenu={handleContextMenu}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          position: 'relative',
          width: '100%',
          height: '100vh',
          backgroundColor: 'var(--background-alt)',
          borderRadius: '0',
          overflow: 'hidden',
          padding: '0',
          boxSizing: 'border-box',
          border: 'none',
          cursor: isPanning ? 'grabbing' : 'grab'
        }}
      >
        {/* Canvas content with transform applied */}
        <div
          ref={canvasContentRef}
          style={useMemo(() => ({
            position: 'absolute',
            width: '100%',
            height: '100%',
            minWidth: '4000px', // Large canvas area
            minHeight: '4000px',
            transform: canvasTransformStyle,
            transformOrigin: '0 0',
            padding: '1rem',
            backgroundImage: backgroundImageStyle,
            backgroundSize: '32px 32px, 8px 8px, 100% 100%',
            backgroundPosition: '0 0, 0 0, 0 0'
          }), [canvasTransformStyle, backgroundImageStyle])}
        >



        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            {error}
          </div>
        ) : (
          <>
            {/* Draggable list cards */}
            {filteredLists.map(list => (
              <DraggableListCard
                key={list.id}
                list={list}
                onPositionChange={(listId, newPosition, newSize) => {
                  onListPositionUpdate(listId, newPosition, newSize);
                }}
                onUpdate={handleListUpdate}
                onDelete={handleListDelete}
                onShare={onListShare || (() => {})}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                addCategory={addCategory}
                updateCategory={updateCategory}
              />
            ))}

            {/* Render notes */}
            {filteredNotes.map(note => (
              <DraggableNoteCard 
                key={note.id} 
                note={note} 
                onPositionUpdate={(noteId, newPosition, newSize) => {
                  if (onNotePositionUpdate) {
                    onNotePositionUpdate(noteId, newPosition, newSize);
                    return;
                  }

                  const updatePayload: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>> = {
                    position_x: newPosition.x,
                    position_y: newPosition.y
                  };
                  if (newSize) {
                    updatePayload.width = newSize.width;
                    updatePayload.height = newSize.height;
                  }
                  onNoteUpdate(noteId, updatePayload);
                }}
                onUpdate={onNoteUpdate}
                onDelete={onNoteDelete}
                onShare={onNoteShare}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                updateCategory={updateCategory}
              />
            ))}

            {/* Render whiteboards */}
            {filteredWhiteboards.map(whiteboard => (
              <DraggableWhiteboardCard
                key={whiteboard.id}
                whiteboard={whiteboard}
                onUpdate={onWhiteboardUpdate}
                onDelete={onWhiteboardDelete}
                onShare={onWhiteboardShare}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                onPositionChange={(whiteboardId, newPosition) => {
                  if (onWhiteboardPositionUpdate) {
                    onWhiteboardPositionUpdate(whiteboardId, newPosition);
                    return;
                  }
                  onWhiteboardUpdate(whiteboardId, { position_x: newPosition.x, position_y: newPosition.y });
                }}
                isCollapsed={isWhiteboardCollapsed?.(whiteboard.id)}
                onToggleCollapsed={onToggleWhiteboardCollapsed ? () => onToggleWhiteboardCollapsed(whiteboard.id) : undefined}
                updateCategory={updateCategory}
              />
            ))}

            {/* Render wireframes */}
            {wireframes && onWireframeUpdate && onWireframeDelete && onWireframeShare && filteredWireframes.map(wireframe => (
              <DraggableWireframeCard
                key={wireframe.id}
                wireframe={wireframe}
                onUpdate={onWireframeUpdate}
                onDelete={onWireframeDelete}
                onShare={onWireframeShare}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                onPositionChange={(wireframeId, newPosition) => {
                  if (onWireframePositionUpdate) {
                    onWireframePositionUpdate(wireframeId, newPosition);
                    return;
                  }
                  onWireframeUpdate(wireframeId, { position_x: newPosition.x, position_y: newPosition.y });
                }}
                isCollapsed={isWireframeCollapsed?.(wireframe.id)}
                onToggleCollapsed={onToggleWireframeCollapsed ? () => onToggleWireframeCollapsed(wireframe.id) : undefined}
                updateCategory={updateCategory}
              />
            ))}

            {/* Render vaults */}
            {vaults && onVaultUpdate && onVaultDelete && onVaultShare && filteredVaults.map(vault => (
              <DraggableVaultCard
                key={vault.id}
                vault={vault}
                onUpdate={onVaultUpdate}
                onDelete={onVaultDelete}
                onShare={onVaultShare}
                existingCategories={existingCategories}
                canvasTransform={canvasTransform}
                onPositionUpdate={onVaultPositionUpdate || ((vaultId, newPosition) => {
                  onVaultUpdate(vaultId, { position_x: newPosition.x, position_y: newPosition.y });
                })}
                updateCategory={updateCategory}
              />
            ))}
            
            {/* Context menu */}
            {showContextMenu && (() => {
              console.log('Rendering context menu with:', { menuPosition, menuAbsolutePosition, menuIsFromButton, showContextMenu });
              return (
                <ContextMenu
                  position={menuPosition}
                  absolutePosition={menuAbsolutePosition}
                  onAddList={handleAddList}
                  onAddNote={handleRequestAddNote}
                  onAddWhiteboard={handleRequestAddWhiteboard}
                  onAddWireframe={handleRequestAddWireframe}
                  onAddVault={handleRequestAddVault}
                  onClose={() => setShowContextMenu(false)}
                  isFromButton={menuIsFromButton}
                />
              );
            })()}
          </>
        )}
        </div>

        {!loading &&
          !error &&
          lists.length === 0 &&
          notes.length === 0 &&
          whiteboards.length === 0 &&
          wireframes.length === 0 &&
          vaults.length === 0 && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center font-raleway text-lg font-light text-muted-foreground"
              data-canvas-empty-state
            >
              No content on your canvas (for now!)
            </div>
          )}
      </div>

      {/* Canvas Control Panel */}
      <div
        aria-label="Canvas view controls"
        data-canvas-controls
        role="toolbar"
        style={{
          position: 'fixed',
          bottom: '16px',
          left: `${sidebarWidth + 16}px`,
          zIndex: 1002,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px',
          backgroundColor: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          userSelect: 'none',
          transition: 'left 0.2s ease-in-out'
        }}
      >
        {/* Zoom Out */}
        <button
          aria-label="Zoom out"
          onClick={handleZoomOut}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--background)';
          }}
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>

        {/* Reset/Center */}
        <button
          aria-label="Reset canvas view"
          onClick={handleResetView}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--background)';
          }}
          title="Reset View"
        >
          <RotateCcw size={18} />
        </button>

        {/* Zoom Level Display */}
        <div
          style={{
            padding: '0 12px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            minWidth: '60px',
            textAlign: 'center'
          }}
        >
          {Math.round(canvasTransform.scale * 100)}%
        </div>

        {/* Zoom In */}
        <button
          aria-label="Zoom in"
          onClick={handleZoomIn}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--background)';
          }}
          title="Zoom In"
        >
          <Plus size={18} />
        </button>

      </div>


    </div>
  );
};

export default CanvasContainer;
