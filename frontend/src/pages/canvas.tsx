import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Filter, Palette } from 'lucide-react';
import { CanvasContainer, CanvasContainerMethods } from '../components/Canvas/CanvasContainer';
import { ContextMenu } from '../components/Canvas/ContextMenu';
import { fetchCanvasLists, createList as apiCreateList, updateList as apiUpdateList, deleteList as apiDeleteList, getNotes, createNote as apiCreateNote, updateNote as apiUpdateNote, deleteNote as apiDeleteNote, CreateNotePayload } from '../services/api';
import { List, Note } from '../types';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import AISuggestToggle from '../components/ui/AISuggestToggle';
import { useToast } from "../hooks/use-toast";
import CreateListModal from "../components/CreateListModal";
import CreateNoteModal from "../components/CreateNoteModal";
import { ListCard } from "../components/ListCard";
import { useAuth } from "../contexts/AuthContext";
import { NoteCard } from '../components/NoteCard';
import { NewNoteModal } from '../components/NewNoteModal';
import { NewListModal } from '../components/NewListModal';
import { useUnifiedCategories } from '../hooks/useUnifiedCategories';

const CanvasPage: React.FC = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [activeMobileMenu, setActiveMobileMenu] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [newNoteInitialPosition, setNewNoteInitialPosition] = useState<{ x: number, y: number } | null>(null);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const { toast } = useToast();
  const { token } = useAuth();

  // State for Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [errorNotes, setErrorNotes] = useState<string | null>(null);

  // Unified category management for both lists and notes
  const {
    categories,
    categoryNames,
    totalCategories,
    filterByCategory,
    getCategorySuggestions,
    isCategoryInUse,
    getCategoryDisplayText
  } = useUnifiedCategories(lists, notes);
  
  // Reference to canvas container methods
  const canvasMethodsRef = useRef<CanvasContainerMethods | null>(null);
  
  // Button context menu state (separate from canvas context menu)
  const [showButtonContextMenu, setShowButtonContextMenu] = useState(false);
  const [buttonMenuPosition, setButtonMenuPosition] = useState({ x: 0, y: 0 });
  
  // Collapsible state management - persists across filter changes
  const [collapsedListIds, setCollapsedListIds] = useState<Set<string>>(new Set());
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<Set<number>>(new Set());
  
  // Utility function for intelligent positioning of mobile-created items
  const getIntelligentPosition = () => {
    const centerX = 2000; // Canvas center X coordinate
    const centerY = 2000; // Canvas center Y coordinate  
    const baseSpreadRadius = 300; // Base random spread area around center
    const itemWidth = 350; // Approximate width of list/note cards
    const itemHeight = 250; // Approximate height of list/note cards
    const minDistance = 50; // Minimum distance between items
    
    // Get all existing positions from lists and notes
    const existingPositions: Array<{ x: number; y: number }> = [
      ...lists.map(list => ({ x: list.position_x || 0, y: list.position_y || 0 })),
      ...notes.map(note => ({ x: note.position_x, y: note.position_y }))
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
  const toggleListCollapsed = (listId: string) => {
    setCollapsedListIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(listId)) {
        newSet.delete(listId);
      } else {
        newSet.add(listId);
      }
      return newSet;
    });
  };
  
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
  
  // Check viewport size for responsive layout
  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 768); // Consider tablet and phone as mobile view
    };
    
    // Initial check
    checkMobileView();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkMobileView);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkMobileView);
  }, []);

  // Fetch lists on component mount
  useEffect(() => {
    const getLists = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetchedLists = await fetchCanvasLists(token);
        setLists(fetchedLists);
        
        // Categories are now managed by useUnifiedCategories hook
      } catch (error) {
        console.error('Error fetching lists:', error);
        setError('Failed to load lists. Please try again.');
      } finally {
        setLoading(false);
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
        const fetchedNotes = await getNotes(token);
        setNotes(fetchedNotes);
      } catch (err) {
        console.error('Error fetching notes:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load notes. Please try again.';
        setErrorNotes(errorMessage);
        toast({ title: "Error fetching notes", description: errorMessage, variant: "destructive" });
      } finally {
        setLoadingNotes(false);
      }
    };

    if (token) { // Only fetch if authenticated
      fetchNotesData();
    }
  }, [token, toast]); // Re-fetch if token changes, include toast in dependencies

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
      const payloadWithDefaults: CreateNotePayload = {
        content: title, // Just use the title as content
        color_value: color, // Use selected color
        position_x: position.x,
        position_y: position.y,
        width: 200,
        height: 200,
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
        title: "Error creating note",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleUpdateNote = async (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const updatedNote = await apiUpdateNote(noteId, updatedData, token);
      setNotes(prev => prev.map(n => n.id === noteId ? updatedNote : n));
      return updatedNote;
    } catch (error) {
      console.error('Failed to update note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not update your note. Please try again.';
      toast({
        title: "Error updating note",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await apiDeleteNote(noteId, token);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      return true;
    } catch (error) {
      console.error('Failed to delete note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not delete your note. Please try again.';
      toast({
        title: "Error deleting note",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  // CRUD operations for lists (used by mobile view)
  const createList = async (title: string, type: string, color: string) => {
    try {
      const position = getIntelligentPosition();
      
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
      
      setLists(prev => [newList, ...prev]);
      setShowCreateModal(false);
      
      // Update categories if needed
      // Category is now managed by unified category system
      
      // Removed success toast - no need to distract user for routine list creation
    } catch (error) {
      console.error('Failed to create list:', error);
      toast({
        title: "Error creating list",
        description: "Could not create your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const updateList = async (updatedList: List) => {
    try {
      // Make API call to update the list
      await apiUpdateList(updatedList, token);
      
      // Update local state
      setLists(prev =>
        prev.map(list => list.id === updatedList.id ? updatedList : list)
      );
      
      // Update categories if this introduced a new category
      // Categories are now managed by unified category system
      
      // Removed success toast - no need to distract user for routine list updates
    } catch (error) {
      console.error('Failed to update list:', error);
      toast({
        title: "Error updating list",
        description: "Could not update your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const deleteList = async (listId: string) => {
    try {
      await apiDeleteList(listId, token);
      
      // Update local state
      setLists(prev => prev.filter(list => list.id !== listId));
      
      // Removed success toast - no need to distract user for routine deletions
    } catch (error) {
      console.error('Failed to delete list:', error);
      toast({
        title: "Error deleting list",
        description: "Could not delete your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handler for NewListModal list creation
  const handleNewListCreated = (newList: List) => {
    setLists(prev => [newList, ...prev]);
    setShowNewListModal(false);
  };

  const handleOpenNewNoteModal = (position: { x: number, y: number }) => {
    setNewNoteInitialPosition(position);
    setShowNewNoteModal(true);
  };

  // Handler for button context menu actions
  const handleButtonAddList = () => {
    setShowButtonContextMenu(false);
    
    // Use the same NewListModal for both mobile and desktop for consistency
    setShowNewListModal(true);
  };

  const handleButtonAddNote = () => {
    setShowButtonContextMenu(false);
    setNewNoteInitialPosition({ x: 100, y: 100 }); // Default position for button creation
    setShowNewNoteModal(true);
  };

  // Mobile note creation function (mirrors createList)
  const createNote = async (title: string, category: string, color: string) => {
    try {
      const position = getIntelligentPosition();
      
      const response = await apiCreateNote({
        content: title, // Just use the title as content
        color_value: color, // Use selected color
        position_x: position.x,
        position_y: position.y,
        width: 200,
        height: 200,
        z_index: 0,
      }, token);
      
      setNotes(prev => [response, ...prev]);
      setShowCreateNoteModal(false);
      
      // Categories are now managed by unified category system
      
      // Removed success toast - no need to distract user for routine note creation
    } catch (error) {
      console.error('Failed to create note:', error);
      toast({
        title: "Error creating note",
        description: "Could not create your note. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="">
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-5 w-5 text-slate-600" />
                    <h1 className="text-xl font-light italic whitespace-nowrap" style={{ fontFamily: '"Raleway", sans-serif' }}>Canvas</h1>
                  </div>
                  
                  {/* Desktop search - next to Canvas */}
                  <div className="relative hidden sm:block ml-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                    <div className="animate-pulse bg-slate-200 rounded-md w-48 h-9"></div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* AI Suggest Toggle (placeholder) */}
                  <div className="animate-pulse bg-slate-200 rounded-md w-12 h-6"></div>
                  
                  {/* Loading indicator */}
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-600 mr-2"></div>
                    <span className="text-black">Loading...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg">
              <Skeleton className="h-full w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="">
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-5 w-5 text-slate-600" />
                    <h1 className="text-xl font-light italic whitespace-nowrap" style={{ fontFamily: '"Raleway", sans-serif' }}>Canvas</h1>
                  </div>
                  
                  {/* Desktop search - next to Canvas */}
                  <div className="relative hidden sm:block ml-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                    <Input
                      placeholder="Search lists..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-48 h-9"
                      disabled
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* AI Suggest Toggle */}
                  <AISuggestToggle />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="text-destructive text-lg mb-4">⚠️ {error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Utility functions for filtering lists and notes with unified categories
  const getUniqueTypes = () => {
    // Return only actual categories, no "all" filter
    return Array.from(new Set(categoryNames.filter(Boolean)));
  };

  const getFilteredContent = () => {
    // Use unified category filtering for both lists and notes
    // null selectedFilter means show all content (no filtering)
    const { filteredLists, filteredNotes } = filterByCategory(selectedFilter);
    
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
    
    return { 
      filteredLists: searchFilteredLists, 
      filteredNotes: searchFilteredNotes 
    };
  };
  
  // Get count of lists and notes per category for filter tabs
  const getFilterCounts = () => {
    const counts: Record<string, number> = {};
    
    // Use unified category data for counts
    categories.forEach(category => {
      counts[category.name] = category.totalCount;
    });
    
    return counts;
  };

  const { filteredLists, filteredNotes } = getFilteredContent();

  // Header component shared by both views
  const HeaderSection = () => (
    <div className="bg-white border-b border-slate-200 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Palette className="h-5 w-5 text-slate-600" />
              <h1 className="text-xl font-light italic whitespace-nowrap" style={{ fontFamily: '"Raleway", sans-serif' }}>Canvas</h1>
              
              {/* Desktop search - next to My Canvas */}
              <div className="relative hidden sm:block ml-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  placeholder="Search canvas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-48 h-9"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* AI Suggest Toggle */}
              <AISuggestToggle />
              
              {/* New Button (for both lists and notes) */}
              <Button 
                id="new-canvas-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Show button context menu for both mobile and desktop
                  if (showButtonContextMenu) {
                    // Close if already open
                    setShowButtonContextMenu(false);
                  } else {
                    // Open button context menu
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
                className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap font-light"
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mobile search */}
        <div className="sm:hidden pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              placeholder="Search canvas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 placeholder:font-light placeholder:text-slate-400"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile List View Component (similar to UserHome.tsx)
  const MobileListView = () => {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Categories Section */}
        <div className="flex items-center gap-4 mb-8">
          <h3 className="text-lg font-light text-slate-900 flex-shrink-0">Categories</h3>
          
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
                  className={`capitalize font-light whitespace-nowrap flex-shrink-0 ${isActive ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                >
                  {filter} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {/* Content section - Lists and Notes */}
        {filteredLists.length === 0 && filteredNotes.length === 0 ? (
          <div className="text-center py-12">
            {lists.length === 0 && notes.length === 0 ? (
              <div className="max-w-md mx-auto">
                <div className="bg-white rounded-lg shadow-sm border p-8">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-light text-slate-900 mb-6">
                    No content on your canvas<br/>(for now!)
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button 
                      onClick={() => setShowNewListModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 font-normal"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add List
                    </Button>
                    <Button 
                      onClick={() => setShowCreateNoteModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 font-normal"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Note
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500">
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
                <h2 className="text-xl font-light text-slate-900 mb-6">My Lists</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredLists.map((list) => (
                    <ListCard
                      key={list.id}
                      list={list}
                      onUpdate={updateList}
                      onDelete={deleteList}
                      existingCategories={categoryNames}
                      isCollapsed={isListCollapsed(list.id)}
                      onToggleCollapsed={() => toggleListCollapsed(list.id)}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* My Notes section */}
            {filteredNotes.length > 0 && (
              <div className={filteredLists.length > 0 ? "mt-12" : ""}>
                <h2 className="text-xl font-light text-slate-900 mb-6">My Notes</h2>
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
                      existingCategories={categoryNames}
                      isCollapsed={isNoteCollapsed(note.id)}
                      onToggleCollapsed={() => toggleNoteCollapsed(note.id)}
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
      <div className={`w-full flex flex-col ${isMobileView ? 'min-h-screen' : 'h-screen overflow-hidden'}`}>
        <HeaderSection />
      
      {/* Conditional Rendering based on viewport size */}
      {isMobileView ? (
        // Mobile: Stacked List View with scrolling
        <div className="flex-1 overflow-y-auto">
          <MobileListView />
        </div>
      ) : (
        // Desktop: Full-width Canvas View with drag and drop
        <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] absolute inset-x-0" style={{ top: 0, bottom: 0 }}>
          <CanvasContainer 
            existingCategories={categoryNames} 
            searchQuery={searchQuery}
            onOpenNewNoteModal={handleOpenNewNoteModal} 
            notes={notes} // Pass notes state
            onNoteUpdate={handleUpdateNote} // Pass update handler
            onNoteDelete={handleDeleteNote} // Pass delete handler
            onReady={(methods) => {
              canvasMethodsRef.current = methods;
              console.log('Canvas methods ready:', methods);
            }}
          />
        </div>
      )}
      
      {/* Create List Modal - used by mobile view */}
      <CreateListModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateList={createList}
        existingCategories={categoryNames}
      />
      
      {/* Create Note Modal - used by mobile view */}
      <CreateNoteModal
        isOpen={showCreateNoteModal}
        onClose={() => setShowCreateNoteModal(false)}
        onCreateNote={createNote}
        existingCategories={categoryNames}
      />
      
      {/* Desktop Canvas Note Modal */}
      {showNewNoteModal && newNoteInitialPosition && (
        <NewNoteModal
          isOpen={showNewNoteModal}
          onClose={() => setShowNewNoteModal(false)}
          onCreateNote={handleCreateNote} 
          initialPosition={newNoteInitialPosition}
          existingCategories={categoryNames}
        />
      )}

      {/* Unified New List Modal - used by both mobile and desktop */}
      {showNewListModal && (
        <NewListModal
          isOpen={showNewListModal}
          onClose={() => setShowNewListModal(false)}
          onListCreated={handleNewListCreated}
          existingCategories={categoryNames}
          position={getIntelligentPosition()} // Use intelligent positioning for mobile-created lists
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
