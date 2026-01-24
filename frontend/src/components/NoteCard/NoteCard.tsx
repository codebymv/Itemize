import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical, Edit3, Trash2, X, Check, StickyNote, Share2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { useToast } from '@/hooks/use-toast';
import { useNoteCardLogic } from '@/hooks/useNoteCardLogic';
import { Note } from '@/types';
import { RichNoteContent } from './RichNoteContent';
import { NoteCategorySelector } from './NoteCategorySelector';
import { useTheme } from 'next-themes';

import { Category } from '@/types';
import { DeleteNoteModal } from '../DeleteNoteModal';
import { updateNoteContent } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface NoteCardProps {
  note: Note;
  onUpdate: (noteId: number, updatedData: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
  onShare: (noteId: number) => void;
  existingCategories: Category[];
  onCollapsibleChange?: (isOpen: boolean) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  updateCategory: (categoryName: string, updatedData: Partial<Category>) => Promise<void>;
}

const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  onCollapsibleChange,
  isCollapsed,
  onToggleCollapsed,
  updateCategory
}) => {
  // State for delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Get auth token
  const { token } = useAuth();

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
  } = useNoteCardLogic({ note, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory });

  // Handle sharing
  const handleShareNote = () => {
    onShare(note.id);
  };

  // Handle delete confirmation
  const handleDeleteConfirmation = () => {
    setShowDeleteModal(true);
  };

  // Handle actual delete
  const handleConfirmDelete = async (noteId: string) => {
    await onDelete(parseInt(noteId));
    return true; // Return true to indicate success
  };

  // Get theme for styling
  const { theme } = useTheme();
  const isLight = theme === 'light';

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

  const categoryColor = existingCategories.find(c => c.name === note.category)?.color_value;
  const noteDisplayColor = note.color_value || categoryColor || '#FFFFE0'; // Default to light yellow if no color is set

  // Wrapper function to adapt updateCategory interface for the selector
  const handleUpdateCategoryColor = async (categoryName: string, newColor: string) => {
    await updateCategory(categoryName, { color_value: newColor });
  };

  // Debug logging for note colors
  React.useEffect(() => {
    console.log('🎨 Note Color Debug:', {
      noteId: note.id,
      noteColorValue: note.color_value,
      currentColorPreview,
      noteDisplayColor,
      isEditingContent
    });
  }, [note.id, note.color_value, currentColorPreview, noteDisplayColor, isEditingContent]);

  return (
    <Collapsible
      open={isCollapsibleOpen}
      onOpenChange={(open) => {
        // If using external collapsible state, call the toggle function when state should change
        if (onToggleCollapsed && isCollapsed !== undefined) {
          // Only toggle if the current state is different from desired state
          const currentlyOpen = !isCollapsed;
          if (currentlyOpen !== open) {
            onToggleCollapsed();
          }
        } else {
          // Use internal state management
          setIsCollapsibleOpen(open);
        }
        onCollapsibleChange?.(open);
      }}
      className="w-full"
      style={{ '--note-color': noteDisplayColor } as React.CSSProperties}
    >
      <Card className="w-full shadow-sm h-full flex flex-col" style={{ border: 'none' }}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            {isEditing ? (
              <div className="flex gap-1 w-full">
                <Input
                  ref={titleEditRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleEditTitle();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEditTitle}
                  className="h-8 w-8 p-0"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
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
                        className="inline-block w-3 h-3 rounded-full border transition-colors duration-150"
                        style={{ backgroundColor: noteDisplayColor, borderColor: '#d1d5db' }}
                      />
                      {isSavingColor && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}>
                          <div className="h-2 w-2 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                        </div>
                      )}
                    </Button>
                  </ColorPicker>
                  <StickyNote className="h-4 w-4" style={{ color: 'var(--note-color)' }} />
                  <CardTitle 
                    className="text-lg font-medium cursor-pointer"
                    style={{ fontFamily: '"Raleway", sans-serif' }}
                    onClick={() => setIsEditing(true)}
                  >
                    {noteTitle}
                  </CardTitle>
                </div>
                <div className="flex">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        isCollapsibleOpen ? "" : "transform rotate-180"
                      )}/>
                    </Button>
                  </CollapsibleTrigger>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setIsEditing(true)} style={{ fontFamily: '"Raleway", sans-serif' }}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        Edit Title
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleShareNote} style={{ fontFamily: '"Raleway", sans-serif' }}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteConfirmation} className="text-red-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Note
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <NoteCategorySelector
          currentCategory={note.category || ''}
          categoryColor={categoryColor}
          itemColor={note.color_value}
          existingCategories={existingCategories}
          isEditingCategory={isEditingCategory}
          showNewCategoryInput={showNewCategoryInput}
          newCategory={newCategory}
          setNewCategory={setNewCategory}
          setIsEditingCategory={setIsEditingCategory}
          setShowNewCategoryInput={setShowNewCategoryInput}
          handleEditCategory={handleEditCategory}
          handleAddCustomCategory={handleAddCustomCategory}
          handleUpdateCategoryColor={handleUpdateCategoryColor}
        />

        <CollapsibleContent className="flex-1">
          <div
            className="rounded-lg mx-2 md:mx-6 mb-6 flex-1 flex flex-col"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#1e293b',
              border: `2px solid ${noteDisplayColor} !important`,
              borderColor: `${noteDisplayColor} !important`,
              height: `${Math.max(180, (note.height || 300) - 120)}px` // Increased default height
            }}
          >
            <RichNoteContent
              content={note.content}
              isEditingContent={isEditingContent}
              editContent={editContent}
              setEditContent={setEditContent}
              setIsEditingContent={setIsEditingContent}
              handleEditContent={handleEditContent}
              contentEditRef={contentEditRef}
              noteCategory={note.category}
              noteColor={noteDisplayColor}
              noteId={note.id}
              onAutoSave={async (content: string) => {
                // Use granular content update for real-time updates
                try {
                  await updateNoteContent(note.id, content, token);
                  console.log('✅ Granular content update successful');
                } catch (error) {
                  console.error('❌ Granular content update failed:', error);
                  // Fallback to full update if granular fails
                  await onUpdate(note.id, { content, updated_at: new Date().toISOString() });
                }
              }}
              updatedAt={note.updated_at}
            />
          </div>
        </CollapsibleContent>
      </Card>

      {/* Delete confirmation modal */}
      <DeleteNoteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        noteId={note.id.toString()}
        noteTitle={note.title}
        noteColor={noteDisplayColor}
        onDelete={handleConfirmDelete}
      />
    </Collapsible>
  );
};

export default NoteCard;