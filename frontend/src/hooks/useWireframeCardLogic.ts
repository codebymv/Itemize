import { useState, useRef, useCallback } from 'react';
import { Wireframe, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import React from 'react';

interface UseWireframeCardLogicProps {
  wireframe: Wireframe;
  onUpdate: (wireframeId: number, updatedData: Partial<Omit<Wireframe, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<Wireframe | null>;
  onDelete: (wireframeId: number) => Promise<boolean>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory?: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
}

export const useWireframeCardLogic = ({ wireframe, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory, addCategory }: UseWireframeCardLogicProps) => {
  const { toast } = useToast();
  
  // Collapsible state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);
  
  const isCollapsibleOpen = isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;
  
  // Title editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(wireframe.title || 'Untitled Wireframe');
  
  // Color state
  const [isSavingColor, setIsSavingColor] = useState(false);
  
  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  
  // Refs
  const titleEditRef = useRef<HTMLInputElement>(null);
  
  // Update title state when wireframe title changes
  React.useEffect(() => {
    setEditTitle(wireframe.title || 'Untitled Wireframe');
  }, [wireframe.title]);
  
  // Title editing handlers
  const handleEditTitle = useCallback(async () => {
    if (editTitle.trim() !== wireframe.title) {
      await onUpdate(wireframe.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  }, [editTitle, wireframe.title, wireframe.id, onUpdate]);
  
  // Wireframe operations
  const handleDeleteWireframe = useCallback(async () => {
    await onDelete(wireframe.id);
  }, [wireframe.id, onDelete]);
  
  // Color operations
  const handleSaveWireframeColor = useCallback(async (newColor: string) => {
    setIsSavingColor(true);
    try {
      await onUpdate(wireframe.id, { color_value: newColor });
    } catch (error) {
      console.error('Failed to save wireframe color:', error);
      toast({
        title: "Error updating color",
        description: "Could not update wireframe color. Please try again.",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsSavingColor(false);
    }
  }, [wireframe.id, onUpdate, toast]);
  
  // Category operations
  const handleEditCategory = useCallback(async (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }
    try {
      await onUpdate(wireframe.id, { category: category });
      setIsEditingCategory(false);
      setShowNewCategoryInput(false);
    } catch (error) {
      console.error('Failed to update wireframe category:', error);
      toast({
        title: "Error updating category",
        description: "Could not update wireframe category. Please try again.",
        variant: "destructive"
      });
    }
  }, [wireframe.id, onUpdate, toast]);
  
  const handleAddCustomCategory = useCallback(async () => {
    if (newCategory.trim() !== '') {
      try {
        await onUpdate(wireframe.id, { category: newCategory.trim() });
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
  }, [newCategory, wireframe.id, onUpdate, toast]);

  const handleUpdateCategoryColor = async (categoryName: string, newColor: string) => {
    if (!updateCategory) return;
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
  
  // Flow data operations
  const handleFlowDataChange = useCallback((flowData: any) => {
    console.log('Flow data changed:', flowData);
  }, []);
  
  const handleFlowDataSave = useCallback(async (flowData: { nodes: any[]; edges: any[]; viewport: { x: number; y: number; zoom: number } }) => {
    try {
      console.log('🔷 WireframeCardLogic: Saving flow data:', {
        wireframeId: wireframe.id,
        nodeCount: flowData.nodes?.length || 0,
        edgeCount: flowData.edges?.length || 0
      });

      await onUpdate(wireframe.id, { flow_data: flowData });

      console.log('🔷 WireframeCardLogic: Flow data save completed successfully');
    } catch (error) {
      console.error('Failed to save flow data:', error);
      toast({
        title: "Error saving wireframe",
        description: "Could not save your diagram. Please try again.",
        variant: "destructive"
      });
    }
  }, [wireframe.id, onUpdate, toast]);
  
  return {
    // Title for display
    wireframeTitle: wireframe.title || 'Untitled Wireframe',
    
    // Collapsible
    isCollapsibleOpen,
    setIsCollapsibleOpen,
    
    // Title editing
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    
    // Wireframe operations
    handleDeleteWireframe,
    
    // Color
    handleSaveWireframeColor,
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
    
    // Flow data operations
    handleFlowDataChange,
    handleFlowDataSave,
    
    // Refs
    titleEditRef,
  };
};
