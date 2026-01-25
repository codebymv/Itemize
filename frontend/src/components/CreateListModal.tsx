import React, { useState, useEffect } from 'react';
import { CheckSquare, Plus, ChevronsUpDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils"; // For conditional class names
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColorPicker } from "@/components/ui/color-picker";
import { Category } from '@/types';

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateList: (title: string, type: string, color: string) => void;
  existingCategories: Category[];
}

const CreateListModal: React.FC<CreateListModalProps> = ({ isOpen, onClose, onCreateList, existingCategories }) => {
  const [title, setTitle] = useState('');
  const [customType, setCustomType] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [color, setColor] = useState('#3B82F6'); // Default blue color

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
      onCreateList(title.trim(), listType, color); // Use selected color
      setTitle('');
      setCustomType('');
      setColor('#3B82F6'); // Reset color to default
    }
  };

  const handleClose = () => {
    setTitle('');
    setCustomType('');
    setColor('#3B82F6'); // Reset color to default
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-blue-500" />
            Create New List
          </DialogTitle>
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
            <Label htmlFor="customType" style={{ fontFamily: '"Raleway", sans-serif' }}>Category (Optional)</Label>
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
                      {!existingCategories.some(cat => cat.name === 'General') && (
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
                          <span
                            className="inline-block w-3 h-3 rounded-full border mr-2"
                            style={{ backgroundColor: '#808080' }}
                          />
                          General
                        </CommandItem>
                      )}
                      {existingCategories.map((category) => (
                        <CommandItem
                          key={category.name}
                          value={category.name}
                          onSelect={(currentValue) => {
                            setSelectedCategory(currentValue === selectedCategory ? "" : currentValue);
                            setCustomType(currentValue === customType ? "" : currentValue); // Also set customType here
                            setPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              customType === category.name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span
                            className="inline-block w-3 h-3 rounded-full border mr-2"
                            style={{ backgroundColor: category.color_value }}
                          />
                          {category.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {customType.trim() && !existingCategories.some(cat => cat.name === customType.trim()) && (
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
                        <span
                          className="inline-block w-3 h-3 rounded-full border mr-2"
                          style={{ backgroundColor: color }}
                        />
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

          <div>
            <Label htmlFor="color">Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <ColorPicker
                color={color}
                onChange={setColor}
                onSave={setColor}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 flex items-center gap-2"
                >
                  <span
                    className="inline-block w-4 h-4 rounded-full border"
                    style={{ backgroundColor: color }}
                  />
                  Choose Color
                </Button>
              </ColorPicker>
              <span className="text-xs text-gray-500">
                {customType.trim() && !existingCategories.some(cat => cat.name === customType.trim()) 
                  ? 'Color for new category' 
                  : 'List color'}
              </span>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!title.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
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
