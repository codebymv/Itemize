
import React, { useState, useEffect } from 'react';
import { List, Plus, ChevronsUpDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils"; // For conditional class names
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateList: (title: string, type: string, color: string) => void;
  existingCategories: string[];
}

const CreateListModal: React.FC<CreateListModalProps> = ({ isOpen, onClose, onCreateList, existingCategories }) => {
  const [title, setTitle] = useState('');
  const [customType, setCustomType] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    // If a category is selected from the dropdown, update customType
    // If user types a new category, customType will be updated directly by CommandInput
    if (selectedCategory) {
      setCustomType(selectedCategory);
    }
  }, [selectedCategory]);

  // Reset selectedCategory when customType is cleared (e.g. on modal close)
  useEffect(() => {
    if (!customType) {
      setSelectedCategory('');
    }
  }, [customType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      const listType = customType.trim() || 'General';
      onCreateList(title.trim(), listType, '#3B82F6'); // Default blue color
      setTitle('');
      setCustomType('');
    }
  };

  const handleClose = () => {
    setTitle('');
    setCustomType('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="title">List Title</Label>
            <Input
              id="title"
              placeholder="Enter list title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="customType">Category (Optional)</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-between mt-1 font-normal"
                >
                  {customType || "Select category or type new..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput 
                    placeholder="Search or create category..." 
                    value={customType} 
                    onValueChange={(currentValue) => {
                      setCustomType(currentValue);
                      setSelectedCategory(''); // Clear selection if typing new
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {customType.trim() ? `Create "${customType}"` : "No category found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {/* Always show General as first option */}
                      {!existingCategories.includes('General') && (
                        <CommandItem
                          key="General"
                          value="General"
                          onSelect={(currentValue) => {
                            setSelectedCategory(currentValue === selectedCategory ? "" : currentValue);
                            setCustomType(currentValue === customType ? "" : currentValue);
                            setPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              customType === "General" ? "opacity-100" : "opacity-0"
                            )}
                          />
                          General
                        </CommandItem>
                      )}
                      {existingCategories.map((category) => (
                        <CommandItem
                          key={category}
                          value={category}
                          onSelect={(currentValue) => {
                            setSelectedCategory(currentValue === selectedCategory ? "" : currentValue);
                            setCustomType(currentValue === customType ? "" : currentValue); // Also set customType here
                            setPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              customType === category ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {category}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {customType.trim() && !existingCategories.includes(customType.trim()) && (
                      <CommandItem
                        key={customType.trim()}
                        value={customType.trim()}
                        onSelect={() => {
                          setSelectedCategory(customType.trim());
                          // customType is already set by CommandInput
                          setPopoverOpen(false);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create "{customType.trim()}"
                      </CommandItem>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-gray-500 mt-1">
              Select an existing category, type a new one, or leave empty for "General".
            </p>
            {existingCategories.length === 0 && (
              <p className="text-xs text-blue-600 mt-1">
                No categories available yet. You can create your first category or use "General".
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create List
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateListModal;
