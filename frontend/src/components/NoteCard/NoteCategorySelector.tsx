import React from 'react';
import { X, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ColorPicker } from '@/components/ui/color-picker';
import { Category } from '@/types';

interface NoteCategorySelectorProps {
  currentCategory: string;
  categoryColor?: string;
  itemColor?: string; // The note's own color as fallback
  existingCategories: Category[];
  isEditingCategory: boolean;
  showNewCategoryInput: boolean;
  newCategory: string;
  setNewCategory: (value: string) => void;
  setIsEditingCategory: (value: boolean) => void;
  setShowNewCategoryInput: (value: boolean) => void;
  handleEditCategory: (category: string) => void;
  handleAddCustomCategory: () => void;
  handleUpdateCategoryColor: (categoryName: string, newColor: string) => void;
}

export const NoteCategorySelector: React.FC<NoteCategorySelectorProps> = ({
  currentCategory,
  categoryColor,
  itemColor,
  existingCategories,
  isEditingCategory,
  showNewCategoryInput,
  newCategory,
  setNewCategory,
  setIsEditingCategory,
  setShowNewCategoryInput,
  handleEditCategory,
  handleAddCustomCategory,
  handleUpdateCategoryColor
}) => {
  const displayCategory = currentCategory && currentCategory !== '' ? currentCategory : 'General';
  // For General category, always use grey. For other categories, use category color if available, otherwise fall back to item color, then default
  const displayColor = displayCategory === 'General' ? '#808080' : (categoryColor || itemColor || '#808080');
  
  // Always use white text for consistency with other badges
  const getContrastColor = () => '#ffffff';

  return (
    <div className="mb-2 px-6 flex items-center gap-2">
      {isEditingCategory ? (
        <div className="mb-2 w-full">
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
            <div className="flex flex-col space-y-2">
              <Select onValueChange={handleEditCategory} defaultValue={displayCategory}>
                <SelectTrigger className="h-8" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {/* General category first */}
                  <SelectItem value="General" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    <div className="flex items-center gap-2">
                      General
                    </div>
                  </SelectItem>
                  {/* Other categories */}
                  {existingCategories
                    .filter(cat => cat.name !== 'General')
                    .map((cat) => (
                      <SelectItem key={cat.name} value={cat.name} style={{ fontFamily: '"Raleway", sans-serif' }}>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full border"
                            style={{ backgroundColor: cat.color_value }}
                          />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  <SelectItem value="__custom__" className="text-blue-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    + Add new category
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {/* Category Color Picker - only show for existing categories that are not General */}
              {displayCategory !== '__custom__' && displayCategory !== 'General' && (
                <div className="flex items-center gap-2 ml-2">
                  <ColorPicker
                    color={displayColor}
                    onChange={(newColor) => handleUpdateCategoryColor(displayCategory, newColor)}
                    onSave={(newColor) => handleUpdateCategoryColor(displayCategory, newColor)}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 flex items-center gap-2"
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border"
                        style={{ backgroundColor: displayColor }}
                      />
                      Category Color
                    </Button>
                  </ColorPicker>
                </div>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                style={{ fontFamily: '"Raleway", sans-serif' }}
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
          className="cursor-pointer hover:opacity-80 transition-opacity border-none"
          style={{ 
            fontFamily: '"Raleway", sans-serif', 
            backgroundColor: displayColor,
            color: getContrastColor()
          }}
          onClick={() => setIsEditingCategory(true)}
        >
          {displayCategory}
        </Badge>
      )}
    </div>
  );
};