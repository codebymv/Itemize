import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useAISuggest } from "@/context/AISuggestContext";
import { useAISuggestions } from "@/hooks/use-ai-suggestions";
import { List, ListItem, Category } from '@/types';

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

  // Get items as simple text strings for AI suggestions
  const itemTexts = list.items.map(item => item.text);

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
  } = useAISuggestions({
    enabled: aiEnabled,
    listTitle: list.title,
    existingItems: itemTexts
  });
  
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
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(list.title);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
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
  const [isSavingColor, setIsSavingColor] = useState(false);
  
  // Refs for click outside detection
  const titleEditRef = useRef<HTMLInputElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  
  // Keep title edit state in sync with list title
  useEffect(() => {
    setEditTitle(list.title);
  }, [list.title]);

  // Handle updating the list title
  const handleEditTitle = () => {
    if (editTitle.trim() !== '') {
      onUpdate({ ...list, title: editTitle.trim() });
      setIsEditing(false);
    } else {
      toast({
        title: "Title cannot be empty",
        description: "Please enter a valid list title",
        variant: "destructive"
      });
    }
  };
  
  // Handle deleting the list
  const handleDeleteList = () => {
    onDelete(list.id);
  };
  
  // Handle updating the list category/type
  const handleEditCategory = async (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }
    
    // If it's a new category name that doesn't exist yet, create it in the database
    if (category.trim() && !existingCategories.find(c => c.name === category) && addCategory) {
      try {
        await addCategory({ 
          name: category.trim(), 
          color_value: '#3B82F6' // Default blue color
        });
        // addCategory already triggers global refresh, so other components will update
      } catch (error) {
        console.error('Failed to create category in database:', error);
        // Continue anyway to update the list locally
      }
    }
    
    onUpdate({ ...list, type: category });
    setIsEditingCategory(false);
    setShowNewCategoryInput(false);
  };
  
  // Handle creating a new custom category
  const handleAddCustomCategory = async () => {
    if (newCategory.trim() !== '') {
      try {
        // First create the category in the database (only if addCategory is provided)
        if (addCategory) {
          await addCategory({ 
            name: newCategory.trim(), 
            color_value: '#3B82F6' // Default blue color
          });
        }
        
        // Then update the list to use this category
        onUpdate({ ...list, type: newCategory.trim() });
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
        setNewCategory('');
        
      } catch (error) {
        console.error('Failed to create category:', error);
        toast({
          title: "Error creating category",
          description: "Could not create the category. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
      });
    }
  };

  const handleUpdateCategoryColor = async (categoryName: string, newColor: string) => {
    try {
      await updateCategory(categoryName, { color_value: newColor });
    } catch (error) {
      console.error('Failed to update category color:', error);
      toast({
        title: 'Error',
        description: 'Could not update category color.',
        variant: 'destructive'
      });
    }
  };
  
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
  const toggleItemCompleted = (itemId: string) => {
    const updatedItems = list.items.map(item => {
      if (item.id === itemId) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });
    onUpdate({ ...list, items: updatedItems });
  };
  
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
  const handleSaveListColor = async (newColor: string) => {
    setIsSavingColor(true);
    try {
      // --- BEGIN Placeholder for backend API call ---
      // In a real app, you would call your API service here:
      // await api.updateListColor(list.id, newColor);
      // For now, simulate a delay and potential error:
      await new Promise(resolve => setTimeout(resolve, 1000));
      // if (Math.random() < 0.3) { // Simulate a 30% chance of error
      //   throw new Error("Simulated API error saving color");
      // }
      // --- END Placeholder for backend API call ---

      // Optimistically update the list in the parent component's state
      onUpdate({ ...list, color_value: newColor });
    } catch (error) {
      console.error("Failed to save list color:", error);
      // Re-throw the error so ListCardHeader can revert the preview if needed
      throw error; 
    } finally {
      setIsSavingColor(false);
    }
  };
  
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
