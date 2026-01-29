import { useState, useCallback } from 'react';
import { Wireframe, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useCardTitleEditing } from '@/hooks/useCardTitleEditing';
import { useCardColorManagement } from '@/hooks/useCardColorManagement';
import { useCardCategoryManagement } from '@/hooks/useCardCategoryManagement';

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
  
  const {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef
  } = useCardTitleEditing({
    title: wireframe.title || 'Untitled Wireframe',
    compareTitle: wireframe.title,
    onSave: (nextTitle) => onUpdate(wireframe.id, { title: nextTitle })
  });
  
  // Wireframe operations
  const handleDeleteWireframe = useCallback(async () => {
    await onDelete(wireframe.id);
  }, [wireframe.id, onDelete]);
  
  const { isSavingColor, saveColor: handleSaveWireframeColor } = useCardColorManagement({
    onSave: (newColor) => onUpdate(wireframe.id, { color_value: newColor }),
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update color",
        variant: "destructive"
      });
    }
  });
  
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
    onUpdateCategory: (category) => onUpdate(wireframe.id, { category }),
    onAddCustomCategory: (category) => onUpdate(wireframe.id, { category }),
    onUpdateCategoryColor: (categoryName, newColor) => {
      if (!updateCategory) return;
      return updateCategory(categoryName, { color_value: newColor });
    },
    onEmptyCategory: () => {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
      });
    },
    onError: (error, action) => {
      console.error('Failed to update wireframe category:', error);
      if (action === 'color') {
        toast({
          title: 'Error',
          description: 'Could not update category color.',
          variant: 'destructive'
        });
        return;
      }
      toast({
        title: action === 'add' ? "Failed to add category" : "Failed to update category",
        description: "Could not update wireframe category. Please try again.",
        variant: "destructive"
      });
    }
  });
  
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
        title: "Error",
        description: "Failed to save wireframe",
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
