import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useAISuggest } from "@/context/AISuggestContext";
import { useAISuggestions } from "@/hooks/use-ai-suggestions";
import { List, ListItem, Category } from '@/types';
import { useCardTitleEditing } from '@/hooks/useCardTitleEditing';
import { useCardColorManagement } from '@/hooks/useCardColorManagement';
import { useCardCategoryManagement } from '@/hooks/useCardCategoryManagement';
import logger from '@/lib/logger';

interface UseListCardLogicProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  existingCategories?: Category[];
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
  updateCategory: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
}

export const useListCardLogic = ({ list, onUpdate, onDelete, isCollapsed, onToggleCollapsed, existingCategories = [], addCategory, updateCategory }: UseListCardLogicProps) => {
  // Use the global AI suggestions context
  const { aiEnabled, setAiEnabled } = useAISuggest();

  // Get items as simple text strings for AI suggestions (memoized to prevent unnecessary re-renders)
  const itemTexts = useMemo(() =>
    list.items.map(item => item.text),
    [list.items.map(item => item.text).join('|')]
  );

  // Memoize the AI suggestions options to prevent unnecessary hook re-runs
  const aiSuggestionsOptions = useMemo(() => ({
    enabled: aiEnabled,
    listTitle: list.title,
    existingItems: itemTexts
  }), [aiEnabled, list.title, itemTexts]);

  // Setup AI suggestions (reduce logging)
  // console.log('AI Suggestions setup:', { aiEnabled, listTitle: list.title, itemCount: itemTexts.length });

  const {
    currentSuggestion,
    suggestions,
    isLoading: isLoadingSuggestions,
    debouncedFetchSuggestions,
    fetchSuggestions,
    getNextSuggestion,
    getSuggestionForInput,
    acceptSuggestion,
    generateContextSuggestion
  } = useAISuggestions(aiSuggestionsOptions);

  // Debug AI suggestions results (disabled)
  // console.log('AI Suggestions results:', { currentSuggestion, suggestionsCount: suggestions.length });

  // Generate initial suggestion on mount
  useEffect(() => {
    if (aiEnabled && !currentSuggestion) {
      debouncedFetchSuggestions();
    }
  }, [aiEnabled, currentSuggestion, debouncedFetchSuggestions]);
  

  
  const { toast } = useToast();
  
  // Component state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);
  
  const isCollapsibleOpen = isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;
  const [newItemText, setNewItemText] = useState<string>('');

  // Debug AI suggestion state (reduced logging)
  // useEffect(() => {
  //   console.log('AI Suggestion state:', { 
  //     aiEnabled, 
  //     currentSuggestion, 
  //     suggestions, 
  //     isLoadingSuggestions,
  //     newItemText,
  //     inputSuggestion: getSuggestionForInput(newItemText || '')
  //   });
  // }, [aiEnabled, currentSuggestion, suggestions, isLoadingSuggestions, newItemText, getSuggestionForInput]);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  // Refs for click outside detection
  const newItemInputRef = useRef<HTMLInputElement>(null);
  
  const {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef
  } = useCardTitleEditing({
    title: list.title,
    compareTitle: list.title,
    onSave: (nextTitle) => {
      onUpdate({ ...list, title: nextTitle });
    },
    validateTitle: (nextTitle) => nextTitle.trim() !== '',
    onInvalidTitle: () => {
      toast({
        title: "Title cannot be empty",
        description: "Please enter a valid list title",
        variant: "destructive"
      });
    }
  });
  
  // Handle deleting the list
  const handleDeleteList = () => {
    onDelete(list.id);
  };
  
  // Handle updating the list category/type
  const {
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor
  } = useCardCategoryManagement({
    onUpdateCategory: async (category) => {
      if (category.trim() && !existingCategories.find(c => c.name === category) && addCategory) {
        try {
          await addCategory({
            name: category.trim(),
            color_value: '#3B82F6'
          });
        } catch (error) {
          logger.error('Failed to create category in database:', error);
        }
      }

      let updateData: Partial<List> = { type: category };
      if (category !== 'General') {
        const selectedCategory = existingCategories.find(c => c.name === category);
        if (selectedCategory?.color_value) {
          updateData.color_value = selectedCategory.color_value;
        }
      }

      onUpdate({ ...list, ...updateData });
    },
    onAddCustomCategory: async (category) => {
      const newCategoryColor = '#3B82F6';
      if (addCategory) {
        await addCategory({
          name: category,
          color_value: newCategoryColor
        });
      }

      onUpdate({
        ...list,
        type: category,
        color_value: newCategoryColor
      });
    },
    onUpdateCategoryColor: (categoryName, newColor) =>
      updateCategory(categoryName, { color_value: newColor }),
    onEmptyCategory: () => {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
      });
    },
    onError: (error, action) => {
      logger.error('Failed to update category:', error);
      if (action === 'color') {
        toast({
          title: 'Error',
          description: 'Could not update category color.',
          variant: 'destructive'
        });
        return;
      }
      toast({
        title: "Error",
        description: action === 'add'
          ? "Could not create the category. Please try again."
          : "Could not update the category. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  // Handle adding a new item
  const handleAddItem = () => {
    if (newItemText.trim() !== '') {
      const newItem: ListItem = {
        id: crypto.randomUUID(),
        text: newItemText.trim(),
        completed: false
      };
      onUpdate({
        ...list,
        items: [...list.items, newItem]
      });
      setNewItemText('');
    }
  };
  
  // Handle toggling item completion status
  const toggleItemCompleted = useCallback((itemId: string) => {
    const updatedItems = list.items.map(item => {
      if (item.id === itemId) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });
    onUpdate({ ...list, items: updatedItems });
  }, [list, onUpdate]);
  
  // Handle item removal
  const removeItem = (itemId: string) => {
    const updatedItems = list.items.filter(item => item.id !== itemId);
    onUpdate({ ...list, items: updatedItems });
  };
  
  // Handle starting item edit
  const startEditingItem = (item: ListItem) => {
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };
  
  // Handle saving item edit
  const handleEditItem = () => {
    if (editingItemId && editingItemText.trim() !== '') {
      const updatedItems = list.items.map(item => {
        if (item.id === editingItemId) {
          return { ...item, text: editingItemText.trim() };
        }
        return item;
      });
      onUpdate({ ...list, items: updatedItems });
      setEditingItemId(null);
      setEditingItemText('');
    } else if (editingItemText.trim() === '') {
      toast({
        title: "Item text cannot be empty",
        description: "Please enter valid text for the item",
        variant: "destructive"
      });
    }
  };
  
  // Current suggestion based on input
  const currentInputSuggestion = useMemo(() => {
    // Only compute suggestion if AI is enabled and we have input text
    if (!aiEnabled || !newItemText) return null;
    const suggestion = getSuggestionForInput(newItemText);
    return suggestion;
  }, [aiEnabled, newItemText, getSuggestionForInput]);
  
  // Debug log for input suggestion (reduced logging)
  // useEffect(() => {
  //   console.log('Input suggestion debug:', { 
  //     newItemText, 
  //     currentInputSuggestion, 
  //     aiEnabled,
  //     getSuggestionForInputExists: !!getSuggestionForInput
  //   });
  // }, [newItemText, currentInputSuggestion, aiEnabled, getSuggestionForInput]);
  
  // Handle accepting a suggestion with tab key
  const handleAcceptSuggestion = () => {
    if (currentInputSuggestion) {
      setNewItemText(currentInputSuggestion);
    } else if (currentSuggestion) {
      setNewItemText(currentSuggestion);
    }
  };

  // Handle getting a suggestion
  const handleGetSuggestion = () => {
    console.log('Getting next suggestion');
    if (!aiEnabled) {
      // Just use the context function to update the global state
      setAiEnabled(true); // Auto-enable if disabled
      // Need to fetch suggestions after enabling
      setTimeout(() => debouncedFetchSuggestions(), 100);
    } else if (currentSuggestion) {
      // Add the current suggestion directly to the list
      const newItem: ListItem = {
        id: crypto.randomUUID(),
        text: currentSuggestion,
        completed: false
      };
      
      onUpdate({
        ...list,
        items: [...list.items, newItem]
      });
      
      // Get the next suggestion
      getNextSuggestion();
    } else {
      // If no current suggestion, try to fetch new ones
      debouncedFetchSuggestions();
    }
  };
  
  // Handle accepting an AI suggestion
  const handleAcceptAISuggestion = (suggestion: string) => {
    const newItem: ListItem = {
      id: crypto.randomUUID(),
      text: suggestion.trim(),
      completed: false
    };
    onUpdate({
      ...list,
      items: [...list.items, newItem]
    });
  };

  // Handle saving the list color
  const { isSavingColor, saveColor: handleSaveListColor } = useCardColorManagement({
    onSave: async (newColor) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      onUpdate({ ...list, color_value: newColor });
    },
    onError: (error) => {
      logger.error("Failed to save list color:", error);
    }
  });
  
  return {
    // Collapsible
    isCollapsibleOpen,
    setIsCollapsibleOpen,
    
    // Title editing
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    
    // List operations
    handleDeleteList,

    // Color saving
    handleSaveListColor,
    isSavingColor,
    
    // Category editing
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor,
    
    // Items
    newItemText,
    setNewItemText,
    editingItemId,
    editingItemText,
    setEditingItemText,
    handleAddItem,
    toggleItemCompleted,
    removeItem,
    startEditingItem,
    handleEditItem,
    
    // AI suggestions
    suggestions,
    isLoadingSuggestions,
    aiEnabled,
    setAiEnabled,
    currentSuggestion,
    currentInputSuggestion,
    handleGetSuggestion,
    handleAcceptSuggestion,
    
    // Refs
    titleEditRef,
    newItemInputRef
  };
};
