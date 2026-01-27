import React, { useState, useEffect } from 'react';
import { GitBranch } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';

interface LocalCategory {
  name: string;
  color_value?: string;
}

interface NewWireframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWireframe: (title: string, category: string, color: string, position: { x: number; y: number }) => void;
  initialPosition: { x: number; y: number };
  existingCategories: LocalCategory[];
  updateCategory?: (categoryName: string, newColor: string) => void;
}

export const NewWireframeModal: React.FC<NewWireframeModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateWireframe, 
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
    if (category) {
      return categoryColor;
    }
    return '#808080';
  };

  // Handle category color change
  const handleCategoryColorChange = (newColor: string) => {
    setCategoryColor(newColor);
    if (category !== 'General') {
      setColor(newColor);
    }
    
    // Update the existing category's color if it's an existing category
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
    
    onCreateWireframe(title.trim(), finalCategory, color, initialPosition);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-blue-600" />
            Add Wireframe
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Wireframe title */}
          <div className="space-y-2">
            <Label htmlFor="wireframeTitle">Title</Label>
            <Input
              id="wireframeTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter wireframe title"
              autoFocus
            />
          </div>
          
          {/* Category and Color selection row */}
          <div className="grid grid-cols-[1fr_60px] gap-4 items-start">
            {/* Category selection */}
            {!isAddingNewCategory ? (
              <div className="space-y-2">
                <Label htmlFor="wireframeCategory">Category</Label>
                <Select value={category} onValueChange={(value) => {
                  if (value === '__add_new__') {
                    setIsAddingNewCategory(true);
                    setCategory('');
                  } else {
                    setCategory(value);
                    const selectedCat = existingCategories.find(cat => cat.name === value);
                    const categoryColorValue = value === 'General' ? '#808080' : (selectedCat?.color_value || '#808080');
                    setCategoryColor(categoryColorValue);
                    if (value === 'General') {
                      setColor('#3B82F6');
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
                    {!existingCategories.some(cat => cat.name === 'General') && (
                      <SelectItem value="General">
                        <div className="flex items-center gap-2">
                          General
                        </div>
                      </SelectItem>
                    )}
                    {existingCategories.map((cat) => {
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
                <p className="text-xs text-gray-500">
                  {existingCategories.length === 0 
                    ? 'No categories yet. Leave empty to use "General" or create a new one.'
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
                <Label htmlFor="newWireframeCategory">New Category</Label>
                <div className="flex space-x-2">
                  <Input
                    id="newWireframeCategory"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Enter new category"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategory.trim()) {
                        setCategory(newCategory.trim());
                        setIsAddingNewCategory(false);
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
                        setColor(categoryColor);
                      }
                    }}
                    disabled={!newCategory.trim()}
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
              <Label>Color</Label>
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
                  aria-label="Change wireframe color"
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
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={!title.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Create Wireframe
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
