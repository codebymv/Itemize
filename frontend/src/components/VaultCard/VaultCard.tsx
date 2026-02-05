import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical, Edit3, Trash2, X, Check, Lock, KeyRound, Share2, Plus } from 'lucide-react';
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { Spinner } from '@/components/ui/Spinner';
import { useVaultCardLogic } from '@/hooks/useVaultCardLogic';
import { VaultCardProps, Category } from '@/types';
import { CategorySelector } from '../CategorySelector';
import { VaultItemRow } from './VaultItemRow';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { useTheme } from 'next-themes';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable item wrapper component
const SortableItem: React.FC<{ id: number; children: React.ReactNode }> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {React.cloneElement(children as React.ReactElement, {
        isDragging,
        dragHandleProps: listeners,
      })}
    </div>
  );
};

export const VaultCard: React.FC<VaultCardProps> = ({
  vault,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  isCollapsed,
  onToggleCollapsed,
  updateCategory
}) => {
  const categoryColor = existingCategories.find(c => c.name === vault.category)?.color_value;
  const vaultDisplayColor = vault.color_value || categoryColor || '#3B82F6'; // Default to blue

  // State for delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Color preview state
  const [currentColorPreview, setCurrentColorPreview] = useState(vault.color_value || '#3B82F6');

  // Get theme for styling
  const { theme } = useTheme();

  // Sync color preview when vault color changes
  useEffect(() => {
    setCurrentColorPreview(vault.color_value || '#3B82F6');
  }, [vault.color_value]);

  const {
    // Title for display
    vaultTitle,
    
    // Collapsible
    isCollapsibleOpen, setIsCollapsibleOpen,
    
    // Title editing
    isEditing, setIsEditing, editTitle, setEditTitle, handleEditTitle,
    
    // Vault operations
    handleDeleteVault,
    
    // Color
    handleSaveVaultColor,
    isSavingColor,
    
    // Category editing
    isEditingCategory, setIsEditingCategory,
    showNewCategoryInput, setShowNewCategoryInput,
    newCategory, setNewCategory,
    handleEditCategory, handleAddCustomCategory, handleUpdateCategoryColor,
    
    // Items
    items,
    isLoadingItems,
    loadItems,
    
    // Item visibility
    toggleItemVisibility,
    isItemVisible,
    copyToClipboard,
    
    // Item editing
    editingItemId,
    editingItemLabel,
    setEditingItemLabel,
    editingItemValue,
    setEditingItemValue,
    startEditingItem,
    cancelEditingItem,
    handleUpdateItem,
    handleDeleteItem,
    
    // New item
    showAddItem,
    setShowAddItem,
    newItemType,
    setNewItemType,
    newItemLabel,
    setNewItemLabel,
    newItemValue,
    setNewItemValue,
    handleAddItem,
    
    // Bulk operations
    handleBulkAddItems,
    handleReorderItems,
    parseEnvFormat,
    
    // Refs
    titleEditRef,
    newItemLabelRef,
  } = useVaultCardLogic({ vault, onUpdate, onDelete, isCollapsed, onToggleCollapsed, updateCategory });

  // Handle sharing
  const handleShareVault = () => {
    onShare(vault.id);
  };

  // Handle delete confirmation
  const handleDeleteConfirmation = () => {
    setShowDeleteModal(true);
  };

  // Handle actual delete
  const handleConfirmDelete = async () => {
    try {
      await onDelete(vault.id);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Handle paste in key-value input - detect .env format and bulk import
  const handleLabelPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const parsedItems = parseEnvFormat(pastedText);
    
    // If pasted text contains multiple env variables, bulk import them
    if (parsedItems.length > 1) {
      e.preventDefault();
      await handleBulkAddItems(parsedItems);
      setShowAddItem(false);
      setNewItemLabel('');
      setNewItemValue('');
    }
    // If it's a single KEY=VALUE, parse and fill both fields
    else if (parsedItems.length === 1) {
      e.preventDefault();
      setNewItemLabel(parsedItems[0].label);
      setNewItemValue(parsedItems[0].value);
    }
    // Otherwise, let the default paste behavior happen
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end event for reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newOrder = arrayMove(items, oldIndex, newIndex).map(item => item.id);
      handleReorderItems(newOrder);
    }
  };

  // Load items when collapsible opens
  useEffect(() => {
    if (isCollapsibleOpen) {
      loadItems();
    }
  }, [isCollapsibleOpen, loadItems]);

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
      style={{ '--vault-color': vaultDisplayColor } as React.CSSProperties}
    >
      <Card 
        className="w-full shadow-sm h-full flex flex-col overflow-hidden" 
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
                  aria-label="Save vault title"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditTitle(vault.title || 'Untitled Vault');
                    setIsEditing(false);
                  }}
                  className="h-8 w-8 p-0"
                  aria-label="Cancel edit"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {/* Color Picker - first on left */}
                  <ColorPicker
                    color={currentColorPreview}
                    onChange={setCurrentColorPreview}
                    onSave={handleSaveVaultColor}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 rounded-full flex items-center justify-center relative"
                      aria-label="Change vault color"
                      disabled={isSavingColor}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-border transition-colors duration-150"
                        style={{ backgroundColor: vaultDisplayColor }}
                      />
                      {isSavingColor && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
                          <Spinner size="xs" variant="current" />
                        </div>
                      )}
                    </Button>
                  </ColorPicker>
                  {/* Type icon */}
                  {vault.is_locked ? (
                    <Lock className="h-4 w-4" style={{ color: vaultDisplayColor }} />
                  ) : (
                    <KeyRound className="h-4 w-4" style={{ color: vaultDisplayColor }} />
                  )}
                  {/* Title - clickable to edit */}
                  <CardTitle 
                    className="text-lg font-medium cursor-pointer font-raleway"
                    onClick={() => setIsEditing(true)}
                  >
                    {vaultTitle}
                  </CardTitle>
                </div>
                <div className="flex">
                  {/* Collapsible trigger - separate button */}
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Toggle vault details">
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        isCollapsibleOpen ? "" : "transform rotate-180"
                      )}/>
                    </Button>
                  </CollapsibleTrigger>
                  {/* Dropdown menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Vault actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setIsEditing(true)} className="group/menu font-raleway">
                        <Edit3 className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600" />
                        Edit Title
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleShareVault} className="group/menu font-raleway">
                        <Share2 className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleDeleteConfirmation}
                        className="text-red-600 font-raleway"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Vault
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <CategorySelector
          currentCategory={vault.category || 'General'}
          categoryColor={categoryColor}
          itemColor={vault.color_value}
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

        <CollapsibleContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <CardContent className="pt-0 flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Items count and add button - fixed header */}
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <span className="text-sm text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddItem(true)}
                className="h-7"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item
              </Button>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* New item form */}
              {showAddItem && (
                <div className="mb-4 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={newItemType}
                      onChange={(e) => setNewItemType(e.target.value as 'key_value' | 'secure_note')}
                      className="h-8 px-2 rounded-md border bg-background text-sm"
                    >
                      <option value="key_value">Key-Value</option>
                      <option value="secure_note">Secure Note</option>
                    </select>
                    <Input
                      ref={newItemLabelRef}
                      value={newItemLabel}
                      onChange={(e) => setNewItemLabel(e.target.value)}
                      onPaste={newItemType === 'key_value' ? handleLabelPaste : undefined}
                      placeholder={newItemType === 'key_value' ? "KEY_NAME (paste .env to bulk import)" : "Note title"}
                      className="h-8 font-mono text-sm flex-1"
                      autoFocus
                    />
                  </div>
                  {newItemType === 'key_value' ? (
                    <Input
                      value={newItemValue}
                      onChange={(e) => setNewItemValue(e.target.value)}
                      placeholder="Value"
                      className="h-8 font-mono text-sm mb-2"
                    />
                  ) : (
                    <textarea
                      value={newItemValue}
                      onChange={(e) => setNewItemValue(e.target.value)}
                      placeholder="Secure note content..."
                      className="w-full p-2 rounded-md border bg-background font-mono text-sm min-h-[80px] mb-2"
                    />
                  )}
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setShowAddItem(false);
                      setNewItemLabel('');
                      setNewItemValue('');
                    }}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAddItem} className="bg-blue-600 hover:bg-blue-700 text-white">
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Items list */}
              {isLoadingItems ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="md" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items in this vault</p>
                  <p className="text-xs mt-1">Click "Add Item" to store secrets</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={items.map(item => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {items.map((item) => (
                        <SortableItem key={item.id} id={item.id}>
                          <VaultItemRow
                            item={item}
                            isVisible={isItemVisible(item.id)}
                            isEditing={editingItemId === item.id}
                            editingLabel={editingItemLabel}
                            editingValue={editingItemValue}
                            onToggleVisibility={() => toggleItemVisibility(item.id)}
                            onCopy={() => copyToClipboard(item.value, item.label)}
                            onStartEdit={() => startEditingItem(item)}
                            onCancelEdit={cancelEditingItem}
                            onSaveEdit={() => handleUpdateItem(item.id)}
                            onDelete={() => handleDeleteItem(item.id)}
                            onEditingLabelChange={setEditingItemLabel}
                            onEditingValueChange={setEditingItemValue}
                            vaultColor={vaultDisplayColor}
                          />
                        </SortableItem>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        itemType="vault"
        itemTitle={vaultTitle}
        itemColor={vaultDisplayColor}
        onConfirm={handleConfirmDelete}
      />
    </Collapsible>
  );
};
