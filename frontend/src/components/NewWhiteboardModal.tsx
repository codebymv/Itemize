import React, { useState, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';

interface NewWhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWhiteboard: (title: string, category: string, color: string, position: { x: number; y: number }) => void;
  initialPosition: { x: number; y: number };
  existingCategories: string[];
}

export const NewWhiteboardModal: React.FC<NewWhiteboardModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateWhiteboard, 
  initialPosition,
  existingCategories
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [color, setColor] = useState('#3B82F6'); // Default blue color

  useEffect(() => {
    // Reset form when modal is reopened
    if (isOpen) {
      setTitle('');
      setCategory('');
      setNewCategory('');
      setIsAddingNewCategory(false);
      setColor('#3B82F6');
    }
  }, [isOpen]);

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
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
            <Palette className="h-5 w-5 text-slate-500" />
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