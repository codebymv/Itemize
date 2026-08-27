import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Search, Plus, Filter, Palette, CheckSquare, StickyNote, Map as MapIcon, GitBranch, KeyRound } from 'lucide-react';
import { CanvasContainer, CanvasContainerMethods } from '../components/Canvas/CanvasContainer';
import { ContextMenu } from '../components/Canvas/ContextMenu';
import { List, Note, Whiteboard, Wireframe, Vault } from '../types';
import { Input } from '../components/ui/input';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/page-loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from "../hooks/use-toast";
import { CreateItemModal } from "../components/CreateItemModal";
import { useAuthState } from "../contexts/AuthContext";
import { ShareModal } from '../components/ShareModal';
import { useDatabaseCategories } from '../hooks/useDatabaseCategories';
import { useIsMobile } from '../hooks/use-mobile';
import { logger } from '../lib/logger';
import { ErrorState } from '@/components/ErrorState';
import { PageLayout } from '@/components/layout/PageLayout';
import { useOnboardingTrigger } from '../hooks/useOnboardingTrigger';
import { OnboardingModal } from '../components/OnboardingModal';
import { ONBOARDING_CONTENT } from '../config/onboardingContent';
import { useCanvasData } from './canvas/hooks/useCanvasData';
import { useCanvasPositionSync } from './canvas/hooks/useCanvasPositionSync';
import { useCanvasWebSocket } from './canvas/hooks/useCanvasWebSocket';
import { useCanvasFilters } from './canvas/hooks/useCanvasFilters';
import { useCanvasCollapsible } from './canvas/hooks/useCanvasCollapsible';
import { useCanvasContextMenu } from './canvas/hooks/useCanvasContextMenu';
import { useCanvasSharing } from './canvas/hooks/useCanvasSharing';
import { useCanvasCRUD } from './canvas/hooks/useCanvasCRUD';
import { CanvasToolbar } from './canvas/components/CanvasToolbar';
import { MobileListView as CanvasMobileListView } from './canvas/components/MobileListView';
import { findOpenCanvasPosition } from '@/lib/canvasPosition';

