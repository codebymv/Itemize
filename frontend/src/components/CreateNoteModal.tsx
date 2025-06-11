import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNote: (title: string, category: string, color: string) => void;
  existingCategories: string[];
}

const CreateNoteModal: React.FC<CreateNoteModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateNote, 
  existingCategories 
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      return;
    }
    
    const selectedCategory = isAddingNewCategory ? newCategory.trim() : category;
    
    if (!selectedCategory) {
      return;
    }
    
    onCreateNote(title.trim(), selectedCategory, '#FFFFE0');
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setCategory('');
    setNewCategory('');
    setIsAddingNewCategory(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Note</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Note title */}
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title"
              className="mt-1"
              autoFocus
              required
            />
          </div>
          
          {/* Category selection */}
          {!isAddingNewCategory ? (
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1">
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
            <div>
              <Label htmlFor="newCategory">New Category</Label>
              <div className="flex space-x-2 mt-1">
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

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!title.trim() || (!category && !newCategory.trim())}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Note
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateNoteModal; 