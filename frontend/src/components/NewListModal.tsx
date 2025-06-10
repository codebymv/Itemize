import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
    
    if (!selectedCategory) {
      setError('Please select or add a category');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // Create a new list object
      const newList: Omit<List, 'id'> = {
        title,
        type: selectedCategory,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* List title */}
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
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
          
          {/* Category selection */}
          {!isAddingNewCategory ? (
            <div className="space-y-2">
              <label htmlFor="category" className="text-sm font-medium">
                Category
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {existingCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingNewCategory(true)}
                className="mt-2"
              >
                Add New Category
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="newCategory" className="text-sm font-medium">
                New Category
              </label>
              <div className="flex space-x-2">
                <Input
                  id="newCategory"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Enter new category"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddingNewCategory(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {/* Error message */}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          
          {/* Action buttons */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create List'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewListModal;