const CanvasPage: React.FC = () => {
  const { theme } = useTheme();

  // Onboarding
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('canvas');

  const canvasData = useCanvasData();
  const {
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
    isLoading,
    error,
  } = canvasData;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [mobileListInitialPosition, setMobileListInitialPosition] = useState<{ x: number; y: number } | null>(null);
  const [mobileNoteInitialPosition, setMobileNoteInitialPosition] = useState<{ x: number; y: number } | null>(null);
  const isMobileView = useIsMobile();
  const navigate = useNavigate();
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
  const canvasMethodsRef = useRef<CanvasContainerMethods | null>(null);

  const { toast } = useToast();
const { currentUser } = useAuthState();
  const { enqueuePositionUpdate } = useCanvasPositionSync();
  const updateWireframe = useCallback((updated: Wireframe) => {
    setWireframes(prev => prev.map(w => w.id === updated.id ? updated : w));
  }, [setWireframes]);
  const { socket, isConnected } = useCanvasWebSocket(currentUser, updateWireframe);
  const {
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    categoryFilter,
    setCategoryFilter,
    selectedFilter,
    setSelectedFilter,
    getUniqueCategories,
    getCategoryCounts,
    filteredData,
    getFilterCounts,
  } = useCanvasFilters(lists, notes, whiteboards, wireframes, vaults);
  const {
    isWhiteboardCollapsed,
    toggleWhiteboardCollapsed,
    isWireframeCollapsed,
    toggleWireframeCollapsed,
  } = useCanvasCollapsible(lists);
  const {
    showButtonContextMenu,
    buttonMenuPosition,
    handleOpenMenu,
    handleCloseMenu,
    setShowButtonContextMenu,
  } = useCanvasContextMenu();
  const {
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
  } = useCanvasSharing(lists, notes, whiteboards, wireframes, vaults, {
    setLists,
    setNotes,
    setWhiteboards,
    setWireframes,
    setVaults,
  });


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

  const {
    handleCreateList: createList,
    updateList,
    deleteList,
    handleListPositionUpdate,
    handleCreateNote: createNote,
    handleUpdateNote,
    handleDeleteNote,
    handleNotePositionUpdate,
    handleCreateWhiteboard: createWhiteboard,
    handleUpdateWhiteboard,
    handleDeleteWhiteboard,
    handleWhiteboardPositionUpdate,
    handleCreateWireframe: createWireframe,
    handleUpdateWireframe,
    handleDeleteWireframe,
    handleWireframePositionChange,
    handleCreateVault: createVault,
    handleUpdateVault,
    handleDeleteVault,
    handleVaultPositionChange,
  } = useCanvasCRUD(
    null,
    { isCategoryInUse, addCategory },
    { setLists, setNotes, setWhiteboards, setWireframes, setVaults },
    enqueuePositionUpdate
  );

  const focusCreatedItem = (
    item: {
      position_x?: number | null;
      position_y?: number | null;
      width?: number | null;
      height?: number | null;
      canvas_width?: number | null;
      canvas_height?: number | null;
    },
    fallbackPosition: { x: number; y: number },
  ) => {
    if (isMobileView) return;
    const position = {
      x: item.position_x ?? fallbackPosition.x,
      y: item.position_y ?? fallbackPosition.y,
    };
    const size = {
      width: item.width ?? item.canvas_width ?? 600,
      height: item.height ?? item.canvas_height ?? 420,
    };
    window.requestAnimationFrame(() => canvasMethodsRef.current?.focusPosition(position, size));
  };

  const handleCreateNote = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    const newNote = await createNote(title, category, color, position);
    if (newNote) {
      setShowNewNoteModal(false);
      focusCreatedItem(newNote, position);
    }
    return newNote;
  };

  const handleCreateList = async (title: string, type: string, color: string, position: { x: number; y: number }) => {
    const newList = await createList(title, type, color, position);
    if (newList) {
      setShowNewListModal(false);
      focusCreatedItem(newList, position);
    }
    return newList;
  };

  const handleCreateWhiteboard = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    const newWhiteboard = await createWhiteboard(title, category, color, position);
    if (newWhiteboard) {
      setShowNewWhiteboardModal(false);
      focusCreatedItem(newWhiteboard, position);
    }
    return newWhiteboard;
  };

  const handleCreateWireframe = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    const newWireframe = await createWireframe(title, category, color, position);
    if (newWireframe) {
      setShowNewWireframeModal(false);
      focusCreatedItem(newWireframe, position);
    }
    return newWireframe;
  };

  const handleCreateVault = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    const newVault = await createVault(title, category, color, position);
    if (newVault) {
      setShowNewVaultModal(false);
      focusCreatedItem(newVault, position);
    }
    return newVault;
  };

  const getApiStatus = (error: unknown): number | undefined => {
    if (error && typeof error === 'object') {
      if ('response' in error) {
        const response = (error as { response?: { status?: unknown } }).response;
        if (typeof response?.status === 'number') return response.status;
      }
      if ('status' in error) {
        const status = (error as { status?: unknown }).status;
        if (typeof status === 'number') return status;
      }
    }
    return undefined;
  };

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
          } catch (error: unknown) {
            logger.error(`Failed to update list ${list.id} color:`, error);

            // If it's a 404 error, the list no longer exists in the backend
            // Remove it from the frontend state to prevent future errors
            if (getApiStatus(error) === 404) {
              logger.warn(`List ${list.id} no longer exists in backend, removing from frontend state`);
              failedListIds.push(list.id);
            }
          }
        }

        // Remove any lists that no longer exist in the backend
        if (failedListIds.length > 0) {
          setLists(prev => prev.filter(list => !failedListIds.includes(list.id)));
          logger.log(`Removed ${failedListIds.length} stale list(s) from frontend state:`, failedListIds);
        }

        // Update all notes that belong to this category
        const notesToUpdate = notes.filter(note => (note.category || 'General') === categoryName);
        for (const note of notesToUpdate) {
          try {
            await handleUpdateNote(note.id, { color_value: newColor });
          } catch (error) {
            logger.error(`Failed to update note ${note.id} color:`, error);
          }
        }

        // Update all whiteboards that belong to this category
        const whiteboardsToUpdate = whiteboards.filter(whiteboard => (whiteboard.category || 'General') === categoryName);
        for (const whiteboard of whiteboardsToUpdate) {
          try {
            await handleUpdateWhiteboard(whiteboard.id, { color_value: newColor });
          } catch (error) {
            logger.error(`Failed to update whiteboard ${whiteboard.id} color:`, error);
          }
        }

        // Color change completed silently - no toast needed
        logger.log(`Category "${categoryName}" and ${listsToUpdate.length + notesToUpdate.length + whiteboardsToUpdate.length} linked items updated successfully.`);
      }

      // The useDatabaseCategories hook should automatically refresh its state
      // If it doesn't, we may need to implement a refresh mechanism in the hook

    } catch (error) {
      logger.error('Error updating category:', error);
      toast({
        title: 'Error',
        description: `Failed to update category "${categoryName}". Please try again.`,
        variant: 'destructive',
      });
    }
  };

  // Wrapper function for category color updates
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

  // Redirect mobile users to Contents page (Canvas requires desktop for infinite canvas functionality)
  useEffect(() => {
    if (isMobileView) {
      navigate('/contents', { replace: true });
    }
  }, [isMobileView, navigate]);

  // Note: Race condition prevention refs removed since WebSocket creation events are disabled

  // Shared placement keeps every creation entry point from stacking cards.
  const getIntelligentPosition = (currentLists: List[], currentNotes: Note[], currentWhiteboards: Whiteboard[], currentWireframes: Wireframe[]) => {
    const viewportCenter = isMobileView ? null : canvasMethodsRef.current?.getViewportCenter();
    const placementOrigin = viewportCenter
      ? {
          x: Math.max(0, viewportCenter.x - 300),
          y: Math.max(0, viewportCenter.y - 210),
        }
      : undefined;

    return findOpenCanvasPosition([
      ...currentLists,
      ...currentNotes,
      ...currentWhiteboards,
      ...currentWireframes,
      ...vaults,
    ], undefined, placementOrigin);
  };

  // CRUD operations for Notes

  // Note handlers come from useCanvasCRUD

  // Whiteboard handlers come from useCanvasCRUD

  // Wireframe handlers come from useCanvasCRUD

  // Vault handlers come from useCanvasCRUD

  // List handlers come from useCanvasCRUD
  const handleOpenNewNoteModal = (position?: { x: number, y: number }) => {
    setNewNoteInitialPosition(position || getIntelligentPosition(lists, notes, whiteboards, wireframes));
    setShowNewNoteModal(true);
  };

  const handleOpenNewListModal = (position?: { x: number, y: number }) => {
    setNewListInitialPosition(position || getIntelligentPosition(lists, notes, whiteboards, wireframes));
    setShowNewListModal(true);
  };

  const handleOpenNewWhiteboardModal = (position?: { x: number, y: number }) => {
    logger.log('handleOpenNewWhiteboardModal called with position:', position);
    setNewWhiteboardInitialPosition(position || getIntelligentPosition(lists, notes, whiteboards, wireframes));
    setShowNewWhiteboardModal(true);
  };

  // Handler for button context menu actions
  const handleButtonAddList = () => {
    setShowButtonContextMenu(false);
    const position = getIntelligentPosition(lists, notes, whiteboards, wireframes); // Use intelligent positioning for button creation
    if (isMobileView) {
      setMobileListInitialPosition(position);
      setShowCreateModal(true);
    } else {
      setNewListInitialPosition(position);
      setShowNewListModal(true);
    }
  };

  const handleCanvasOnboardingComplete = async () => {
    await completeOnboarding();
    window.requestAnimationFrame(() => {
      handleOpenMenu(isMobileView ? 'mobile-new-canvas-button' : 'new-canvas-button');
    });
  };

  const handleButtonAddNote = () => {
    setShowButtonContextMenu(false);
    const position = getIntelligentPosition(lists, notes, whiteboards, wireframes); // Use intelligent positioning for button creation
    if (isMobileView) {
      setMobileNoteInitialPosition(position);
      setShowCreateNoteModal(true);
    } else {
      setNewNoteInitialPosition(position);
      setShowNewNoteModal(true);
    }
  };

  const handleButtonAddWhiteboard = () => {
    setShowButtonContextMenu(false);
    setNewWhiteboardInitialPosition(getIntelligentPosition(lists, notes, whiteboards, wireframes)); // Use intelligent positioning for button creation
    setShowNewWhiteboardModal(true);
  };

  const handleButtonAddWireframe = () => {
    setShowButtonContextMenu(false);
    setNewWireframeInitialPosition(getIntelligentPosition(lists, notes, whiteboards, wireframes)); // Use intelligent positioning for button creation
    setShowNewWireframeModal(true);
  };

  if (isLoading) {
    return (
      <PageLoading message="Loading Workspace..." className="h-full" />
    );
  }

  // Error handling is done in the main return statement

  // Utility functions for filtering lists and notes with unified categories
  const getUniqueTypes = () => {
    // Return only actual categories, no "all" filter
    return Array.from(new Set(categoryNames.filter(Boolean)));
  };

  const { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes } = filteredData;

  // Main render
  return (
    <PageLayout
      title="CANVAS"
      icon={<MapIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      headerActions={
        <CanvasToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          getUniqueCategories={getUniqueCategories}
          getCategoryCounts={getCategoryCounts}
          onAddClick={(e) => {
            e.preventDefault();
            e.stopPropagation();

            if (showButtonContextMenu) {
              handleCloseMenu();
            } else {
              handleOpenMenu('new-canvas-button');
            }
          }}
          theme={theme === 'dark' ? 'dark' : 'light'}
        />
      }
      mobileActions={
        <>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search canvas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 w-full"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="h-11 flex-1">
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
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
              <SelectTrigger className="h-11 flex-1">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {getUniqueCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === 'all' ? 'All Categories' : category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              id="mobile-new-canvas-button"
              aria-label="Add content"
              title="Add content"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenMenu('mobile-new-canvas-button');
              }}
              size="icon"
              className="h-11 w-11 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </>
      }
      mobileClassName="flex-col items-stretch gap-2 sticky top-0 z-10"
      frame="flush"
    >
      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={handleCanvasOnboardingComplete}
        onDismiss={dismissOnboarding}
        content={ONBOARDING_CONTENT.canvas}
      />

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
        {isLoading ? (
          <PageLoading message="Loading Canvas..." />
        ) : error ? (
          <ErrorState
            title="Unable to load canvas"
            description={error}
            actionLabel="Try again"
            onAction={() => void canvasData.refresh()}
          />
        ) : (
          // Conditional Rendering based on viewport size
          isMobileView ? (
            // Mobile: Stacked List View with scrolling
            <div className="flex-1 overflow-y-auto">
              <CanvasMobileListView
                filteredLists={filteredLists}
                filteredNotes={filteredNotes}
                filteredWhiteboards={filteredWhiteboards}
                allLists={lists}
                allNotes={notes}
                allWhiteboards={whiteboards}
                dbCategories={dbCategories}
                selectedFilter={selectedFilter}
                setSelectedFilter={setSelectedFilter}
                getUniqueTypes={getUniqueTypes}
                getFilterCounts={getFilterCounts}
                onAddList={handleButtonAddList}
                onAddNote={handleButtonAddNote}
                onAddWhiteboard={handleButtonAddWhiteboard}
                onUpdateList={updateList}
                onUpdateNote={handleUpdateNote}
                onUpdateWhiteboard={handleUpdateWhiteboard}
                onDeleteList={deleteList}
                onDeleteNote={handleDeleteNote}
                onDeleteWhiteboard={handleDeleteWhiteboard}
                onShareList={handleShareList}
                onShareNote={handleShareNote}
                onShareWhiteboard={handleShareWhiteboard}
                addCategory={addCategory}
                updateCategory={editCategory}
                editCategory={editCategory}
              />
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
                onNotePositionUpdate={handleNotePositionUpdate}
                onNoteDelete={handleDeleteNote}
                onNoteShare={handleShareNote}
                onWhiteboardUpdate={handleUpdateWhiteboard}
                onWhiteboardPositionUpdate={handleWhiteboardPositionUpdate}
                onWhiteboardDelete={handleDeleteWhiteboard}
                onWhiteboardShare={handleShareWhiteboard}
                onWireframeUpdate={handleUpdateWireframe}
                onWireframeDelete={handleDeleteWireframe}
                onWireframeShare={(wireframeId) => {
                  const wireframe = wireframes.find(w => w.id === wireframeId);
                  if (wireframe) {
                    setCurrentShareItem({
                      id: wireframeId,
                      title: wireframe.title || 'Untitled Wireframe',
                      itemType: 'wireframe',
                      shareData: wireframe.share_token && wireframe.is_public ? {
                        shareToken: wireframe.share_token,
                        shareUrl: `${window.location.origin}/shared/wireframe/${wireframe.share_token}`
                      } : undefined
                    });
                    setShowShareModal(true);
                  }
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
                      itemType: 'vault',
                      isLocked: vault.is_locked,
                      shareData: vault.share_token && vault.is_public ? {
                        shareToken: vault.share_token,
                        shareUrl: `${window.location.origin}/shared/vault/${vault.share_token}`
                      } : undefined
                    });
                    setShowShareModal(true);
                  }
                }}
                onVaultPositionUpdate={handleVaultPositionChange}
                addCategory={addCategory}
                updateCategory={editCategory}
                onOpenNewNoteModal={handleOpenNewNoteModal}
                onOpenNewListModal={handleOpenNewListModal}
                onOpenNewWhiteboardModal={handleOpenNewWhiteboardModal}
                onOpenNewWireframeModal={(position) => {
                  setNewWireframeInitialPosition(position || getIntelligentPosition(lists, notes, whiteboards, wireframes));
                  setShowNewWireframeModal(true);
                }}
                onOpenNewVaultModal={(position) => {
                  setNewVaultInitialPosition(position || getIntelligentPosition(lists, notes, whiteboards, wireframes));
                  setShowNewVaultModal(true);
                }}
                searchQuery={searchQuery}
                categoryFilter={categoryFilter}
                isWhiteboardCollapsed={isWhiteboardCollapsed}
                onToggleWhiteboardCollapsed={toggleWhiteboardCollapsed}
                isWireframeCollapsed={isWireframeCollapsed}
                onToggleWireframeCollapsed={toggleWireframeCollapsed}
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
        <>
          <CreateItemModal
            open={showCreateModal}
            onOpenChange={setShowCreateModal}
            itemType="list"
            onCreate={handleCreateList}
            position={mobileListInitialPosition || undefined}
            existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
            updateCategory={updateCategoryColor}
          />
          <CreateItemModal
            open={showCreateNoteModal}
            onOpenChange={setShowCreateNoteModal}
            itemType="note"
            onCreate={handleCreateNote}
            position={mobileNoteInitialPosition || undefined}
            existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
            updateCategory={updateCategoryColor}
          />
          {showNewNoteModal && newNoteInitialPosition && (
            <CreateItemModal
              open={showNewNoteModal}
              onOpenChange={setShowNewNoteModal}
              itemType="note"
              onCreate={handleCreateNote}
              position={newNoteInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewWhiteboardModal && newWhiteboardInitialPosition && (
            <CreateItemModal
              open={showNewWhiteboardModal}
              onOpenChange={setShowNewWhiteboardModal}
              itemType="whiteboard"
              onCreate={handleCreateWhiteboard}
              position={newWhiteboardInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewWireframeModal && newWireframeInitialPosition && (
            <CreateItemModal
              open={showNewWireframeModal}
              onOpenChange={setShowNewWireframeModal}
              itemType="wireframe"
              onCreate={handleCreateWireframe}
              position={newWireframeInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewVaultModal && newVaultInitialPosition && (
            <CreateItemModal
              open={showNewVaultModal}
              onOpenChange={setShowNewVaultModal}
              itemType="vault"
              onCreate={handleCreateVault}
              position={newVaultInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewListModal && newListInitialPosition && (
            <CreateItemModal
              open={showNewListModal}
              onOpenChange={setShowNewListModal}
              itemType="list"
              onCreate={handleCreateList}
              position={newListInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
        </>

        {/* Share Modal */}
        {showShareModal && currentShareItem && (
          <ShareModal
            open={showShareModal}
            onOpenChange={(open) => {
              if (!open) {
                setShowShareModal(false);
                setCurrentShareItem(null);
              }
            }}
            itemType={currentShareItem.itemType}
            itemId={currentShareItem.id}
            itemTitle={currentShareItem.title}
            onShare={shareHandlers[currentShareItem.itemType].onShare}
            onUnshare={shareHandlers[currentShareItem.itemType].onUnshare}
            existingShareData={currentShareItem.shareData}
            isLocked={currentShareItem.itemType === 'vault' ? currentShareItem.isLocked : undefined}
            showWarning={currentShareItem.itemType === 'vault'}
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
                setNewVaultInitialPosition(getIntelligentPosition(lists, notes, whiteboards, wireframes));
                setShowNewVaultModal(true);
              }}
              onClose={() => setShowButtonContextMenu(false)}
              isFromButton={true}
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default CanvasPage;
