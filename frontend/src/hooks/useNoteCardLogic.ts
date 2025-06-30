import { useState, useRef, useCallback } from 'react';
import { Note, Category } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { updateNoteTitle, updateNoteCategory, updateNoteContent } from '@/services/api';
import React from 'react';

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
  
  // Collapsible state - use external collapsible state if provided, otherwise use internal state
  const [internalCollapsibleOpen, setInternalCollapsibleOpen] = useState(true);
  
  const isCollapsibleOpen = isCollapsed !== undefined ? !isCollapsed : internalCollapsibleOpen;
  const setIsCollapsibleOpen = onToggleCollapsed || setInternalCollapsibleOpen;
  
  // Title editing state - now uses note.title directly
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title || 'Untitled Note');
  
  // Content editing state - uses note.content
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editContent, setEditContent] = useState(note.content || '');
  
  // Color state
  const [isSavingColor, setIsSavingColor] = useState(false);
  
  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  
  // Refs
  const titleEditRef = useRef<HTMLInputElement>(null);
  const contentEditRef = useRef<HTMLTextAreaElement>(null);
  
  // Update title state when note title changes
  React.useEffect(() => {
    setEditTitle(note.title || 'Untitled Note');
  }, [note.title]);
  
  // Update content state when note content changes
  React.useEffect(() => {
    setEditContent(note.content || '');
  }, [note.content]);
  
  // Title editing handlers - updates note.title using granular API
  const handleEditTitle = useCallback(async () => {
    if (editTitle.trim() !== note.title) {
      try {
        await updateNoteTitle(note.id, editTitle.trim());
        console.log('✅ Granular title update successful');
      } catch (error) {
        console.error('❌ Granular title update failed, falling back:', error);
        // Fallback to full update if granular fails
        await onUpdate(note.id, { title: editTitle.trim() });
      }
    }
    setIsEditing(false);
  }, [editTitle, note.title, note.id, onUpdate]);
  
  // Content editing handlers - updates note.content using granular API
  const handleEditContent = useCallback(async () => {
    if (editContent.trim() !== note.content) {
      try {
        await updateNoteContent(note.id, editContent.trim());
        console.log('✅ Granular content update successful');
      } catch (error) {
        console.error('❌ Granular content update failed, falling back:', error);
        // Fallback to full update if granular fails
        await onUpdate(note.id, { content: editContent.trim(), updated_at: new Date().toISOString() });
      }
    }
    setIsEditingContent(false);
  }, [editContent, note.content, note.id, onUpdate]);
  
  // Note operations
  const handleDeleteNote = useCallback(async () => {
    await onDelete(note.id);
  }, [note.id, onDelete]);
  
  // Color operations
  const handleSaveNoteColor = useCallback(async (newColor: string) => {
    setIsSavingColor(true);
    try {
      await onUpdate(note.id, { color_value: newColor });
    } catch (error) {
      console.error('Failed to save note color:', error);
      toast({
        title: "Error updating color",
        description: "Could not update note color. Please try again.",
        variant: "destructive"
      });
      throw error; // Re-throw to let the component handle UI reversion
    } finally {
      setIsSavingColor(false);
    }
  }, [note.id, onUpdate, toast]);
  
  // Category operations
  const handleEditCategory = useCallback(async (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }
    try {
      await updateNoteCategory(note.id, category);
      console.log('✅ Granular category update successful');
      setIsEditingCategory(false);
      setShowNewCategoryInput(false);
    } catch (error) {
      console.error('❌ Granular category update failed, falling back:', error);
      try {
        // Fallback to full update if granular fails
        await onUpdate(note.id, { category: category });
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
      } catch (fallbackError) {
        console.error('Failed to update note category:', fallbackError);
        toast({
          title: "Error updating category",
          description: "Could not update note category. Please try again.",
          variant: "destructive"
        });
      }
    }
  }, [note.id, onUpdate, toast]);
  
  const handleAddCustomCategory = useCallback(async () => {
    if (newCategory.trim() !== '') {
      try {
        await updateNoteCategory(note.id, newCategory.trim());
        console.log('✅ Granular custom category update successful');
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
        setNewCategory('');
      } catch (error) {
        console.error('❌ Granular custom category update failed, falling back:', error);
        try {
          // Fallback to full update if granular fails
          await onUpdate(note.id, { category: newCategory.trim() });
          setIsEditingCategory(false);
          setShowNewCategoryInput(false);
          setNewCategory('');
        } catch (fallbackError) {
          console.error('Failed to add custom category:', fallbackError);
          toast({
            title: "Error adding category",
            description: "Could not add custom category. Please try again.",
            variant: "destructive"
          });
        }
      }
    } else {
      toast({
        title: "Category cannot be empty",
        description: "Please enter a valid category name",
        variant: "destructive"
      });
    }
  }, [newCategory, note.id, onUpdate, toast]);
  
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
    
    // Refs
    titleEditRef,
    contentEditRef,
  };
}; 