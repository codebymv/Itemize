import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import CreateListModal from "@/components/CreateListModal";
import ListCard from "@/components/ListCard";
import AISuggestToggle from "@/components/ui/AISuggestToggle";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface ListItem {
  id: string;
  text: string;
  completed: boolean;
}

interface List {
  id: string;
  title: string;
  type: string;
  items: ListItem[];
  createdAt: Date;
  color: string;
}

const UserHome = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const { toast } = useToast();
  const { isAuthenticated, token } = useAuth();

  // Fetch all lists from the API
  useEffect(() => {
    if (isAuthenticated) {
      fetchLists();
    }
  }, [isAuthenticated]);

  const fetchLists = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/lists', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      // Map response data to our List type with proper color
      const listsWithColor = response.data.map((list: any) => ({
        ...list,
        createdAt: new Date(list.createdAt),
        color: getTypeColor(list.category || 'General')
      }));
      
      setLists(listsWithColor);
    } catch (error) {
      console.error('Failed to fetch lists:', error);
      toast({
        title: "Error fetching lists",
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
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const newList: List = {
        ...response.data,
        type: response.data.category,
        createdAt: new Date(response.data.createdAt),
        color: getTypeColor(type)
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
        title: "Error creating list",
        description: "Could not create your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const deleteList = async (listId: string) => {
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
    } catch (error) {
      console.error('Failed to delete list:', error);
      toast({
        title: "Error deleting list",
        description: "Could not delete your list. Please try again.",
        variant: "destructive"
      });
    }
  };

  const updateList = async (updatedList: List) => {
    try {
      // Prepare data for API
      const listData = {
        title: updatedList.title,
        category: updatedList.type,
        items: updatedList.items
      };
      
      await api.put(`/api/lists/${updatedList.id}`, listData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      setLists(prev => prev.map(list => 
        list.id === updatedList.id ? updatedList : list
      ));
    } catch (error) {
      console.error('Failed to update list:', error);
      toast({
        title: "Error updating list",
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
    const types = ['all'];
    const uniqueTypes = new Set(lists.map(list => list.type));
    types.push(...Array.from(uniqueTypes).sort());
    return types;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">My Lists</h1>
                
                {/* Desktop search - moved next to My Lists */}
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
                  onClick={() => setShowCreateModal(true)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">New List</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onUpdate={updateList}
                onDelete={deleteList}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create List Modal */}
      <CreateListModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateList={createList}
      />
    </div>
  );
};

export default UserHome;
