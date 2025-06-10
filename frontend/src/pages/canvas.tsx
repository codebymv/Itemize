import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Filter } from 'lucide-react';
import { CanvasContainer, CanvasContainerMethods } from '../components/Canvas/CanvasContainer';
import { fetchCanvasLists, createList as apiCreateList, updateList as apiUpdateList, deleteList as apiDeleteList } from '../services/api';
import { List } from '../types';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import AISuggestToggle from '../components/ui/AISuggestToggle';
import { useToast } from "../hooks/use-toast";
import CreateListModal from "../components/CreateListModal";
import { ListCard } from "../components/ListCard";
import { useAuth } from "../contexts/AuthContext";

const CanvasPage: React.FC = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isMobileView, setIsMobileView] = useState(false);
  const { toast } = useToast();
  const { token } = useAuth();
  
  // Reference to canvas container methods
  const canvasMethodsRef = useRef<CanvasContainerMethods | null>(null);
  
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
        const fetchedLists = await fetchCanvasLists();
        setLists(fetchedLists);
        
        // Extract unique categories
        const categories = Array.from(
          new Set(fetchedLists.map((list) => list.type))
        ).filter(Boolean);
        
        setExistingCategories(categories);
      } catch (error) {
        console.error('Error fetching lists:', error);
        setError('Failed to load lists. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    getLists();
  }, []);

  // CRUD operations for lists (used by mobile view)
  const createList = async (title: string, type: string) => {
    try {
      const response = await apiCreateList({ title, type, items: [] });
      
      // Handle the response properly based on the API response structure
      const newList: List = {
        id: response.id,
        title: response.title,
        type: response.type || 'General', // Use the type field directly
        items: response.items || [], // Ensure items is an array
        createdAt: new Date(response.createdAt),
        // Add any other required List properties
      };
      
      setLists(prev => [newList, ...prev]);
      setShowCreateModal(false);
      
      // Update categories if needed
      if (type && !existingCategories.includes(type)) {
        setExistingCategories(prev => [...prev, type]);
      }
      
      toast({
        title: "List created!",
        description: `Your ${type} list "${title}" has been created.`,
      });
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
      await apiUpdateList(updatedList);
      
      // Update local state
      setLists(prev =>
        prev.map(list => list.id === updatedList.id ? updatedList : list)
      );
      
      // Update categories if this introduced a new category
      if (updatedList.type && !existingCategories.includes(updatedList.type)) {
        setExistingCategories(prev => [...prev, updatedList.type]);
      }
      
      toast({
        title: "List updated",
        description: "Your list has been updated successfully.",
      });
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
      await apiDeleteList(listId);
      
      // Update local state
      setLists(prev => prev.filter(list => list.id !== listId));
      
      toast({
        title: "List deleted",
        description: "Your list has been removed.",
      });
    } catch (error) {
      console.error('Failed to delete list:', error);
      toast({
        title: "Error deleting list",
        description: "Could not delete your list. Please try again.",
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
                  <h1 className="text-2xl font-bold">My Canvas</h1>
                  
                  {/* Desktop search - next to My Canvas */}
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
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary mr-2"></div>
                    <span>Loading...</span>
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
                  <h1 className="text-2xl font-bold">My Canvas</h1>
                  
                  {/* Desktop search - next to My Canvas */}
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

  // Utility functions for filtering lists
  const getUniqueTypes = () => {
    const types = ['all', ...existingCategories];
    // Ensure there are no duplicates or empty values
    return Array.from(new Set(types.filter(Boolean)));
  };

  const getFilteredLists = () => {
    let filtered = [...lists];
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(list => {
        return list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (list.items && list.items.some(item => 
              item.text?.toLowerCase().includes(searchQuery.toLowerCase())
            ));
      });
    }
    
    // Apply category filter (only in mobile view)
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(list => list.type === selectedFilter);
    }
    
    return filtered;
  };
  
  // Get count of lists per category for filter tabs
  const getFilterCounts = () => {
    const counts: Record<string, number> = { all: lists.length };
    
    lists.forEach(list => {
      if (list.type) {
        counts[list.type] = (counts[list.type] || 0) + 1;
      }
    });
    
    return counts;
  };

  const filteredLists = getFilteredLists();

  // Header component shared by both views
  const HeaderSection = () => (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">My Canvas</h1>
              
              {/* Desktop search - next to My Canvas */}
              <div className="relative hidden sm:block ml-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  placeholder="Search lists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-48 h-9"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* AI Suggest Toggle */}
              <AISuggestToggle />
              
              <Button 
                id="new-canvas-button"
                onClick={(e) => {
                  if (isMobileView) {
                    // For mobile, open the standard modal
                    setShowCreateModal(true);
                  } else if (canvasMethodsRef.current) {
                    // For desktop, use canvas methods
                    const buttonElement = document.getElementById('new-canvas-button');
                    
                    if (buttonElement) {
                      const rect = buttonElement.getBoundingClientRect();
                      const position = { x: 0, y: 0 }; // Placeholder
                      const absolutePosition = {
                        x: rect.left + rect.width/2,
                        y: rect.bottom + 5 
                      };
                      
                      canvasMethodsRef.current.showAddListMenu(
                        position,
                        true, // isFromButton
                        absolutePosition
                      );
                    }
                  }
                }}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">New</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mobile search */}
        <div className="sm:hidden pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              placeholder="Search lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
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
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 overflow-x-auto pb-2">
          {getUniqueTypes().map((filter) => {
            const count = getFilterCounts()[filter] || 0;
            return (
              <Button
                key={filter}
                variant={selectedFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFilter(filter)}
                className={`capitalize ${selectedFilter === filter ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
              >
                {filter} ({count})
              </Button>
            );
          })}
        </div>

        {/* Lists section */}
        {filteredLists.length === 0 ? (
          <div className="text-center py-12">
            {lists.length === 0 ? (
              <div className="max-w-md mx-auto">
                <div className="bg-white rounded-lg shadow-sm border p-8">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Create your first list
                  </h3>
                  <p className="text-slate-600 mb-6">
                    Get organized with custom lists for any purpose - shopping, notes, tasks, and more.
                  </p>
                  <Button 
                    onClick={() => setShowCreateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create List
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-slate-500">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No lists match your search criteria.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onUpdate={updateList}
                onDelete={deleteList}
                existingCategories={existingCategories}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Main render
  return (
    <div className="">
      <HeaderSection />
      
      {/* Conditional Rendering based on viewport size */}
      {isMobileView ? (
        // Mobile: Stacked List View
        <MobileListView />
      ) : (
        // Desktop: Canvas View with drag and drop
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <CanvasContainer 
            existingCategories={existingCategories} 
            searchQuery={searchQuery}
            onReady={(methods) => {
              canvasMethodsRef.current = methods;
              console.log('Canvas methods ready');
            }}
          />
        </div>
      )}
      
      {/* Create List Modal - used by mobile view */}
      <CreateListModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateList={createList}
        existingCategories={existingCategories}
      />
    </div>
  );
};

export default CanvasPage;
