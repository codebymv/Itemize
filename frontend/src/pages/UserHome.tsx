import React, { useState, useEffect } from 'react';
import { Plus, Search, CheckSquare } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CreateItemModal } from "@/components/CreateItemModal";
import { ListCard } from "@/components/ListCard";
import { HeaderAction, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useDatabaseCategories } from '@/hooks/useDatabaseCategories';
import type { CreateItemPresetPayload } from '@/config/contentPresets';
import type { PreparedVaultSecurity } from '@/lib/vaultZkSession';

import { useAuthState } from "@/contexts/AuthContext";
import {
  createList as createListRequest,
  deleteList as deleteListRequest,
  getLists,
  updateList as updateListRequest,
} from '@/services/api';

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

interface BackendList {
  id: string | number;
  title: string;
  category?: string;
  items?: ListItem[];
  createdAt?: string;
  created_at?: string;
  color_value?: string | null;
}

const UserHome = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAuthenticated } = useAuthState();
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
      setLoadError(null);
      const response = await getLists();
      const rows = Array.isArray(response) ? response : response.lists;
      
      // Map response data to our List type, ensuring correct category mapping and defaults
      const listsWithDataMapped = (rows as BackendList[]).map((listFromBackend) => ({
        id: String(listFromBackend.id),
        title: listFromBackend.title,
        type: listFromBackend.category || 'General', // Map backend 'category' to frontend 'type'
        items: listFromBackend.items || [], // Ensure items is an array
        createdAt: new Date(listFromBackend.created_at || listFromBackend.createdAt || 0),
        color_value: listFromBackend.color_value || '#808080' // Use color_value, default to grey
      }));
      
      setLists(listsWithDataMapped);
    } catch (error) {
      console.error('Failed to fetch lists:', error);
      setLoadError("We couldn't load your lists. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const createList = async (
    title: string,
    type: string,
    items: ListItem[] = [],
  ) => {
    try {
      const response = await createListRequest({
        title,
        type,
        items
      });
      
      const newList: List = {
        ...response,
        id: String(response.id),
        type: response.type || 'General',
        items: response.items || [],
        createdAt: response.createdAt || new Date(),
        color_value: response.color_value || '#808080'
      };
      
      setLists(prev => prev.some((list) => list.id === newList.id)
        ? prev
        : [newList, ...prev]);
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
    _color: string,
    _position?: { x: number; y: number },
    _vaultSecurity?: PreparedVaultSecurity,
    presetPayload?: CreateItemPresetPayload,
  ) => {
    try {
      await createList(title, category, presetPayload?.listItems);
      return true;
    } catch {
      return false;
    }
  };
 
  const deleteList = async (listId: string): Promise<boolean> => {
    try {
      await deleteListRequest(listId);
      
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
      
      await updateListRequest({ id: updatedList.id, ...listData });
      
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
    <PageLayout
      title="LISTS"
      icon={<CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
      headerTools={{
        search: <HeaderSearch value={searchQuery} onChange={setSearchQuery} label="Search lists" placeholder="Search lists..." />,
        primaryAction: <HeaderAction label="New list" icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)} />,
      }}
    >
        <div className="flex flex-wrap gap-2 mb-6">
          {getUniqueTypes().map((filter) => {
            const count = getFilterCounts()[filter] || 0;
            return (
              <Button
                key={filter}
                variant={selectedFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFilter(filter)}
                className={`capitalize ${selectedFilter === filter ? 'bg-blue-600 interaction-button--primary' : ''}`}
              >
                {filter} ({count})
              </Button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : loadError ? (
          <ErrorState
            kind="section"
            title="Unable to load lists"
            description={loadError}
            onAction={() => void fetchLists()}
          />
        ) : filteredLists.length === 0 ? (
          lists.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No lists yet"
              description="Organize tasks, notes, and more with lists."
              actionLabel="Create list"
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <EmptyState
              icon={Search}
              kind="results"
              title="No matching lists"
              actionLabel="Clear filters"
              onAction={() => { setSearchQuery(''); setSelectedFilter('all'); }}
            />
          )
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

      <CreateItemModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        itemType="list"
        onCreate={handleCreateList}
        existingCategories={categories}
        position={{ x: 0, y: 0 }}
      />
    </PageLayout>
  );
};

export default UserHome;
