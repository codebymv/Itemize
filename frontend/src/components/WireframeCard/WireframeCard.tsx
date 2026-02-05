/**
 * WireframeCard Component
 * Card wrapper for React Flow based wireframe diagrams
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical, Edit3, Trash2, X, Check, GitBranch, Share2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWireframeCardLogic } from '@/hooks/useWireframeCardLogic';
import { WireframeCardProps } from '@/types';
import WireframeCanvas from './WireframeCanvas';
import { CategorySelector } from '../CategorySelector';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { Node, Edge } from '@xyflow/react';

const WireframeCard: React.FC<WireframeCardProps> = ({
  wireframe,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  isCollapsed,
  onToggleCollapsed,
  updateCategory
}) => {
  const categoryColor = existingCategories.find(c => c.name === wireframe.category)?.color_value;
  const wireframeDisplayColor = wireframe.color_value || categoryColor || '#3B82F6';

  // Mobile detection
  const isMobile = useIsMobile();

  // State for delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Color preview state for ColorPicker
  const [currentColorPreview, setCurrentColorPreview] = useState(wireframe.color_value || '#3B82F6');

  // Toast for error notifications
  const { toast } = useToast();

  // Sync color preview when wireframe color changes externally
  useEffect(() => {
    setCurrentColorPreview(wireframe.color_value || '#3B82F6');
  }, [wireframe.color_value]);

  const {
    wireframeTitle,
    isCollapsibleOpen, setIsCollapsibleOpen,
    isEditing, setIsEditing, editTitle, setEditTitle, handleEditTitle,
    handleDeleteWireframe,
    handleSaveWireframeColor,
    isSavingColor,
    isEditingCategory, setIsEditingCategory,
    showNewCategoryInput, setShowNewCategoryInput,
    newCategory, setNewCategory, 
    handleEditCategory, handleAddCustomCategory,
    handleFlowDataSave,
    titleEditRef
  } = useWireframeCardLogic({ wireframe, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory });

  // Handle sharing
  const handleShareWireframe = () => {
    onShare(wireframe.id);
  };

  // Handle delete confirmation
  const handleDeleteConfirmation = () => {
    setShowDeleteModal(true);
  };

  // Handle actual delete
  const handleConfirmDelete = async () => {
    try {
      await onDelete(wireframe.id);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Parse flow_data if it's a string
  const getFlowData = () => {
    if (typeof wireframe.flow_data === 'string') {
      try {
        return JSON.parse(wireframe.flow_data);
      } catch {
        return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
      }
    }
    return wireframe.flow_data || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  };

  const handleFlowDataChange = (flowData: { nodes: Node[]; edges: Edge[]; viewport: { x: number; y: number; zoom: number } }) => {
    handleFlowDataSave(flowData);
  };

  const handleUpdateCategoryColor = async (categoryName: string, newColor: string) => {
    if (updateCategory) {
      await updateCategory(categoryName, { color_value: newColor });
    }
  };

  return (
    <Collapsible
      open={isCollapsibleOpen}
      onOpenChange={(open) => {
        if (onToggleCollapsed && isCollapsed !== undefined) {
          const currentlyOpen = !isCollapsed;
          if (currentlyOpen !== open) {
            onToggleCollapsed();
          }
        } else {
          setIsCollapsibleOpen(open);
        }
      }}
      className="w-full h-full flex flex-col"
      style={{ '--wireframe-color': wireframeDisplayColor } as React.CSSProperties}
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
                    color={wireframeDisplayColor}
                    onChange={(newColor) => {
                      setCurrentColorPreview(newColor);
                    }}
                    onSave={async (finalColor) => { 
                      if (finalColor !== (wireframe.color_value || '#3B82F6')) {
                        try {
                          await handleSaveWireframeColor(finalColor);
                        } catch (error) {
                          toast({
                            title: 'Error',
                            description: 'Could not save color. Reverting preview.',
                            variant: 'destructive',
                          });
                          setCurrentColorPreview(wireframe.color_value || '#3B82F6');
                        }
                      }
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 rounded-full flex items-center justify-center relative"
                      aria-label="Change wireframe color"
                      disabled={isSavingColor}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-border transition-colors duration-150"
                        style={{ backgroundColor: wireframeDisplayColor }}
                      />
                      {isSavingColor && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
                          <Spinner size="xs" variant="current" />
                        </div>
                      )}
                    </Button>
                  </ColorPicker>
                  <GitBranch className="h-4 w-4" style={{ color: wireframeDisplayColor }} />
                  <CardTitle 
                    className="text-lg font-medium cursor-pointer"
                    onClick={() => setIsEditing(true)}
                  >
                    {wireframeTitle}
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
                      <DropdownMenuItem onClick={() => setIsEditing(true)} className="group/menu">
                        <Edit3 className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600" />
                        Edit Title
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleShareWireframe} className="group/menu">
                        <Share2 className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteConfirmation} className="text-red-600">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Wireframe
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <CategorySelector
          currentCategory={wireframe.category || ''}
          categoryColor={categoryColor}
          itemColor={wireframe.color_value}
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

        <CollapsibleContent className="flex-1 flex flex-col min-h-0">
          <div 
            className="rounded-lg mx-6 mb-6 flex-1 flex flex-col relative overflow-hidden" 
            style={{ 
              border: `2px solid ${wireframeDisplayColor}`,
              minHeight: isMobile ? '300px' : '400px'
            }}
          >
            <WireframeCanvas
              flowData={getFlowData()}
              onFlowDataChange={handleFlowDataChange}
              readOnly={false}
            />
          </div>
        </CollapsibleContent>
      </Card>

      {/* Delete confirmation modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        itemType="wireframe"
        itemTitle={wireframe.title}
        itemColor={wireframeDisplayColor}
        onConfirm={handleConfirmDelete}
      />
    </Collapsible>
  );
};

export default WireframeCard;
