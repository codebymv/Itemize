import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useListCardLogic } from '@/hooks/useListCardLogic';
import { ListCardProps, Category } from '@/types';
import { ListCardHeader } from './ListCardHeader';
import { ListCategorySelector } from './ListCategorySelector';
import { ListItemRow } from './ListItemRow';
import { ListProgressBar } from './ListProgressBar';
import { ListItemAdd } from './ListItemAdd';
import { ListAISuggestionButton } from './ListAISuggestionButton';
import { DeleteListModal } from '../DeleteListModal';
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
} from '@dnd-kit/sortable';

const ListCard: React.FC<ListCardProps> = ({
  list,
  onUpdate,
  onDelete,
  onShare,
  existingCategories,
  isCollapsed,
  onToggleCollapsed,
  addCategory,
  updateCategory
}) => {
  // Memoized component to prevent unnecessary re-renders

  // State for delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const {
    // Collapsible
    isCollapsibleOpen, setIsCollapsibleOpen,

    // Title editing
    isEditing, setIsEditing, editTitle, setEditTitle, handleEditTitle,

    // List operations
    handleDeleteList,

    // Color
    handleSaveListColor, // New: function to save color
    isSavingColor,       // New: state for color saving status
    
    // Category editing
    isEditingCategory, setIsEditingCategory,
    showNewCategoryInput, setShowNewCategoryInput,
    newCategory, setNewCategory, 
    handleEditCategory, handleAddCustomCategory, handleUpdateCategoryColor,
    
    // Items
    newItemText, setNewItemText,
    editingItemId, editingItemText, setEditingItemText,
    handleAddItem, toggleItemCompleted, removeItem,
    startEditingItem, handleEditItem,
    
    // AI suggestions
    suggestions, isLoadingSuggestions,
    handleGetSuggestion, handleAcceptSuggestion,
    currentSuggestion, currentInputSuggestion, aiEnabled,
    
    // Refs
    titleEditRef, newItemInputRef
  } = useListCardLogic({ list, onUpdate, onDelete, isCollapsed, onToggleCollapsed, existingCategories, addCategory, updateCategory });

  // Handle sharing
  const handleShareList = () => {
    onShare(list.id);
  };

  // Handle delete confirmation
  const handleDeleteConfirmation = () => {
    setShowDeleteModal(true);
  };

  // Handle actual delete
  const handleConfirmDelete = async (listId: string) => {
    return await onDelete(listId);
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = list.items.findIndex((item) => item.id === active.id);
      const newIndex = list.items.findIndex((item) => item.id === over.id);

      const reorderedItems = arrayMove(list.items, oldIndex, newIndex);
      
      // Update the list with reordered items
      const updatedList = { ...list, items: reorderedItems };
      onUpdate(updatedList);
    }
  };

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

  // Memoize calculations to prevent unnecessary re-renders and flashing
  const { totalItems, completedItems, progress } = useMemo(() => {
    const total = list.items.length;
    const completed = list.items.filter(item => item.completed).length;
    const progressPercent = total > 0 ? (completed / total) * 100 : 0;
    return { totalItems: total, completedItems: completed, progress: progressPercent };
  }, [list.items]);

  const categoryColor = useMemo(() => 
    existingCategories.find(c => c.name === list.type)?.color_value,
    [existingCategories, list.type]
  );
  
  const listDisplayColor = useMemo(() => 
    list.color_value || categoryColor || '#808080',
    [list.color_value, categoryColor]
  );

  // Memoize the items array for SortableContext to prevent unnecessary re-renders during drag operations
  const sortableItemIds = useMemo(() => 
    list.items.map(item => item.id),
    [list.items]
  );

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
        }
      }}
      className="w-full"
      style={{ '--list-color': listDisplayColor } as React.CSSProperties}
    >
      <Card className="w-full border shadow-sm">
        <ListCardHeader
          title={list.title}
          listColor={list.color_value} // Use list.color_value
          isEditing={isEditing}
          editTitle={editTitle}
          isCollapsibleOpen={isCollapsibleOpen}
          setEditTitle={setEditTitle}
          setIsEditing={setIsEditing}
          handleEditTitle={handleEditTitle}
          handleDeleteList={handleDeleteConfirmation}
          handleShareList={handleShareList}
          titleEditRef={titleEditRef}
          onColorSave={handleSaveListColor} // New prop
          isSavingColor={isSavingColor}     // New prop
        />

        <ListCategorySelector
          currentCategory={list.type}
          categoryColor={categoryColor}
          itemColor={list.color_value}
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

        <CollapsibleContent>
          <CardContent className="p-0">
            {totalItems > 0 && (
              <ListProgressBar
                progress={progress}
                totalItems={totalItems}
                completedItems={completedItems}
                // color will be handled by CSS variable --list-color
              />
            )}
            
            <div className="px-6 py-2 space-y-0.5">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortableItemIds}
                  strategy={verticalListSortingStrategy}
                >
                  {list.items.map((item) => (
                    <ListItemRow
                      key={item.id}
                      item={item}
                      editingItemId={editingItemId}
                      editingItemText={editingItemText}
                      setEditingItemText={setEditingItemText}
                      toggleItemCompleted={toggleItemCompleted}
                      startEditingItem={startEditingItem}
                      handleEditItem={handleEditItem}
                      removeItem={removeItem}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {list.items.length === 0 && (
                <div className="text-gray-400 dark:text-gray-300 text-sm py-2 italic" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  No items yet.
                </div>
              )}
            </div>
            
            <ListItemAdd
              newItemText={newItemText}
              setNewItemText={setNewItemText}
              handleAddItem={handleAddItem}
              inputRef={newItemInputRef}
              currentInputSuggestion={currentInputSuggestion}
              currentSuggestion={currentSuggestion}
              handleAcceptSuggestion={handleAcceptSuggestion}
              handleGetSuggestion={handleGetSuggestion}
              aiEnabled={aiEnabled}
              isLoadingSuggestions={isLoadingSuggestions}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Delete confirmation modal */}
      <DeleteListModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        listId={list.id}
        listTitle={list.title}
        listColor={listDisplayColor}
        onDelete={handleConfirmDelete}
      />
    </Collapsible>
  );
};

// Export without memo to prevent shallow comparison issues with object references
export default ListCard;
