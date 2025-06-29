import { useState, useRef, useCallback } from 'react';
import { Whiteboard, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import React from 'react';

interface UseWhiteboardCardLogicProps {
  whiteboard: Whiteboard;
  onUpdate: (whiteboardId: number, updatedData: Partial<Omit<Whiteboard, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  onDelete: (whiteboardId: number) => Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
}

export const useWhiteboardCardLogic = ({ whiteboard, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory, addCategory }: UseWhiteboardCardLogicProps) => {
  const { toast } = useToast();
  
  // Collapsible state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);
  
  const isCollapsibleOpen = isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;
  
  // Title editing state - uses whiteboard.title directly
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(whiteboard.title || 'Untitled Whiteboard');
  
  // Color state
  const [isSavingColor, setIsSavingColor] = useState(false);
  
  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  
  // Refs
  const titleEditRef = useRef<HTMLInputElement>(null);
  
  // Update title state when whiteboard title changes
  React.useEffect(() => {
    setEditTitle(whiteboard.title || 'Untitled Whiteboard');
  }, [whiteboard.title]);
  
  // Title editing handlers - updates whiteboard.title
  const handleEditTitle = useCallback(async () => {
    if (editTitle.trim() !== whiteboard.title) {
      await onUpdate(whiteboard.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  }, [editTitle, whiteboard.title, whiteboard.id, onUpdate]);
  
  // Whiteboard operations
  const handleDeleteWhiteboard = useCallback(async () => {
    await onDelete(whiteboard.id);
  }, [whiteboard.id, onDelete]);
  
  // Color operations
  const handleSaveWhiteboardColor = useCallback(async (newColor: string) => {
    setIsSavingColor(true);
    try {
      await onUpdate(whiteboard.id, { color_value: newColor });
    } catch (error) {
      console.error('Failed to save whiteboard color:', error);
      toast({
        title: "Error updating color",
        description: "Could not update whiteboard color. Please try again.",
        variant: "destructive"
      });
      throw error; // Re-throw to let the component handle UI reversion
    } finally {
      setIsSavingColor(false);
    }
  }, [whiteboard.id, onUpdate, toast]);
  
  // Category operations
  const handleEditCategory = useCallback(async (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }
    try {
      await onUpdate(whiteboard.id, { category: category });
      setIsEditingCategory(false);
      setShowNewCategoryInput(false);
    } catch (error) {
      console.error('Failed to update whiteboard category:', error);
      toast({
        title: "Error updating category",
        description: "Could not update whiteboard category. Please try again.",
        variant: "destructive"
      });
    }
  }, [whiteboard.id, onUpdate, toast]);
  
  const handleAddCustomCategory = useCallback(async () => {
    if (newCategory.trim() !== '') {
      try {
        await onUpdate(whiteboard.id, { category: newCategory.trim() });
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
        setNewCategory('');
      } catch (error) {
        console.error('Failed to add custom category:', error);
        toast({
          title: "Error adding category",
          description: "Could not add custom category. Please try again.",
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
  }, [newCategory, whiteboard.id, onUpdate, toast]);
  
  // Canvas operations
  const handleCanvasChange = useCallback((canvasData: any) => {
    // This can be used for real-time feedback if needed
    console.log('Canvas changed:', canvasData);
  }, []);
  
  const handleCanvasSave = useCallback(async (data: { canvas_data: any; updated_at: string }) => {
    try {
      console.log('🎨 WhiteboardCardLogic: Saving canvas data:', {
        whiteboardId: whiteboard.id,
        pathCount: data.canvas_data?.length || 0,
        dataType: typeof data.canvas_data,
        isArray: Array.isArray(data.canvas_data),
        dataPreview: JSON.stringify(data.canvas_data).substring(0, 200)
      });
      
      await onUpdate(whiteboard.id, { canvas_data: JSON.stringify(data.canvas_data), updated_at: data.updated_at });
      
      console.log('🎨 WhiteboardCardLogic: Canvas save completed successfully');
    } catch (error) {
      console.error('Failed to save canvas data:', error);
      toast({
        title: "Error saving whiteboard",
        description: "Could not save your drawing. Please try again.",
        variant: "destructive"
      });
    }
  }, [whiteboard.id, onUpdate, toast]);
  
  return {
    // Title for display
    whiteboardTitle: whiteboard.title || 'Untitled Whiteboard',
    
    // Collapsible
    isCollapsibleOpen,
    setIsCollapsibleOpen,
    
    // Title editing
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    
    // Whiteboard operations
    handleDeleteWhiteboard,
    
    // Color
    handleSaveWhiteboardColor,
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
    
    // Canvas operations
    handleCanvasChange,
    handleCanvasSave,
    
    // Refs
    titleEditRef,
  };
}; 