import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { useToast } from '@/hooks/use-toast';
import { useNoteCardLogic } from '@/hooks/useNoteCardLogic';
import { Note } from '@/types';
import { NoteContent } from './NoteContent';
import { NoteCategorySelector } from './NoteCategorySelector';

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

  const { toast } = useToast();
  const [currentColorPreview, setCurrentColorPreview] = React.useState(note.color_value || '#FFFFE0');

  React.useEffect(() => {
    setCurrentColorPreview(note.color_value || '#FFFFE0');
  }, [note.color_value]);

  const noteDisplayColor = currentColorPreview;

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
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ColorPicker
                color={noteDisplayColor}
                onChange={(newColor) => {
                  setCurrentColorPreview(newColor);
                }}
                onSave={async (finalColor) => { 
                  // Only save if color actually changed from original note color
                  if (finalColor !== (note.color_value || '#FFFFE0')) {
                    try {
                      await handleSaveNoteColor(finalColor);
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Could not save color. Reverting preview.',
                        variant: 'destructive',
                      });
                      setCurrentColorPreview(note.color_value || '#FFFFE0'); // Revert preview on save error
                    }
                  }
                }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0 rounded-full flex items-center justify-center relative"
                  aria-label="Change note color"
                  disabled={isSavingColor}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-gray-400 transition-colors duration-150"
                    style={{ backgroundColor: noteDisplayColor }}
                  />
                  {isSavingColor && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-full">
                      <div className="h-2 w-2 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                    </div>
                  )}
                </Button>
              </ColorPicker>
              <CardTitle 
                className="text-lg font-medium cursor-pointer"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {noteTitle}
              </CardTitle>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  isCollapsibleOpen ? "" : "transform rotate-180"
                )}/>
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <NoteCategorySelector
          currentCategory={note.category || ''}
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