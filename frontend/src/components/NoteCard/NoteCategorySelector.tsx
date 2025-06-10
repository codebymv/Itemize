import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface NoteCategorySelectorProps {
  currentCategory: string;
  existingCategories: string[];
  isEditingCategory: boolean;
  showNewCategoryInput: boolean;
  newCategory: string;
  setNewCategory: (value: string) => void;
  setIsEditingCategory: (value: boolean) => void;
  setShowNewCategoryInput: (value: boolean) => void;
  handleEditCategory: (category: string) => void;
  handleAddCustomCategory: () => void;
}

export const NoteCategorySelector: React.FC<NoteCategorySelectorProps> = ({
  currentCategory,
  existingCategories,
  isEditingCategory,
  showNewCategoryInput,
  newCategory,
  setNewCategory,
  setIsEditingCategory,
  setShowNewCategoryInput,
  handleEditCategory,
  handleAddCustomCategory
}) => {
  return (
    <div className="mb-2 px-6">
              {isEditingCategory ? (
          <div className="mb-2">
          {showNewCategoryInput ? (
            <div className="flex items-center gap-1">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Enter new category"
                className="h-8"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCustomCategory();
                  }
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAddCustomCategory}
                className="h-8 w-8 p-0"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowNewCategoryInput(false);
                  setNewCategory('');
                }}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col space-y-1">
              <Select onValueChange={handleEditCategory} defaultValue={currentCategory || 'General'}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  {existingCategories.filter(cat => cat !== 'General').map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-blue-600">
                    + Add new category
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => setIsEditingCategory(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Badge 
          variant="outline" 
          className="cursor-pointer" 
          onClick={() => setIsEditingCategory(true)}
        >
          {currentCategory && currentCategory !== '' && currentCategory !== 'General' ? currentCategory : 'General'}
        </Badge>
      )}
    </div>
  );
}; 