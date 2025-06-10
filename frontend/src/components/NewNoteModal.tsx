import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface NewNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNote: (title: string, category: string, position: { x: number; y: number }) => void;
  initialPosition: { x: number; y: number };
  existingCategories: string[];
}

export const NewNoteModal: React.FC<NewNoteModalProps> = ({ 
  isOpen, 
  onClose, 
  onCreateNote, 
  initialPosition,
  existingCategories
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);

  useEffect(() => {
    // Reset form when modal is reopened
    if (isOpen) {
      setTitle('');
      setCategory('');
      setNewCategory('');
      setIsAddingNewCategory(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      return;
    }
    
    const selectedCategory = isAddingNewCategory ? newCategory.trim() : category;
    
    if (!selectedCategory) {
      return;
    }
    
    onCreateNote(title.trim(), selectedCategory, initialPosition);
    onClose(); // Close modal after submission
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Note title */}
          <div>
            <Label htmlFor="noteTitle">Title</Label>
            <Input
              id="noteTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title"
              className="w-full mt-1"
              autoFocus
              required
            />
          </div>
          
          {/* Category selection */}
          {!isAddingNewCategory ? (
            <div>
              <Label htmlFor="noteCategory">Category</Label>
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
              <Label htmlFor="newNoteCategory">New Category</Label>
              <div className="flex space-x-2 mt-1">
                <Input
                  id="newNoteCategory"
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

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button 
              type="submit"
              disabled={!title.trim() || (!category && !newCategory.trim())}
            >
              Create Note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
