import React, { useEffect } from 'react';
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
  existingCategories,
  isCollapsed,
  onToggleCollapsed,
  addCategory,
  updateCategory
}) => {
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

  // Calculate progress for the progress bar
  const totalItems = list.items.length;
  const completedItems = list.items.filter(item => item.completed).length;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const categoryColor = existingCategories.find(c => c.name === list.type)?.color_value;
  const listDisplayColor = list.color_value || categoryColor || '#808080'; // Default to grey if no color is set

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
          handleDeleteList={handleDeleteList}
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
                  items={list.items.map(item => item.id)}
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
                  No items yet. Add one below or use AI suggestions.
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
    </Collapsible>
  );
};

export default ListCard;
