import { useMemo } from 'react';
import { List, Note, Whiteboard, Category } from '@/types';

interface UseCanvasFilteringProps {
  lists: List[];
  notes: Note[];
  whiteboards: Whiteboard[];
  selectedFilter: string | null;
  searchQuery: string;
}

interface FilterCounts {
  [category: string]: number;
}

interface FilteredContent {
  filteredLists: List[];
  filteredNotes: Note[];
  filteredWhiteboards: Whiteboard[];
}

/**
 * Hook for filtering canvas content by category and search query
 */
export function useCanvasFiltering({
  lists,
  notes,
  whiteboards,
  selectedFilter,
  searchQuery,
}: UseCanvasFilteringProps) {
  /**
   * Filter content by category
   */
  const filterByCategory = useMemo(() => {
    if (!selectedFilter) {
      return {
        filteredLists: lists,
        filteredNotes: notes,
        filteredWhiteboards: whiteboards,
      };
    }

    return {
      filteredLists: lists.filter((list) => list.type === selectedFilter),
      filteredNotes: notes.filter((note) => note.category === selectedFilter),
      filteredWhiteboards: whiteboards.filter(
        (whiteboard) => whiteboard.category === selectedFilter
      ),
    };
  }, [lists, notes, whiteboards, selectedFilter]);

  /**
   * Apply search filter to content
   */
  const filteredContent = useMemo((): FilteredContent => {
    const { filteredLists, filteredNotes, filteredWhiteboards } = filterByCategory;

    if (!searchQuery) {
      return { filteredLists, filteredNotes, filteredWhiteboards };
    }

    const query = searchQuery.toLowerCase();

    // Filter lists by title and items
    const searchFilteredLists = filteredLists.filter((list) => {
      return (
        list.title.toLowerCase().includes(query) ||
        (list.items &&
          list.items.some((item) =>
            item.text?.toLowerCase().includes(query)
          ))
      );
    });

    // Filter notes by title and content
    const searchFilteredNotes = filteredNotes.filter((note) => {
      return (
        note.title?.toLowerCase().includes(query) ||
        note.content?.toLowerCase().includes(query)
      );
    });

    // Filter whiteboards by title
    const searchFilteredWhiteboards = filteredWhiteboards.filter((whiteboard) => {
      return whiteboard.title?.toLowerCase().includes(query);
    });

    return {
      filteredLists: searchFilteredLists,
      filteredNotes: searchFilteredNotes,
      filteredWhiteboards: searchFilteredWhiteboards,
    };
  }, [filterByCategory, searchQuery]);

  /**
   * Get count of items per category
   */
  const filterCounts = useMemo((): FilterCounts => {
    const counts: FilterCounts = {};

    // Count lists per category
    lists.forEach((list) => {
      const category = list.type || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    // Count notes per category
    notes.forEach((note) => {
      const category = note.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    // Count whiteboards per category
    whiteboards.forEach((whiteboard) => {
      const category = whiteboard.category || 'General';
      counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
  }, [lists, notes, whiteboards]);

  /**
   * Get total count of all items
   */
  const totalCount = useMemo(() => {
    return lists.length + notes.length + whiteboards.length;
  }, [lists, notes, whiteboards]);

  /**
   * Check if there's any content
   */
  const hasContent = useMemo(() => {
    return totalCount > 0;
  }, [totalCount]);

  /**
   * Check if there's any filtered content
   */
  const hasFilteredContent = useMemo(() => {
    const { filteredLists, filteredNotes, filteredWhiteboards } = filteredContent;
    return filteredLists.length > 0 || filteredNotes.length > 0 || filteredWhiteboards.length > 0;
  }, [filteredContent]);

  return {
    filteredLists: filteredContent.filteredLists,
    filteredNotes: filteredContent.filteredNotes,
    filteredWhiteboards: filteredContent.filteredWhiteboards,
    filterCounts,
    totalCount,
    hasContent,
    hasFilteredContent,
  };
}

export default useCanvasFiltering;
