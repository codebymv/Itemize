import React, { useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useNoteCardLogic } from '@/hooks/useNoteCardLogic';
import { Note } from '@/types';
import { NoteCardHeader } from './NoteCardHeader';
import { NoteCategorySelector } from './NoteCategorySelector';
import { NoteContent } from './NoteContent';

interface NoteCardProps {
  note: Note;
  onUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
  existingCategories: string[];
  onCollapsibleChange?: (isOpen: boolean) => void;
}

const NoteCard: React.FC<NoteCardProps> = ({ 
  note, 
  onUpdate, 
  onDelete, 
  existingCategories,
  onCollapsibleChange
}) => {
  const {
    // Title for display
    noteTitle,
    
    // Collapsible
    isCollapsibleOpen, setIsCollapsibleOpen,
    
    // Title editing
    isEditing, setIsEditing, editTitle, setEditTitle, handleEditTitle,
    
    // Note operations
    handleDeleteNote,

    // Color
    handleSaveNoteColor,
    isSavingColor,
    
    // Category editing
    isEditingCategory, setIsEditingCategory,
    showNewCategoryInput, setShowNewCategoryInput,
    newCategory, setNewCategory, 
    handleEditCategory, handleAddCustomCategory,
    
    // Content
    isEditingContent, setIsEditingContent,
    editContent, setEditContent, handleEditContent,
    
    // Refs
    titleEditRef, contentEditRef
  } = useNoteCardLogic({ note, onUpdate, onDelete });

  // Implement click outside handler for title editing
  useEffect(() => {
    if (!isEditing) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (
        titleEditRef.current && 
        !titleEditRef.current.contains(event.target as Node)
      ) {
        handleEditTitle();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing, handleEditTitle]);

  const noteDisplayColor = note.color_value || '#FFFFE0'; // Default to yellow if no color is set

  return (
    <Collapsible
      open={isCollapsibleOpen}
      onOpenChange={(open) => {
        setIsCollapsibleOpen(open);
        onCollapsibleChange?.(open);
      }}
      className="w-full"
      style={{ '--note-color': noteDisplayColor } as React.CSSProperties}
    >
      <Card className="w-full border shadow-sm h-full flex flex-col">
        <NoteCardHeader
          title={noteTitle}
          noteColor={note.color_value}
          isEditing={isEditing}
          editTitle={editTitle}
          isCollapsibleOpen={isCollapsibleOpen}
          setEditTitle={setEditTitle}
          setIsEditing={setIsEditing}
          handleEditTitle={handleEditTitle}
          handleDeleteNote={handleDeleteNote}
          titleEditRef={titleEditRef}
          onColorSave={handleSaveNoteColor}
          isSavingColor={isSavingColor}
        />

        <NoteCategorySelector
          currentCategory={note.category || 'General'}
          existingCategories={existingCategories}
          isEditingCategory={isEditingCategory}
          showNewCategoryInput={showNewCategoryInput}
          newCategory={newCategory}
          setNewCategory={setNewCategory}
          setIsEditingCategory={setIsEditingCategory}
          setShowNewCategoryInput={setShowNewCategoryInput}
          handleEditCategory={handleEditCategory}
          handleAddCustomCategory={handleAddCustomCategory}
        />

        <CollapsibleContent className="flex-1">
          <div 
            className="bg-white border-2 rounded-lg mx-6 mb-6 flex-1 flex flex-col" 
            style={{ 
              borderColor: 'var(--note-color)',
              height: `${Math.max(100, (note.height || 200) - 120)}px` // Fixed height calculation
            }}
          >
            <NoteContent
              content={note.content}
              isEditingContent={isEditingContent}
              editContent={editContent}
              setEditContent={setEditContent}
              setIsEditingContent={setIsEditingContent}
              handleEditContent={handleEditContent}
              contentEditRef={contentEditRef}
              noteCategory={note.category}
            />
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default NoteCard; 