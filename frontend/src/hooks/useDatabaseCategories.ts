import { useState, useEffect, useCallback } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory, Category, CreateCategoryPayload } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './use-toast';

// Global category refresh event
const CATEGORY_REFRESH_EVENT = 'categoriesUpdated';

const triggerGlobalCategoryRefresh = () => {
  window.dispatchEvent(new CustomEvent(CATEGORY_REFRESH_EVENT));
};

/**
 * Database-backed Categories Hook
 * Replaces useUnifiedCategories with proper database persistence
 */
export const useDatabaseCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();
  const { toast } = useToast();

  // Fetch categories from database
  const fetchCategories = useCallback(async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      const fetchedCategories = await getCategories(token);
      setCategories(fetchedCategories);
      setError(null);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories');
      // Keep existing categories if fetch fails
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Listen for global category refresh events with throttling
  useEffect(() => {
    let refreshTimeout: NodeJS.Timeout | null = null;
    
    const handleGlobalRefresh = () => {
      // Throttle category refreshes to prevent spam
      if (refreshTimeout) return;
      
      console.log('🔄 Global category refresh triggered - refreshing categories list');
      refreshTimeout = setTimeout(() => {
        fetchCategories();
        refreshTimeout = null;
      }, 1000); // 1 second throttle
    };

    window.addEventListener(CATEGORY_REFRESH_EVENT, handleGlobalRefresh);
    
    return () => {
      window.removeEventListener(CATEGORY_REFRESH_EVENT, handleGlobalRefresh);
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, [fetchCategories]);

  // Create new category
  const addCategory = useCallback(async (categoryData: CreateCategoryPayload) => {
    if (!token) return null;
    
    try {
      const newCategory = await createCategory(categoryData, token);
      setCategories(prev => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
      
      // Trigger global refresh so all components update
      console.log('📢 Triggering global category refresh after creating:', newCategory.name);
      triggerGlobalCategoryRefresh();
      
      return newCategory;
    } catch (err) {
      console.error('Error creating category:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create category';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      
      return null;
    }
  }, [token, toast]);

  // Update existing category
  const editCategory = useCallback(async (categoryId: number, categoryData: CreateCategoryPayload) => {
    if (!token) return null;
    
    try {
      const updatedCategory = await updateCategory(categoryId, categoryData, token);
      setCategories(prev => 
        prev.map(cat => cat.id === categoryId ? updatedCategory : cat)
           .sort((a, b) => a.name.localeCompare(b.name))
      );
      
      // Trigger global refresh so all components update (only for category changes)
      console.log('📢 Triggering global category refresh after updating:', updatedCategory.name);
      triggerGlobalCategoryRefresh();
      
      return updatedCategory;
    } catch (err) {
      console.error('Error updating category:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update category';
      
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "destructive"
      });
      
      return null;
    }
  }, [token, toast]);

  // Delete category
  const removeCategory = useCallback(async (categoryId: number) => {
    if (!token) return false;
    
    try {
      const categoryToDelete = categories.find(cat => cat.id === categoryId);
      await deleteCategory(categoryId, token);
      setCategories(prev => prev.filter(cat => cat.id !== categoryId));
      
      // Trigger global refresh so all components update (only for category changes)
      console.log('📢 Triggering global category refresh after deleting:', categoryToDelete?.name);
      triggerGlobalCategoryRefresh();
      
      return true;
    } catch (err) {
      console.error('Error deleting category:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete category';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      
      return false;
    }
  }, [token, toast, categories]);

  // Helper functions for compatibility with existing code
  const categoryNames = categories.map(cat => cat.name);
  
  const getCategoryById = useCallback((id: number) => {
    return categories.find(cat => cat.id === id);
  }, [categories]);
  
  const getCategoryByName = useCallback((name: string) => {
    return categories.find(cat => cat.name === name);
  }, [categories]);
  
  // Check if category exists
  const isCategoryInUse = useCallback((categoryName: string) => {
    return categories.some(cat => cat.name === categoryName);
  }, [categories]);

  return {
    // Core data
    categories,
    categoryNames,
    loading,
    error,
    
    // Actions
    addCategory,
    editCategory,
    removeCategory,
    refreshCategories: fetchCategories,
    
    // Helpers
    getCategoryById,
    getCategoryByName,
    isCategoryInUse,
    
    // Computed values
    totalCategories: categories.length
  };
}; 