import { useState, useMemo } from 'react';
import { List, Note, Whiteboard, Wireframe, Vault } from '@/types';

export function useCanvasFilters(
  lists: List[],
  notes: Note[],
  whiteboards: Whiteboard[],
  wireframes: Wireframe[],
  vaults: Vault[]
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

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
    const safeLists = Array.isArray(lists) ? lists : [];
    const safeNotes = Array.isArray(notes) ? notes : [];
    const safeWhiteboards = Array.isArray(whiteboards) ? whiteboards : [];
    const safeWireframes = Array.isArray(wireframes) ? wireframes : [];

    if (!categoryFilter || categoryFilter === 'all') {
      return { filteredLists: safeLists, filteredNotes: safeNotes, filteredWhiteboards: safeWhiteboards, filteredWireframes: safeWireframes, filteredVaults: vaults };
    }

    const filteredLists = safeLists.filter(list => (list.type || 'General') === categoryFilter);
    const filteredNotes = safeNotes.filter(note => (note.category || 'General') === categoryFilter);
    const filteredWhiteboards = safeWhiteboards.filter(whiteboard => (whiteboard.category || 'General') === categoryFilter);
    const filteredWireframes = safeWireframes.filter(wireframe => (wireframe.category || 'General') === categoryFilter);
    const filteredVaults = vaults.filter(v => (v.category || 'General') === categoryFilter);

    return { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes, filteredVaults };
  };

  // Filter data based on type and category filters
  const filteredData = useMemo(() => {
    if (typeFilter === 'all') {
      return filterByCategory(selectedFilter);
    }

    return {
      filteredLists: typeFilter === 'list' ? lists : [],
      filteredNotes: typeFilter === 'note' ? notes : [],
      filteredWhiteboards: typeFilter === 'whiteboard' ? whiteboards : [],
      filteredWireframes: typeFilter === 'wireframe' ? wireframes : [],
      filteredVaults: typeFilter === 'vault' ? vaults : [],
    };
  }, [typeFilter, selectedFilter, lists, notes, whiteboards, wireframes, vaults]);

  // Apply search filter
  const getFilteredContent = () => {
    const { filteredLists, filteredNotes, filteredWhiteboards, filteredWireframes, filteredVaults } = filteredData;

    let searchFilteredLists = [...filteredLists];
    if (searchQuery) {
      searchFilteredLists = searchFilteredLists.filter(list => {
        return list.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (list.items && list.items.some(item =>
            item.text?.toLowerCase().includes(searchQuery.toLowerCase())
          ));
      });
    }

    let searchFilteredNotes = [...filteredNotes];
    if (searchQuery) {
      searchFilteredNotes = searchFilteredNotes.filter(note => {
        return note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          note.content?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    let searchFilteredWhiteboards = [...filteredWhiteboards];
    if (searchQuery) {
      searchFilteredWhiteboards = searchFilteredWhiteboards.filter(whiteboard => {
        return whiteboard.title?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    let searchFilteredWireframes = [...filteredWireframes];
    if (searchQuery) {
      searchFilteredWireframes = searchFilteredWireframes.filter(wireframe => {
        return wireframe.title?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    let searchFilteredVaults = [...filteredVaults];
    if (searchQuery) {
      searchFilteredVaults = searchFilteredVaults.filter(vault => {
        return vault.title?.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    return {
      filteredLists: searchFilteredLists,
      filteredNotes: searchFilteredNotes,
      filteredWhiteboards: searchFilteredWhiteboards,
      filteredWireframes: searchFilteredWireframes,
      filteredVaults: searchFilteredVaults
    };
  };

  const filteredContent = getFilteredContent();

  // Get count for filter tabs
  const getFilterCounts = () => {
    const counts: Record<string, number> = {};

    lists.forEach(list => {
      const category = list.type || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    notes.forEach(note => {
      const category = note.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
  };

  return {
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
    filteredData: filteredContent,
    getFilterCounts,
  };
}