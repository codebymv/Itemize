import { useMemo } from 'react';
import { CategoryService, type CategoryInfo, type CategoryStats } from '../services/categoryService';
import { List, Note } from '../types';

/**
 * Unified Categories Hook
 * Provides centralized category management for both lists and notes
 */
export const useUnifiedCategories = (lists: List[], notes: Note[]) => {
  // Memoize category calculations to avoid recalculating on every render
  const categoryStats = useMemo(() => {
    return CategoryService.getAllCategories(lists, notes);
  }, [lists, notes]);

  const categoryNames = useMemo(() => {
    return CategoryService.getCategoryNames(lists, notes);
  }, [lists, notes]);

  // Function to filter both lists and notes by category
  const filterByCategory = useMemo(() => {
    return (categoryFilter: string | null) => {
      return CategoryService.filterByCategory(lists, notes, categoryFilter);
    };
  }, [lists, notes]);

  // Function to get category suggestions for autocomplete
  const getCategorySuggestions = useMemo(() => {
    return (currentInput: string) => {
      return CategoryService.getCategorySuggestions(lists, notes, currentInput);
    };
  }, [lists, notes]);

  // Function to check if category is already in use
  const isCategoryInUse = useMemo(() => {
    return (categoryName: string) => {
      return CategoryService.isCategoryInUse(lists, notes, categoryName);
    };
  }, [lists, notes]);

  // Get display text for category (e.g., "3 lists, 2 notes")
  const getCategoryDisplayText = (categoryInfo: CategoryInfo): string => {
    return CategoryService.getCategoryDisplayText(categoryInfo);
  };

  return {
    // Category data
    categories: categoryStats.categories,
    categoryNames,
    totalCategories: categoryStats.totalCategories,
    
    // Helper functions
    filterByCategory,
    getCategorySuggestions,
    isCategoryInUse,
    getCategoryDisplayText,
    
    // Raw stats for custom use
    categoryStats
  };
};

export type UnifiedCategoriesHook = ReturnType<typeof useUnifiedCategories>; 