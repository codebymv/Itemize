import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, MoreVertical, Trash2, Edit3, CheckCircle, Circle, GripVertical } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CreateItemModal } from "@/components/CreateItemModal";
import { ListCard } from "@/components/ListCard";
import { ShareModal } from "@/components/ShareModal";
import QuickAddForm from "@/components/QuickAddForm";
import { useDatabaseCategories } from '@/hooks/useDatabaseCategories';
import api, { getAuthToken } from '@/lib/api';

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

const Index = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Sharing modal states
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentShareItem, setCurrentShareItem] = useState<{ id: string; title: string; itemType: 'list'; shareData?: { shareToken: string; shareUrl: string } } | null>(null);

  const { toast } = useToast();
  const { categories } = useDatabaseCategories();

  const createList = (title: string, type: string) => {
    const newList: List = {
      id: Date.now().toString(),
      title,
      type,
      items: [],
      createdAt: new Date(),
      color: getTypeColor(type)
    };
    
    setLists(prev => [newList, ...prev]);
    setShowCreateModal(false);
    
    toast({
      title: "List created!",
      description: `Your ${type} list "${title}" has been created.`,
    });
  };

  const handleCreateList = async (
    title: string,
    category: string,
    _color: string
  ) => {
    createList(title, category);
    return true;
  };

  const deleteList = async (listId: string): Promise<boolean> => {
    try {
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
        description: "Could not delete your list. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  };

  const updateList = (updatedList: List) => {
    setLists(prev => prev.map(list => 
      list.id === updatedList.id ? updatedList : list
    ));
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

  const getActualUniqueCategories = (): string[] => {
    if (!lists || lists.length === 0) {
      return [];
    }
    // Ensure list.type is treated as string and filter out any undefined/null if they sneak in
    const uniqueCategories = new Set(lists.map(list => String(list.type || '')).filter(Boolean)); 
    return Array.from(uniqueCategories).sort();
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

  // Sharing functions
  const handleShareList = async (listId: string) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    setCurrentShareItem({ id: listId, title: list.title, itemType: 'list' });
    setShowShareModal(true);
  };

  const handleListShare = async (listId: string): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
      const response = await api.post(`/api/lists/${listId}/share`, {}, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
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
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
    } catch (error) {
      console.error('Error unsharing list:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {lists.length} {lists.length === 1 ? 'list' : 'lists'}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search lists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 w-64 bg-muted/20 border-border/50 focus:bg-background transition-colors"
                />
              </div>
              
              {/* <Button 
                onClick={() => setShowCreateModal(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">New List</span>
              </Button> */}
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

        {/* Quick Add Section */}
        {lists.length > 0 && (
          <div className="mb-8">
            <QuickAddForm onCreateList={createList} />
          </div>
        )}

        {/* Lists Grid */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onUpdate={updateList}
                onDelete={deleteList}
                onShare={handleShareList}
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
          itemType="list"
          itemId={currentShareItem.id}
          itemTitle={currentShareItem.title}
          onShare={handleListShare}
          onUnshare={handleListUnshare}
          existingShareData={currentShareItem.shareData}
        />
      )}
    </div>
  );
};

export default Index;
