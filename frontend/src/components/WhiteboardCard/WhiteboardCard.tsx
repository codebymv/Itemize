import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical, Edit3, Trash2, X, Check, Palette, Share2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWhiteboardCardLogic } from '../../hooks/useWhiteboardCardLogic';
import { WhiteboardCardProps, Category } from '../../types';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import { CategorySelector } from '../CategorySelector';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';



const MIN_MOBILE_WHITEBOARD_HEIGHT = 400;

const WhiteboardCard: React.FC<WhiteboardCardProps> = ({
  whiteboard,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  isCollapsed,
  onToggleCollapsed,
  updateCategory
}) => {
  const categoryColor = existingCategories.find(c => c.name === whiteboard.category)?.color_value;
  const whiteboardDisplayColor = whiteboard.color_value || categoryColor || '#3B82F6'; // Default to blue if no color is set

  // Mobile detection using shared hook
  const isMobile = useIsMobile();
  const [scaledCanvasHeight, setScaledCanvasHeight] = useState<number | undefined>(undefined);

  // State for delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Color preview state for ColorPicker
  const [currentColorPreview, setCurrentColorPreview] = useState(whiteboard.color_value || '#3B82F6');

  // Toast for error notifications
  const { toast } = useToast();

  const whiteboardContainerRef = useRef<HTMLDivElement>(null);

  // Sync color preview when whiteboard color changes externally
  useEffect(() => {
    setCurrentColorPreview(whiteboard.color_value || '#3B82F6');
  }, [whiteboard.color_value]);

  

  const {
    // Title for display
    whiteboardTitle,
    
    // Collapsible
    isCollapsibleOpen, setIsCollapsibleOpen,
    
    // Title editing
    isEditing, setIsEditing, editTitle, setEditTitle, handleEditTitle,
    
    // Whiteboard operations
    handleDeleteWhiteboard,

    // Color
    handleSaveWhiteboardColor,
    isSavingColor,
    
    // Category editing
    isEditingCategory, setIsEditingCategory,
    showNewCategoryInput, setShowNewCategoryInput,
    newCategory, setNewCategory, 
    handleEditCategory, handleAddCustomCategory, handleUpdateCategoryColor,
    
    // Canvas
    handleCanvasChange,
    handleCanvasSave,
    
    // Refs
    titleEditRef
  } = useWhiteboardCardLogic({ whiteboard, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory });

  // Handle sharing
  const handleShareWhiteboard = () => {
    onShare(whiteboard.id);
  };

  // Handle delete confirmation
  const handleDeleteConfirmation = () => {
    setShowDeleteModal(true);
  };

  // Handle actual delete
  const handleConfirmDelete = async () => {
    try {
      await onDelete(whiteboard.id);
      return true;
    } catch (error) {
      return false;
    }
  };

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
      }}
      className="w-full"
      style={{ '--whiteboard-color': whiteboardDisplayColor } as React.CSSProperties}
    >
      <Card 
        className="w-full shadow-sm h-full flex flex-col" 
        style={{ border: 'none' }}
      >
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
                    color={whiteboardDisplayColor}
                    onChange={(newColor) => {
                      setCurrentColorPreview(newColor);
                    }}
                    onSave={async (finalColor) => { 
                      // Only save if color actually changed from original whiteboard color
                      if (finalColor !== (whiteboard.color_value || '#3B82F6')) {
                        try {
                          await handleSaveWhiteboardColor(finalColor);
                        } catch (error) {
                          toast({
                            title: 'Error',
                            description: 'Could not save color. Reverting preview.',
                            variant: 'destructive',
                          });
                          setCurrentColorPreview(whiteboard.color_value || '#3B82F6'); // Revert preview on save error
                        }
                      }
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 rounded-full flex items-center justify-center relative"
                      aria-label="Change whiteboard color"
                      disabled={isSavingColor}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-border transition-colors duration-150"
                        style={{ backgroundColor: whiteboardDisplayColor }}
                      />
                      {isSavingColor && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
                          <Spinner size="xs" variant="current" />
                        </div>
                      )}
                    </Button>
                  </ColorPicker>
                  <Palette className="h-4 w-4" style={{ color: 'var(--whiteboard-color)' }} />
                  <CardTitle 
                    className="text-lg font-medium cursor-pointer font-raleway"
                    onClick={() => setIsEditing(true)}
                  >
                    {whiteboardTitle}
                  </CardTitle>
                </div>
                <div className="flex">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Toggle whiteboard details">
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        isCollapsibleOpen ? "" : "transform rotate-180"
                      )}/>
                    </Button>
                  </CollapsibleTrigger>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Whiteboard actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setIsEditing(true)} className="group/menu font-raleway">
                        <Edit3 className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600" />
                        Edit Title
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleShareWhiteboard} className="group/menu font-raleway">
                        <Share2 className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteConfirmation} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Whiteboard
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <CategorySelector
          currentCategory={whiteboard.category || ''}
          categoryColor={categoryColor}
          itemColor={whiteboard.color_value}
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
            className="rounded-lg mx-6 mb-6 flex-1 flex flex-col relative" 
            style={{ 
              backgroundColor: '#ffffff',
              border: `2px solid ${whiteboardDisplayColor} !important`,
              borderColor: `${whiteboardDisplayColor} !important`,
              height: isMobile && scaledCanvasHeight !== undefined ? `${Math.max(MIN_MOBILE_WHITEBOARD_HEIGHT, scaledCanvasHeight - 120)}px` : `${Math.max(530, (whiteboard.canvas_height || 620) - 120)}px`
            }}
            ref={whiteboardContainerRef}
          >
            <WhiteboardCanvas
              whiteboard={whiteboard}
              onCanvasChange={handleCanvasChange}
              onSave={handleCanvasSave}
              whiteboardColor={whiteboardDisplayColor}
              onAutoSave={handleCanvasSave}
              isMobile={isMobile}
              onScaledHeightChange={setScaledCanvasHeight}
              updatedAt={whiteboard.updated_at}
              aiEnabled={true} // Placeholder for now, assuming AI is enabled for whiteboards
            />
            
            
          </div>
        </CollapsibleContent>
      </Card>

      {/* Delete confirmation modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        itemType="whiteboard"
        itemTitle={whiteboard.title}
        itemColor={whiteboardDisplayColor}
        onConfirm={handleConfirmDelete}
      />
    </Collapsible>
  );
};

export default WhiteboardCard;