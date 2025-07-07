import React, { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';
import { List, ListItem, Category } from '@/types';
import { createList } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { MIN_LIST_WIDTH } from '@/constants/dimensions';

// Add buffer to prevent any shrinking below optimal size
const OPTIMAL_LIST_WIDTH = MIN_LIST_WIDTH + 50; // 50px buffer above minimum

interface LocalCategory {
  name: string;
  color_value?: string;
}

interface NewListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateList: (title: string, type: string, color: string, position: { x: number; y: number }) => Promise<List | undefined>;
  existingCategories: LocalCategory[];
  position?: { x: number; y: number };
  updateCategory?: (categoryName: string, newColor: string) => void;
}

export const NewListModal: React.FC<NewListModalProps> = ({
  isOpen,
  onClose,
  onCreateList,
  existingCategories,
  position,
  updateCategory
}) => {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [color, setColor] = useState('#3B82F6'); // Default blue color
  const [categoryColor, setCategoryColor] = useState('#808080'); // Default category color
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Get the selected category's current color
  const getSelectedCategoryColor = () => {
    if (isAddingNewCategory) {
      return categoryColor;
    }
    // If a category is selected, use the current categoryColor state (which reflects picker changes)
    if (category) {
      return categoryColor;
    }
    return '#808080';
  };

  // Handle category color change
  const handleCategoryColorChange = (newColor: string) => {
    setCategoryColor(newColor);
    // Only synchronize list color with category color for non-General categories
    // General category lists should maintain their default blue color
    if (category !== 'General') {
      setColor(newColor);
    }
    
    // Update the existing category's color and propagate to canvas items if it's an existing category
    if (category && !isAddingNewCategory && updateCategory) {
      updateCategory(category, newColor);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any existing error first
    setError('');
    
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    
    const selectedCategory = isAddingNewCategory ? newCategory.trim() : category;
    
    // Default to "General" if no category is selected
    const finalCategory = selectedCategory || 'General';
    
    setIsLoading(true);
    setError('');
    
    try {
      // Determine the appropriate color for the list
      // If creating a new category, use the selected color for the category
      // Otherwise, use the selected color for the list
      const isCreatingNewCategory = isAddingNewCategory && newCategory.trim() && 
        !existingCategories.some(cat => cat.name === newCategory.trim());
      
      // Create a new list object
      const newList: Omit<List, 'id'> = {
        title,
        type: finalCategory,
        color_value: color,
        items: [],
        width: MIN_LIST_WIDTH, // Set initial width to minimum width
        // Add position if provided
        ...(position && { position_x: position.x, position_y: position.y }),
        // If creating a new category, also include category color info
        ...(isCreatingNewCategory && { category_color: categoryColor }),
      };
      
      // Call the parent's create function
      const result = await onCreateList(title, finalCategory, color, position || { x: 0, y: 0 });
      
      // Only reset and close if successful
      if (result) {
        setTitle('');
        setCategory('');
        setNewCategory('');
        setIsAddingNewCategory(false);
        const defaultColor = '#808080';
        setColor(defaultColor);
        setCategoryColor('#808080');
        setError(''); // Clear any existing error
        
              // Clear error and close modal
      setError('');
      onClose();
      } else {
        setError('Failed to create list. Please try again.');
      }
    } catch (err) {
      console.error('Failed to create list:', err);
      setError('Failed to create list. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setError('');
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
            <CheckSquare className="h-5 w-5 text-slate-500" />
            Add List
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* List title */}
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
              Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter list title"
              autoFocus
            />
          </div>
          
          {/* Category and Color selection row */}
          <div className="grid grid-cols-[1fr_60px] gap-4 items-start">
            {/* Category selection */}
            {!isAddingNewCategory ? (
              <div className="space-y-2">
                <label htmlFor="category" className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>Category</label>
                <Select value={category} onValueChange={(value) => {
                  if (value === '__add_new__') {
                    setIsAddingNewCategory(true);
                    setCategory(''); // Clear category when switching to add new mode
                  } else {
                    setCategory(value);
                    // Update category color when selecting existing category
                    const selectedCat = existingCategories.find(cat => cat.name === value);
                    const categoryColorValue = value === 'General' ? '#808080' : (selectedCat?.color_value || '#808080');
                    setCategoryColor(categoryColorValue);
                    // Only use grey for General category badge, keep blue for list color
                    if (value === 'General') {
                      setColor('#3B82F6'); // Keep blue for General category lists
                      setCategoryColor('#808080'); // Grey for badge only
                    } else {
                      setColor(categoryColorValue);
                    }
                    setError(''); // Clear error when selection is made
                  }
                }}>
                  <SelectTrigger>
                    {category ? (
                      <div className="flex items-center gap-2">
                        {category !== 'General' && (
                          <span
                            className="inline-block w-3 h-3 rounded-full border"
                            style={{ backgroundColor: getSelectedCategoryColor() }}
                          />
                        )}
                        {category}
                      </div>
                    ) : (
                      <SelectValue placeholder="Select a category" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {/* Always include General as an option */}
                    {!existingCategories.some(cat => cat.name === 'General') && (
                      <SelectItem value="General">
                        <div className="flex items-center gap-2">
                          General
                        </div>
                      </SelectItem>
                    )}
                    {existingCategories.map((cat) => {
                      // Use current categoryColor if this is the selected category, otherwise use original color
                      const displayColor = (category === cat.name && !isAddingNewCategory) 
                        ? categoryColor 
                        : (cat.color_value || '#808080');
                      
                      return (
                        <SelectItem key={cat.name} value={cat.name}>
                          <div className="flex items-center gap-2">
                            {cat.name !== 'General' && (
                              <span
                                className="inline-block w-3 h-3 rounded-full border"
                                style={{ backgroundColor: displayColor }}
                              />
                            )}
                            {cat.name}
                          </div>
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="__add_new__" className="text-blue-600">
                      + Add new category
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  {existingCategories.length === 0 
                    ? 'No categories yet. Leave empty to use "General" or create a new one from the dropdown.'
                    : 'Select a category or leave empty to use "General".'}
                </p>
                
                {/* Category Color Picker - only show when a category is selected and it's not General */}
                {category && category !== 'General' && (
                  <div className="mt-2">
                    <ColorPicker
                      color={getSelectedCategoryColor()}
                      onChange={handleCategoryColorChange}
                      onSave={handleCategoryColorChange}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 flex items-center gap-2"
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border"
                          style={{ backgroundColor: getSelectedCategoryColor() }}
                        />
                        Category Color
                      </Button>
                    </ColorPicker>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="newCategory" className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>New Category</label>
                <div className="flex space-x-2">
                  <Input
                    id="newCategory"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Enter new category"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategory.trim()) {
                        setCategory(newCategory.trim());
                        setIsAddingNewCategory(false);
                        // Synchronize list color with category color for new category (non-General)
                        setColor(categoryColor);
                        setError(''); // Clear error when adding new category
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (newCategory.trim()) {
                        setCategory(newCategory.trim());
                        setIsAddingNewCategory(false);
                        // Synchronize list color with category color for new category (non-General)
                        setColor(categoryColor);
                        setError(''); // Clear error when adding new category
                      }
                    }}
                    disabled={!newCategory.trim()}
                    style={{ fontFamily: '"Raleway", sans-serif' }}
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddingNewCategory(false);
                      setNewCategory('');
                    }}
                    style={{ fontFamily: '"Raleway", sans-serif' }}
                  >
                    Cancel
                  </Button>
                </div>
                
                {/* Category Color Picker for new category */}
                {newCategory.trim() && (
                  <div className="mt-2">
                    <ColorPicker
                      color={categoryColor}
                      onChange={handleCategoryColorChange}
                      onSave={handleCategoryColorChange}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 flex items-center gap-2"
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border"
                          style={{ backgroundColor: categoryColor }}
                        />
                        Category Color
                      </Button>
                    </ColorPicker>
                  </div>
                )}
              </div>
            )}

            {/* Color selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>Color</label>
              <ColorPicker
                color={color}
                onChange={setColor}
                onSave={setColor}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 p-0 rounded-full"
                  aria-label="Change list color"
                >
                  <span
                    className="inline-block w-6 h-6 rounded-full border border-gray-300"
                    style={{ backgroundColor: color }}
                  />
                </Button>
              </ColorPicker>
            </div>
          </div>


          
          {/* Error message */}
          {error && <p className="text-red-500 text-sm" style={{ fontFamily: '"Raleway", sans-serif' }}>{error}</p>}
          
          {/* Action buttons */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !title.trim()} 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {isLoading ? 'Creating...' : 'Create List'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewListModal;
