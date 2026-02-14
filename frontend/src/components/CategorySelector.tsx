import React from 'react';
import { X, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ColorPicker } from '@/components/ui/color-picker';
import { Category } from '@/types';
import { UI_COLORS } from '@/constants/ui';

interface CategorySelectorProps {
  currentCategory: string;
  categoryColor?: string;
  itemColor?: string;
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

export const CategorySelector: React.FC<CategorySelectorProps> = ({
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
  const displayColor = displayCategory === 'General' ? UI_COLORS.neutralGray : (categoryColor || itemColor || UI_COLORS.neutralGray);
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
                aria-label="Save category"
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
                aria-label="Cancel category"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col space-y-2">
              <Select onValueChange={handleEditCategory} defaultValue={displayCategory}>
              <SelectTrigger className="h-8 font-raleway">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General" className="font-raleway">
                    <div className="flex items-center gap-2">
                      General
                    </div>
                  </SelectItem>
                  {existingCategories
                    .filter(cat => cat.name !== 'General')
                    .map((cat) => (
                      <SelectItem key={cat.name} value={cat.name} className="font-raleway">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full border"
                            style={{ backgroundColor: cat.color_value }}
                          />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  <SelectItem value="__custom__" className="text-blue-600 font-raleway">
                    + Add new category
                  </SelectItem>
                </SelectContent>
              </Select>

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
                className="self-start font-raleway"
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
          className="cursor-pointer hover:opacity-80 transition-opacity border-none font-raleway"
          style={{ 
            backgroundColor: displayColor,
            color: getContrastColor()
          }}
          onClick={() => setIsEditingCategory(true)}
          role="button"
        >
          {displayCategory}
        </Badge>
      )}
    </div>
  );
};
