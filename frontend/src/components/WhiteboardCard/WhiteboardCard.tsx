import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical, Edit3, Trash2, X, Check, Palette, Share2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { useToast } from '@/hooks/use-toast';
import { useWhiteboardCardLogic } from '../../hooks/useWhiteboardCardLogic';
import { WhiteboardCardProps, Category } from '../../types';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import { WhiteboardCategorySelector } from './WhiteboardCategorySelector';



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

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [scaledCanvasHeight, setScaledCanvasHeight] = useState<number | undefined>(undefined);
  
  const whiteboardContainerRef = useRef<HTMLDivElement>(null);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  

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
    handleEditCategory, handleAddCustomCategory,
    
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
                          <div className="h-2 w-2 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                        </div>
                      )}
                    </Button>
                  </ColorPicker>
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <CardTitle 
                    className="text-lg font-medium cursor-pointer"
                    style={{ fontFamily: '"Raleway", sans-serif' }}
                    onClick={() => setIsEditing(true)}
                  >
                    {whiteboardTitle}
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
                      <DropdownMenuItem onClick={handleShareWhiteboard} style={{ fontFamily: '"Raleway", sans-serif' }}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteWhiteboard} className="text-red-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
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

        <WhiteboardCategorySelector
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
          handleUpdateCategoryColor={updateCategory}
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
    </Collapsible>
  );
};

export default WhiteboardCard; 