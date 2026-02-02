import { useState, useCallback } from 'react';
import { Whiteboard, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useCardTitleEditing } from '@/hooks/useCardTitleEditing';
import { useCardColorManagement } from '@/hooks/useCardColorManagement';
import { useCardCategoryManagement } from '@/hooks/useCardCategoryManagement';
import logger from '@/lib/logger';

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
  
  const {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef
  } = useCardTitleEditing({
    title: whiteboard.title || 'Untitled Whiteboard',
    compareTitle: whiteboard.title,
    onSave: (nextTitle) => onUpdate(whiteboard.id, { title: nextTitle })
  });
  
  // Whiteboard operations
  const handleDeleteWhiteboard = useCallback(async () => {
    await onDelete(whiteboard.id);
  }, [whiteboard.id, onDelete]);
  
  const { isSavingColor, saveColor: handleSaveWhiteboardColor } = useCardColorManagement({
    onSave: (newColor) => onUpdate(whiteboard.id, { color_value: newColor }),
    onError: () => {
      toast({
        title: "Error",
        description: "Could not update whiteboard color. Please try again.",
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
    onUpdateCategory: (category) => onUpdate(whiteboard.id, { category }),
    onAddCustomCategory: (category) => onUpdate(whiteboard.id, { category }),
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
      logger.error('Failed to update whiteboard category:', error);
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
        description: action === 'add'
          ? "Could not add custom category. Please try again."
          : "Failed to update category",
        variant: "destructive"
      });
    }
  });
  
  // Canvas operations
  const handleCanvasChange = useCallback((canvasData: any) => {
    // This can be used for real-time feedback if needed
    logger.debug('whiteboard', 'Canvas changed:', canvasData);
  }, []);
  
  const handleCanvasSave = useCallback(async (data: { canvas_data: any; updated_at: string }) => {
    try {
      logger.debug('whiteboard', 'Saving canvas data:', {
        whiteboardId: whiteboard.id,
        pathCount: data.canvas_data?.length || 0,
        dataType: typeof data.canvas_data,
        isArray: Array.isArray(data.canvas_data)
      });

      // Sanitize canvas data to prevent JSON serialization issues
      let sanitizedCanvasData = data.canvas_data;
      
      if (Array.isArray(data.canvas_data)) {
        try {
          // Deep clone and sanitize the canvas data to remove any circular references
          // or problematic nested objects that might cause JSON serialization issues
          sanitizedCanvasData = data.canvas_data.map(path => {
            if (typeof path === 'object' && path !== null) {
              // Create a clean object with only the essential properties
              const cleanPath = {
                drawMode: path.drawMode || true,
                strokeColor: typeof path.strokeColor === 'string' ? path.strokeColor : '#2563eb',
                strokeWidth: typeof path.strokeWidth === 'number' ? path.strokeWidth : 2,
                paths: Array.isArray(path.paths) ? path.paths : (Array.isArray(path.path) ? path.path : [])
              };
              
              // Ensure paths array contains only valid coordinate objects
              if (Array.isArray(cleanPath.paths)) {
                cleanPath.paths = cleanPath.paths.filter(point => 
                  point && typeof point === 'object' && 
                  typeof point.x === 'number' && 
                  typeof point.y === 'number'
                );
              }
              
              return cleanPath;
            }
            return path;
          });
          
          // Test JSON serialization to catch any remaining issues
          const testSerialization = JSON.stringify(sanitizedCanvasData);
          JSON.parse(testSerialization);
          
          logger.debug('whiteboard', 'Canvas data sanitized successfully:', {
            originalPaths: data.canvas_data?.length || 0,
            sanitizedPaths: sanitizedCanvasData?.length || 0,
            dataPreview: testSerialization.substring(0, 200)
          });
          
        } catch (sanitizationError) {
          logger.error('Canvas data sanitization failed:', sanitizationError);
          // Fallback to empty array if sanitization fails
          sanitizedCanvasData = [];
        }
      } else {
        // If not an array, default to empty array
        sanitizedCanvasData = [];
      }

      // Send the sanitized canvas data
      await onUpdate(whiteboard.id, { canvas_data: sanitizedCanvasData });
      
      logger.debug('whiteboard', 'Canvas save completed successfully');
    } catch (error) {
      logger.error('Failed to save canvas data:', error);
      toast({
        title: "Error",
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
    handleUpdateCategoryColor,
    
    // Canvas operations
    handleCanvasChange,
    handleCanvasSave,
    
    // Refs
    titleEditRef,
  };
};