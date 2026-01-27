import React, { useState, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';
import { Category } from '@/types';

interface LocalCategory {
  name: string;
  color_value?: string;
}

interface NewWhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWhiteboard: (title: string, category: string, color: string, position: { x: number; y: number }) => void;
  initialPosition: { x: number; y: number };
  existingCategories: LocalCategory[];
  updateCategory?: (categoryName: string, newColor: string) => void;
}

export const NewWhiteboardModal: React.FC<NewWhiteboardModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateWhiteboard, 
  initialPosition,
  existingCategories,
  updateCategory
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [color, setColor] = useState('#3B82F6'); // Default blue color
  const [categoryColor, setCategoryColor] = useState('#808080'); // Default category color

  useEffect(() => {
    // Reset form when modal is reopened
    if (isOpen) {
      setTitle('');
      setCategory('');
      setNewCategory('');
      setIsAddingNewCategory(false);
      setColor('#3B82F6');
      setCategoryColor('#808080');
    }
  }, [isOpen]);

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
    // Only synchronize whiteboard color with category color for non-General categories
    // General category whiteboards should maintain their default blue color
    if (category !== 'General') {
      setColor(newColor);
    }
    
    // Update the existing category's color and propagate to canvas items if it's an existing category
    if (category && !isAddingNewCategory && updateCategory) {
      updateCategory(category, newColor);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      return;
    }
    
    const selectedCategory = isAddingNewCategory ? newCategory.trim() : category;
    
    // Default to "General" if no category is selected
    const finalCategory = selectedCategory || 'General';
    
    onCreateWhiteboard(title.trim(), finalCategory, color, initialPosition);
    onClose(); // Close modal after submission
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-blue-600" />
            Add Whiteboard
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Whiteboard title */}
          <div className="space-y-2">
            <Label htmlFor="whiteboardTitle" style={{ fontFamily: '"Raleway", sans-serif' }}>Title</Label>
            <Input
              id="whiteboardTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter whiteboard title"
              autoFocus
            />
          </div>
          
          {/* Category and Color selection row */}
          <div className="grid grid-cols-[1fr_60px] gap-4 items-start">
            {/* Category selection */}
            {!isAddingNewCategory ? (
              <div className="space-y-2">
                <Label htmlFor="whiteboardCategory" style={{ fontFamily: '"Raleway", sans-serif' }}>Category</Label>
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
                    // Only synchronize whiteboard color with category color for non-General categories
                    // General category whiteboards should maintain their default blue color
                    if (value === 'General') {
                      setColor('#3B82F6'); // Default blue for General category whiteboards
                    } else {
                      setColor(categoryColorValue);
                    }
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
                    : 'Select a category or leave empty to use "General".'
                  }
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
                <Label htmlFor="newWhiteboardCategory" style={{ fontFamily: '"Raleway", sans-serif' }}>New Category</Label>
                <div className="flex space-x-2">
                  <Input
                    id="newWhiteboardCategory"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Enter new category"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategory.trim()) {
                        setCategory(newCategory.trim());
                        setIsAddingNewCategory(false);
                        // Synchronize whiteboard color with category color for new category (non-General)
                        setColor(categoryColor);
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
                        // Synchronize whiteboard color with category color for new category (non-General)
                        setColor(categoryColor);
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
              <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Color</Label>
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
                  aria-label="Change whiteboard color"
                >
                  <span
                    className="inline-block w-6 h-6 rounded-full border border-gray-300"
                    style={{ backgroundColor: color }}
                  />
                </Button>
              </ColorPicker>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={!title.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              Create Whiteboard
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};