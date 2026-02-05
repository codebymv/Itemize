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
import { useHeader } from '../contexts/HeaderContext';
import { MobileControlsBar } from '../components/MobileControlsBar';
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
import { CANVAS_CENTER, BASE_SPREAD_RADIUS, ITEM_WIDTH, ITEM_HEIGHT, MIN_DISTANCE, MAX_POSITION_ATTEMPTS } from './canvas/constants/canvasConstants';

const CanvasPage: React.FC = () => {
  const { theme } = useTheme();
  // Use the header context to set the header content
  const { setHeaderContent } = useHeader();

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
    loadingLists,
    loadingNotes,
    loadingWhiteboards,
    loadingWireframes,
    loadingVaults,
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

  const { toast } = useToast();
  const { token } = useAuthState();

  const { enqueuePositionUpdate } = useCanvasPositionSync(token);
  const updateWireframe = useCallback((updated: Wireframe) => {
    setWireframes(prev => prev.map(w => w.id === updated.id ? updated : w));
  }, [setWireframes]);
  const { socket, isConnected } = useCanvasWebSocket(token, updateWireframe);
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
    isListCollapsed,
    toggleListCollapsed,
    isNoteCollapsed,
    toggleNoteCollapsed,
    isWhiteboardCollapsed,
    toggleWhiteboardCollapsed,
    listToggleCallbacks,
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
    handleShareVault,
  } = useCanvasSharing(lists, notes, whiteboards, vaults, token);


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
    handleCreateWhiteboard,
    handleUpdateWhiteboard,
    handleDeleteWhiteboard,
    handleWhiteboardPositionUpdate,
    handleCreateWireframe,
    handleUpdateWireframe,
    handleDeleteWireframe,
    handleWireframePositionChange,
    handleCreateVault,
    handleUpdateVault,
    handleDeleteVault,
    handleVaultPositionChange,
  } = useCanvasCRUD(
    token,
    { isCategoryInUse, addCategory },
    { setLists, setNotes, setWhiteboards, setWireframes, setVaults },
    enqueuePositionUpdate
  );

  const handleCreateNote = async (title: string, category: string, color: string, position: { x: number; y: number }) => {
    const newNote = await createNote(title, category, color, position);
    if (newNote) {
      setShowNewNoteModal(false);
    }
    return newNote;
  };

  const handleCreateList = async (title: string, type: string, color: string, position: { x: number; y: number }) => {
    const newList = await createList(title, type, color, position);
    if (newList) {
      setShowNewListModal(false);
    }
    return newList;
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
          } catch (error: any) {
            logger.error(`Failed to update list ${list.id} color:`, error);

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

  // Reference to canvas container methods
  const canvasMethodsRef = useRef<CanvasContainerMethods | null>(null);

  // Redirect mobile users to Contents page (Canvas requires desktop for infinite canvas functionality)
  useEffect(() => {
    if (isMobileView) {
      navigate('/contents', { replace: true });
    }
  }, [isMobileView, navigate]);

  // Header content effect - Pushes search bar and controls to the AppShell header
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2">
          <MapIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 className="text-xl font-semibold italic truncate" style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}>
            CANVAS
          </h1>
        </div>

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
      </div>
    );

    return () => setHeaderContent(null);
  }, [searchQuery, typeFilter, categoryFilter, theme, showButtonContextMenu, setHeaderContent, getUniqueCategories, getCategoryCounts]);

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

  // CRUD operations for Notes

  // Note handlers come from useCanvasCRUD

  // Whiteboard handlers come from useCanvasCRUD

  // Wireframe handlers come from useCanvasCRUD

  // Vault handlers come from useCanvasCRUD

  // List handlers come from useCanvasCRUD
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
    const position = getIntelligentPosition(); // Use intelligent positioning for button creation
    if (isMobileView) {
      setMobileListInitialPosition(position);
      setShowCreateModal(true);
    } else {
      setNewListInitialPosition(position);
      setShowNewListModal(true);
    }
  };

  const handleButtonAddNote = () => {
    setShowButtonContextMenu(false);
    const position = getIntelligentPosition(); // Use intelligent positioning for button creation
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
    setNewWhiteboardInitialPosition(getIntelligentPosition()); // Use intelligent positioning for button creation
    setShowNewWhiteboardModal(true);
  };

  const handleButtonAddWireframe = () => {
    setShowButtonContextMenu(false);
    setNewWireframeInitialPosition(getIntelligentPosition()); // Use intelligent positioning for button creation
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
    <>
      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={completeOnboarding}
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
        {/* Mobile Controls */}
        <MobileControlsBar className="flex-col items-stretch gap-2 sticky top-0 z-10">
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
              <SelectTrigger className="flex-1 h-9">
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
              <SelectTrigger className="flex-1 h-9">
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOpenMenu('mobile-new-canvas-button');
              }}
              size="icon"
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </MobileControlsBar>

        {isLoading ? (
          <PageLoading message="Loading Canvas..." />
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
                isListCollapsed={isListCollapsed}
                toggleListCollapsed={toggleListCollapsed}
                isNoteCollapsed={isNoteCollapsed}
                toggleNoteCollapsed={toggleNoteCollapsed}
                isWhiteboardCollapsed={isWhiteboardCollapsed}
                toggleWhiteboardCollapsed={toggleWhiteboardCollapsed}
                listToggleCallbacks={listToggleCallbacks}
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
                  // TODO: Implement wireframe sharing
                  logger.log('Share wireframe:', wireframeId);
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
        <>
          <CreateItemModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            itemType="list"
            onCreate={handleCreateList}
            position={mobileListInitialPosition || undefined}
            existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
            updateCategory={updateCategoryColor}
          />
          <CreateItemModal
            isOpen={showCreateNoteModal}
            onClose={() => setShowCreateNoteModal(false)}
            itemType="note"
            onCreate={handleCreateNote}
            position={mobileNoteInitialPosition || undefined}
            existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
            updateCategory={updateCategoryColor}
          />
          {showNewNoteModal && newNoteInitialPosition && (
            <CreateItemModal
              isOpen={showNewNoteModal}
              onClose={() => setShowNewNoteModal(false)}
              itemType="note"
              onCreate={handleCreateNote}
              position={newNoteInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewWhiteboardModal && newWhiteboardInitialPosition && (
            <CreateItemModal
              isOpen={showNewWhiteboardModal}
              onClose={() => setShowNewWhiteboardModal(false)}
              itemType="whiteboard"
              onCreate={handleCreateWhiteboard}
              position={newWhiteboardInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewWireframeModal && newWireframeInitialPosition && (
            <CreateItemModal
              isOpen={showNewWireframeModal}
              onClose={() => setShowNewWireframeModal(false)}
              itemType="wireframe"
              onCreate={handleCreateWireframe}
              position={newWireframeInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewVaultModal && newVaultInitialPosition && (
            <CreateItemModal
              isOpen={showNewVaultModal}
              onClose={() => setShowNewVaultModal(false)}
              itemType="vault"
              onCreate={handleCreateVault}
              position={newVaultInitialPosition}
              existingCategories={dbCategories.map(cat => ({ name: cat.name, color_value: cat.color_value }))}
              updateCategory={updateCategoryColor}
            />
          )}
          {showNewListModal && newListInitialPosition && (
            <CreateItemModal
              isOpen={showNewListModal}
              onClose={() => setShowNewListModal(false)}
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
            isOpen={showShareModal}
            onClose={() => {
              setShowShareModal(false);
              setCurrentShareItem(null);
            }}
            itemType={currentShareItem.itemType}
            itemId={currentShareItem.id}
            itemTitle={currentShareItem.title}
            onShare={shareHandlers[currentShareItem.itemType].onShare}
            onUnshare={shareHandlers[currentShareItem.itemType].onUnshare}
            existingShareData={currentShareItem.shareData}
            isLocked={currentShareItem.itemType === 'vault' ? currentShareItem.isLocked : undefined}
            showWarning={currentShareItem.itemType === 'vault'}
            autoGenerate={currentShareItem.itemType !== 'vault'}
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
