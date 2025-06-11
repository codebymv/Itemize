import React, { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';
import { List, ListItem } from '@/types';
import { createList } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface NewListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onListCreated: (list: List) => void;
  existingCategories: string[];
  position?: { x: number; y: number };
}

export const NewListModal: React.FC<NewListModalProps> = ({
  isOpen,
  onClose,
  onListCreated,
  existingCategories,
  position
}) => {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [color, setColor] = useState('#3B82F6'); // Default blue color
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      // Create a new list object
      const newList: Omit<List, 'id'> = {
        title,
        type: finalCategory,
        color_value: color,
        items: [],
        // Add position if provided
        ...(position && { position_x: position.x, position_y: position.y }),
      };
      
      // Call API to create the list with token
      const createdList = await createList(newList, token);
      
      // Notify parent component
      onListCreated(createdList);
      
      // Reset form
      setTitle('');
      setCategory('');
      setNewCategory('');
      setIsAddingNewCategory(false);
      setColor('#3B82F6');
      
      // Close modal
      onClose();
    } catch (err) {
      console.error('Failed to create list:', err);
      setError('Failed to create list. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                <label htmlFor="category" className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Category
                </label>
                <Select value={category} onValueChange={(value) => {
                  if (value === '__add_new__') {
                    setIsAddingNewCategory(true);
                    setCategory(''); // Clear category when switching to add new mode
                  } else {
                    setCategory(value);
                    setError(''); // Clear error when selection is made
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Always include General as an option */}
                    {!existingCategories.includes('General') && (
                      <SelectItem value="General">General</SelectItem>
                    )}
                    {existingCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
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
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="newCategory" className="text-sm font-medium" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  New Category
                </label>
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
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white" style={{ fontFamily: '"Raleway", sans-serif' }}>
              {isLoading ? 'Creating...' : 'Create List'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewListModal;
