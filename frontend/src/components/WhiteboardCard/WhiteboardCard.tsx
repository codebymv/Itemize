import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical, Edit3, Trash2, X, Check } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { useToast } from '@/hooks/use-toast';
import { useWhiteboardCardLogic } from '../../hooks/useWhiteboardCardLogic';
import { WhiteboardCardProps } from '../../types';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import { WhiteboardCategorySelector } from './WhiteboardCategorySelector';

// Mobile constants
const MIN_MOBILE_HEIGHT = 250;
const MAX_MOBILE_HEIGHT = 800;
const DEFAULT_MOBILE_HEIGHT = 400;

const WhiteboardCard: React.FC<WhiteboardCardProps> = ({ 
  whiteboard, 
  onUpdate, 
  onDelete, 
  existingCategories,
  isCollapsed,
  onToggleCollapsed
}) => {
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [mobileHeight, setMobileHeight] = useState(whiteboard.canvas_height || DEFAULT_MOBILE_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);
  
  // Mobile resize refs
  const mobileCardRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout>();
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

  // Update mobile height when whiteboard canvas_height changes
  useEffect(() => {
    if (isMobile) {
      setMobileHeight(Math.min(MAX_MOBILE_HEIGHT, Math.max(MIN_MOBILE_HEIGHT, whiteboard.canvas_height || DEFAULT_MOBILE_HEIGHT)));
    }
  }, [whiteboard.canvas_height, isMobile]);

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
  } = useWhiteboardCardLogic({ whiteboard, onUpdate, onDelete, isCollapsed, onToggleCollapsed });

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
  const [currentColorPreview, setCurrentColorPreview] = React.useState(whiteboard.color_value || '#3B82F6');

  React.useEffect(() => {
    setCurrentColorPreview(whiteboard.color_value || '#3B82F6');
  }, [whiteboard.color_value]);

  const whiteboardDisplayColor = currentColorPreview;

  // Mobile resize handlers
  const handleMobileResizeStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setIsResizing(true);
    setResizeStartY(clientY);
    setResizeStartHeight(mobileHeight);
    
    let currentPreviewHeight = mobileHeight;
    
    // Add global listeners
    const handleMove = (e: TouchEvent | MouseEvent) => {
      const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - resizeStartY;
      const newHeight = Math.min(MAX_MOBILE_HEIGHT, Math.max(MIN_MOBILE_HEIGHT, resizeStartHeight + deltaY));
      
      currentPreviewHeight = newHeight;
      
      // Direct DOM manipulation to avoid React re-renders
      if (whiteboardContainerRef.current) {
        whiteboardContainerRef.current.style.height = `${newHeight}px`;
      }
    };
    
    const handleEnd = () => {
      // Update actual React state when resize ends
      setMobileHeight(currentPreviewHeight);
      setIsResizing(false);
      
      // Clear direct DOM style to let React take over
      if (whiteboardContainerRef.current) {
        whiteboardContainerRef.current.style.height = '';
      }
      
      // Debounced save to database
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(async () => {
        await onUpdate(whiteboard.id, {
          canvas_height: Math.round(currentPreviewHeight)
        });
      }, 1500); // Increased debounce time from 500ms to 1.5s to reduce excessive API calls
      
      // Remove listeners
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('mouseup', handleEnd);
    };
    
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('mouseup', handleEnd);
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
        ref={mobileCardRef}
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
                        className="inline-block w-3 h-3 rounded-full border border-gray-400 transition-colors duration-150"
                        style={{ backgroundColor: whiteboardDisplayColor }}
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
            className="bg-white rounded-lg mx-6 mb-6 flex-1 flex flex-col relative" 
            style={{ 
              border: `2px solid ${whiteboardDisplayColor} !important`,
              borderColor: `${whiteboardDisplayColor} !important`,
              height: isMobile ? `${mobileHeight}px` : `${Math.max(300, whiteboard.canvas_height)}px`
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
            />
            
            {/* Mobile Vertical Resize Handle */}
            {isMobile && !isCollapsed && (
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0 h-6 cursor-ns-resize flex items-center justify-center",
                  "touch-manipulation select-none transition-colors duration-200",
                  isResizing ? "bg-blue-100 border-t-2 border-blue-300" : "hover:bg-gray-100 border-t border-gray-300"
                )}
                onTouchStart={handleMobileResizeStart}
                onMouseDown={handleMobileResizeStart}
                style={{ 
                  zIndex: 20,
                  borderBottomLeftRadius: '6px',
                  borderBottomRightRadius: '6px'
                }}
              >
                {/* Visual resize indicator */}
                <div className={cn(
                  "w-16 h-1.5 rounded-full transition-all duration-200",
                  isResizing ? "bg-blue-500 scale-110" : "bg-gray-400"
                )} />
                
                {/* Resize instruction text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={cn(
                    "text-xs font-medium transition-all duration-200 pointer-events-none",
                    isResizing ? "text-blue-600 opacity-100" : "text-gray-500 opacity-0"
                  )}>
                    {isResizing ? "Resizing..." : "Drag to resize"}
                  </div>
                </div>
                
                {/* Touch target expansion */}
                <div className="absolute -inset-2" />
              </div>
            )}
            
            {/* Mobile gesture hint overlay - positioned at bottom */}
            {isMobile && !isCollapsed && mobileHeight > MIN_MOBILE_HEIGHT + 50 && (
              <div className="absolute bottom-8 left-2 right-2 pointer-events-none z-10">
                <div className="bg-black/70 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm shadow-lg">
                  <div className="flex items-center justify-center gap-2">
                    <span>✌️</span>
                    <span>Two fingers: Pan & Zoom</span>
                    <span className="mx-2">•</span>
                    <span>☝️</span>
                    <span>One finger: Draw</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default WhiteboardCard; 