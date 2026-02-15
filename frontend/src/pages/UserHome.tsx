import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CheckSquare } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CreateItemModal } from "@/components/CreateItemModal";
import { ListCard } from "@/components/ListCard";
import { useDatabaseCategories } from '@/hooks/useDatabaseCategories';

import api from "@/lib/api";
import { useAuthState } from "@/contexts/AuthContext";

interface ListItem {
  id: string;
  text: string;
  completed: boolean;
}

interface List {
  id: string;
  title: string;
  type: string; // maps to 'category' in backend
  items: ListItem[];
  createdAt: Date;
  color_value?: string | null; // Updated to match global type and backend
}

const UserHome = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const { toast } = useToast();
  const { isAuthenticated, token } = useAuthState();
  const { categories } = useDatabaseCategories();

  // Fetch all lists from the API
  useEffect(() => {
    if (isAuthenticated) {
      fetchLists();
    }
  }, [isAuthenticated]);

  const fetchLists = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/lists');
      
      // Map response data to our List type, ensuring correct category mapping and defaults
      const listsWithDataMapped = response.data.map((listFromBackend: any) => ({
        id: listFromBackend.id,
        title: listFromBackend.title,
        type: listFromBackend.category || 'General', // Map backend 'category' to frontend 'type'
        items: listFromBackend.items || [], // Ensure items is an array
        createdAt: new Date(listFromBackend.createdAt),
        color_value: listFromBackend.color_value || '#808080' // Use color_value, default to grey
      }));
      
      setLists(listsWithDataMapped);
    } catch (error) {
      console.error('Failed to fetch lists:', error);
      toast({
        title: "Error",
        description: "Could not retrieve your lists. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const createList = async (title: string, type: string) => {
    try {
      const response = await api.post('/api/lists', {
        title,
        category: type,
        items: []
      });
      
      const newList: List = {
        ...response.data,
        type: response.data.category, // Ensure backend returns category as type
        items: response.data.items || [], // Ensure items is an array
        createdAt: new Date(response.data.createdAt),
        color_value: response.data.color_value || '#808080' // Use color_value from response or default
      };
      
      setLists(prev => [newList, ...prev]);
      setShowCreateModal(false);
      
      toast({
        title: "List created!",
        description: `Your ${type} list "${title}" has been created.`,
      });

    } catch (error) {
      console.error('Failed to create list:', error);
      toast({
        title: "Error",
        description: "Could not create your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleCreateList = async (
    title: string,
    category: string,
    _color: string
  ) => {
    try {
      await createList(title, category);
      return true;
    } catch {
      return false;
    }
  };
 
  const deleteList = async (listId: string): Promise<boolean> => {
    try {
      await api.delete(`/api/lists/${listId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      setLists(prev => prev.filter(list => list.id !== listId));
      toast({
        title: "List deleted",
        description: "Your list has been removed.",
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

  const updateList = async (updatedList: List) => {
    try {
      // Prepare data for API
      const listData = {
        title: updatedList.title,
        category: updatedList.type,
        items: updatedList.items,
        color_value: updatedList.color_value // Add color_value to the payload
      };
      
      await api.put(`/api/lists/${updatedList.id}`, listData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const newCategory = updatedList.type;
      const oldList = lists.find(list => list.id === updatedList.id);
      const oldCategory = oldList ? oldList.type : undefined;

      setLists(prev => prev.map(list => 
        list.id === updatedList.id ? { ...updatedList, color_value: updatedList.color_value || '#808080' } : list
      ));

    } catch (error) {
      console.error('Failed to update list:', error);
      toast({
        title: "Error",
        description: "Could not update your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getTypeColor = (type: string) => {
    // Generate a consistent color based on the type string
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
      'bg-orange-500', 'bg-red-500', 'bg-teal-500', 
      'bg-pink-500', 'bg-indigo-500', 'bg-yellow-500'
    ];
    
    if (type === 'General') return 'bg-gray-500';
    
    let hash = 0;
    for (let i = 0; i < type.length; i++) {
      hash = type.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const filteredLists = lists.filter(list => {
    const matchesSearch = list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         list.items.some(item => item.text.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = selectedFilter === 'all' || list.type === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  const getUniqueTypes = () => {
    const types = new Set(lists.map(list => list.type || 'General'));
    return ['all', ...Array.from(types).sort()];
  };

  const getActualUniqueCategories = (): string[] => {
    const uniqueListTypes = Array.from(new Set(lists.map(list => list.type).filter(type => type && type.toLowerCase() !== 'general')));
    if (uniqueListTypes.length === 0 && lists.some(list => list.type && list.type.toLowerCase() === 'general')) {
      return ['General']; // Only return 'General' if it's explicitly used and no other categories exist
    }
    return uniqueListTypes.length > 0 ? uniqueListTypes.sort() : ['General']; // Default to 'General' if no categories
  };

  const getFilterCounts = () => {
    const counts: { [key: string]: number } = {
      all: lists.length,
    };
    
    lists.forEach(list => {
      counts[list.type] = (counts[list.type] || 0) + 1;
    });
    
    return counts;
  };

  // Handle sharing a list
  const handleShare = async (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    // For now, just show a toast notification
    // This can be expanded to show a share modal or copy share link
    toast({
      title: "Share feature",
      description: `Sharing functionality for "${list.title}" will be implemented soon.`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
      {/* Header */}
      <div className="bg-background border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">My Lists</h1>
                
                {/* Desktop search - moved next to My Lists */}
                <div className="relative hidden sm:block ml-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search lists..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9 w-48 bg-muted/20 border-border/50 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                
                

                <Button 
                  onClick={() => setShowCreateModal(true)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="hidden md:inline">New List</span>
                  <span className="md:hidden">New</span>
                </Button>
              </div>
            </div>
          </div>
          
          {/* Mobile search */}
          <div className="md:hidden pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search lists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-muted/20 border-border/50"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
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

        {/* Loading state */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-8 bg-slate-200 rounded w-32 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-64"></div>
            </div>
          </div>
        ) : filteredLists.length === 0 ? (
          <div className="text-center py-12">
            {lists.length === 0 ? (
              <div className="max-w-md mx-auto">
                <div className="bg-card rounded-lg shadow-sm border border-border p-12">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <CheckSquare className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    No lists yet
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Get organized with custom lists for any purpose - shopping, notes, tasks, and more.
                  </p>
                  <Button 
                    onClick={() => setShowCreateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create List
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto">
                <div className="bg-card rounded-lg shadow-sm border border-border p-12">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No results found</h3>
                  <p className="text-muted-foreground mb-4">
                    No lists match your search criteria
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onUpdate={updateList}
                onDelete={deleteList}
                onShare={handleShare}
                existingCategories={categories}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create List Modal */}
      <CreateItemModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        itemType="list"
        onCreate={handleCreateList}
        existingCategories={categories}
        position={{ x: 0, y: 0 }}
      />
    </div>
  );
};

export default UserHome;
