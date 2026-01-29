import { useState, useRef, useCallback, useEffect } from 'react';
import { Note, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { updateNoteTitle, updateNoteCategory, updateNoteContent } from '@/services/api';
import { useCardTitleEditing } from '@/hooks/useCardTitleEditing';
import { useCardColorManagement } from '@/hooks/useCardColorManagement';
import { useCardCategoryManagement } from '@/hooks/useCardCategoryManagement';

interface UseNoteCardLogicProps {
  note: Note;
  onUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
  addCategory?: (categoryData: { name: string; color_value: string }) => Promise<any>;
}

export const useNoteCardLogic = ({ note, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory, addCategory }: UseNoteCardLogicProps) => {
  const { toast } = useToast();
  const { token } = useAuth();
  
  // Collapsible state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);
  
  const isCollapsibleOpen = isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;
  
  // Content editing state - uses note.content
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editContent, setEditContent] = useState(note.content || '');
  
  // Refs
  const contentEditRef = useRef<HTMLTextAreaElement>(null);
  
  // Update content state when note content changes
  useEffect(() => {
    setEditContent(note.content || '');
  }, [note.content]);
  
  const {
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    titleEditRef
  } = useCardTitleEditing({
    title: note.title || 'Untitled Note',
    compareTitle: note.title,
    onSave: async (nextTitle) => {
      if (nextTitle !== note.title) {
        try {
          await updateNoteTitle(note.id, nextTitle, token);
          console.log('✅ Granular title update successful');
        } catch (error) {
          console.error('❌ Granular title update failed, falling back:', error);
          await onUpdate(note.id, { title: nextTitle });
        }
      }
    }
  });
  
  // Content editing handlers - updates note.content using granular API
  const handleEditContent = useCallback(async () => {
    if (editContent.trim() !== note.content) {
      try {
        await updateNoteContent(note.id, editContent.trim(), token);
        console.log('✅ Granular content update successful');
      } catch (error) {
        console.error('❌ Granular content update failed, falling back:', error);
        // Fallback to full update if granular fails
        await onUpdate(note.id, { content: editContent.trim(), updated_at: new Date().toISOString() });
      }
    }
    setIsEditingContent(false);
  }, [editContent, note.content, note.id, onUpdate, token]);
  
  // Note operations
  const handleDeleteNote = useCallback(async () => {
    await onDelete(note.id);
  }, [note.id, onDelete]);
  
  const { isSavingColor, saveColor: handleSaveNoteColor } = useCardColorManagement({
    onSave: (newColor) => onUpdate(note.id, { color_value: newColor }),
    onError: () => {
      toast({
        title: "Error",
        description: "Could not update note color. Please try again.",
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
    onUpdateCategory: async (category) => {
      try {
        await updateNoteCategory(note.id, category, token);
        console.log('✅ Granular category update successful');
      } catch (error) {
        console.error('❌ Granular category update failed, falling back:', error);
        await onUpdate(note.id, { category });
      }
    },
    onAddCustomCategory: async (category) => {
      try {
        await updateNoteCategory(note.id, category, token);
        console.log('✅ Granular custom category update successful');
      } catch (error) {
        console.error('❌ Granular custom category update failed, falling back:', error);
        await onUpdate(note.id, { category });
      }
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
      console.error('Failed to update note category:', error);
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
          : "Could not update note category. Please try again.",
        variant: "destructive"
      });
    }
  });
  
  return {
    // Title for display
    noteTitle: note.title || 'Untitled Note',
    
    // Collapsible
    isCollapsibleOpen,
    setIsCollapsibleOpen,
    
    // Title editing
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    handleEditTitle,
    
    // Content editing
    isEditingContent,
    setIsEditingContent,
    editContent,
    setEditContent,
    handleEditContent,
    
    // Note operations
    handleDeleteNote,
    
    // Color
    handleSaveNoteColor,
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
    
    // Refs
    titleEditRef,
    contentEditRef,
  };
};