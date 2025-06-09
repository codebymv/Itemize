import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useAISuggestions } from "@/hooks/use-ai-suggestions";
import { List, ListItem } from '@/types';

interface UseListCardLogicProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
}

export const useListCardLogic = ({ list, onUpdate, onDelete }: UseListCardLogicProps) => {
  // AI setting state from localStorage
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    try {
      // Check if AI suggestions are enabled in localStorage
      const saved = localStorage.getItem('itemize-ai-suggest-enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  // Get items as simple text strings for AI suggestions
  const itemTexts = list.items.map(item => item.text);

  // Setup AI suggestions
  console.log('AI Suggestions setup:', { aiEnabled, listTitle: list.title, itemCount: itemTexts.length });
  
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
  
  // Component state
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(list.title);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newItemText, setNewItemText] = useState<string>('');

  // Debug AI suggestion state
  useEffect(() => {
    console.log('AI Suggestion state:', { 
      aiEnabled, 
      currentSuggestion, 
      suggestions, 
      isLoadingSuggestions,
      newItemText,
      inputSuggestion: getSuggestionForInput(newItemText || '')
    });
  }, [aiEnabled, currentSuggestion, suggestions, isLoadingSuggestions, newItemText, getSuggestionForInput]);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  
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
  const handleEditCategory = (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }
    onUpdate({ ...list, type: category });
    setIsEditingCategory(false);
    setShowNewCategoryInput(false);
  };
  
  // Handle creating a new custom category
  const handleAddCustomCategory = () => {
    if (newCategory.trim() !== '') {
      onUpdate({ ...list, type: newCategory.trim() });
      setIsEditingCategory(false);
      setShowNewCategoryInput(false);
      setNewCategory('');
    } else {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
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
  
  // Debug log for input suggestion
  useEffect(() => {
    console.log('Input suggestion debug:', { 
      newItemText, 
      currentInputSuggestion, 
      aiEnabled,
      getSuggestionForInputExists: !!getSuggestionForInput
    });
  }, [newItemText, currentInputSuggestion, aiEnabled, getSuggestionForInput]);
  
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
      localStorage.setItem('itemize-ai-suggest-enabled', 'true');
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
    
    // Category editing
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    handleEditCategory,
    handleAddCustomCategory,
    
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
