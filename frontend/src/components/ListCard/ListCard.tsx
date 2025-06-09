import React, { useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useListCardLogic } from '@/hooks/useListCardLogic';
import { ListCardProps } from '@/types';
import { ListCardHeader } from './ListCardHeader';
import { ListCategorySelector } from './ListCategorySelector';
import { ListItemRow } from './ListItemRow';
import { ListProgressBar } from './ListProgressBar';
import { ListItemAdd } from './ListItemAdd';
import { ListAISuggestionButton } from './ListAISuggestionButton';

const ListCard: React.FC<ListCardProps> = ({ 
  list, 
  onUpdate, 
  onDelete, 
  existingCategories 
}) => {
  const {
    // Collapsible
    isCollapsibleOpen, setIsCollapsibleOpen,
    
    // Title editing
    isEditing, setIsEditing, editTitle, setEditTitle, handleEditTitle,
    
    // List operations
    handleDeleteList,
    
    // Category editing
    isEditingCategory, setIsEditingCategory,
    showNewCategoryInput, setShowNewCategoryInput,
    newCategory, setNewCategory, 
    handleEditCategory, handleAddCustomCategory,
    
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
  } = useListCardLogic({ list, onUpdate, onDelete });

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

  return (
    <Collapsible
      open={isCollapsibleOpen}
      onOpenChange={setIsCollapsibleOpen}
      className="w-full mb-4"
    >
      <Card className="w-full border shadow-sm">
        <ListCardHeader
          title={list.title}
          color={list.color}
          isEditing={isEditing}
          editTitle={editTitle}
          isCollapsibleOpen={isCollapsibleOpen}
          setEditTitle={setEditTitle}
          setIsEditing={setIsEditing}
          handleEditTitle={handleEditTitle}
          handleDeleteList={handleDeleteList}
          titleEditRef={titleEditRef}
        />

        <ListCategorySelector
          currentCategory={list.type}
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

        <CollapsibleContent>
          <CardContent className="p-0">
            {totalItems > 0 && (
              <ListProgressBar
                progress={progress}
                totalItems={totalItems}
                completedItems={completedItems}
              />
            )}
            
            <div className="px-6 py-2 space-y-0.5">
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
              {list.items.length === 0 && (
                <div className="text-gray-400 text-sm py-2 italic">
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
