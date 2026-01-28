import React, { useEffect, useMemo, useState } from 'react';
import { StickyNote, CheckSquare, Palette, GitBranch, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';

interface LocalCategory {
  name: string;
  color_value?: string;
}

type ItemType = 'note' | 'list' | 'whiteboard' | 'wireframe' | 'vault';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: ItemType;
  onCreate: (title: string, category: string, color: string, position: { x: number; y: number }) => Promise<unknown> | void;
  existingCategories: LocalCategory[];
  position?: { x: number; y: number };
  updateCategory?: (categoryName: string, newColor: string) => void;
}

const itemConfig = {
  note: {
    label: 'Note',
    icon: StickyNote,
    titlePlaceholder: 'Enter note title',
    defaultColor: '#3B82F6',
    requireResult: false,
    showValidationError: false
  },
  list: {
    label: 'List',
    icon: CheckSquare,
    titlePlaceholder: 'Enter list title',
    defaultColor: '#3B82F6',
    requireResult: true,
    showValidationError: true
  },
  whiteboard: {
    label: 'Whiteboard',
    icon: Palette,
    titlePlaceholder: 'Enter whiteboard title',
    defaultColor: '#3B82F6',
    requireResult: false,
    showValidationError: false
  },
  wireframe: {
    label: 'Wireframe',
    icon: GitBranch,
    titlePlaceholder: 'Enter wireframe title',
    defaultColor: '#3B82F6',
    requireResult: false,
    showValidationError: false
  },
  vault: {
    label: 'Vault',
    icon: KeyRound,
    titlePlaceholder: 'Enter vault title',
    defaultColor: '#3B82F6',
    requireResult: false,
    showValidationError: false
  }
};

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  isOpen,
  onClose,
  itemType,
  onCreate,
  existingCategories,
  position,
  updateCategory
}) => {
  const config = itemConfig[itemType];
  const Icon = config.icon;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [color, setColor] = useState(config.defaultColor);
  const [categoryColor, setCategoryColor] = useState('#808080');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setCategory('');
      setNewCategory('');
      setIsAddingNewCategory(false);
      setColor(config.defaultColor);
      setCategoryColor('#808080');
      setError('');
      setIsLoading(false);
    }
  }, [isOpen, config.defaultColor]);

  const availableCategories = useMemo(() => {
    const hasGeneral = existingCategories.some(cat => cat.name === 'General');
    return hasGeneral ? existingCategories : [{ name: 'General', color_value: '#808080' }, ...existingCategories];
  }, [existingCategories]);

  const getSelectedCategoryColor = () => {
    if (isAddingNewCategory) {
      return categoryColor;
    }
    if (category) {
      return categoryColor;
    }
    return '#808080';
  };

  const handleCategoryColorChange = (newColor: string) => {
    setCategoryColor(newColor);
    if (category !== 'General') {
      setColor(newColor);
    }
    if (category && !isAddingNewCategory && updateCategory) {
      updateCategory(category, newColor);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      if (config.showValidationError) {
        setError('Please enter a title');
      }
      return;
    }

    const selectedCategory = isAddingNewCategory ? newCategory.trim() : category;
    const finalCategory = selectedCategory || 'General';

    if (config.showValidationError && !finalCategory.trim()) {
      setError('Please select or create a category');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await onCreate(
        title.trim(),
        finalCategory,
        color,
        position || { x: 0, y: 0 }
      );

      if (config.requireResult && !result) {
        setError(`Failed to create ${config.label.toLowerCase()}. Please try again.`);
        return;
      }

      onClose();
    } catch (err) {
      setError(`Failed to create ${config.label.toLowerCase()}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-blue-600" />
            {`Add ${config.label}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${itemType}Title`} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Title
            </Label>
            <Input
              id={`${itemType}Title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={config.titlePlaceholder}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[1fr_60px] gap-4 items-start">
            {!isAddingNewCategory ? (
              <div className="space-y-2">
                <Label htmlFor={`${itemType}Category`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Category
                </Label>
                <Select
                  value={category}
                  onValueChange={(value) => {
                    if (value === '__add_new__') {
                      setIsAddingNewCategory(true);
                      setCategory('');
                      return;
                    }

                    setCategory(value);
                    const selectedCat = existingCategories.find(cat => cat.name === value);
                    const categoryColorValue = value === 'General' ? '#808080' : (selectedCat?.color_value || '#808080');
                    setCategoryColor(categoryColorValue);
                    setError('');

                    if (value === 'General') {
                      setColor(config.defaultColor);
                    } else {
                      setColor(categoryColorValue);
                    }
                  }}
                >
                  <SelectTrigger>
                    {category ? (
                      <div className="flex items-center gap-2">
                        {category !== 'General' && (
                          <span
                            className="inline-block w-3 h-3 rounded-full border"
                            style={{ backgroundColor: getSelectedCategoryColor() }}
                          />
                        )}
                        {category}
                      </div>
                    ) : (
                      <SelectValue placeholder="Select a category" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((cat) => {
                      const displayColor = (category === cat.name && !isAddingNewCategory)
                        ? categoryColor
                        : (cat.color_value || '#808080');

                      return (
                        <SelectItem key={cat.name} value={cat.name}>
                          <div className="flex items-center gap-2">
                            {cat.name !== 'General' && (
                              <span
                                className="inline-block w-3 h-3 rounded-full border"
                                style={{ backgroundColor: displayColor }}
                              />
                            )}
                            {cat.name}
                          </div>
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="__add_new__" className="text-blue-600">
                      + Add new category
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  {existingCategories.length === 0
                    ? 'No categories yet. Leave empty to use "General" or create a new one from the dropdown.'
                    : 'Select a category or leave empty to use "General".'}
                </p>

                {category && category !== 'General' && (
                  <div className="mt-2">
                    <ColorPicker
                      color={getSelectedCategoryColor()}
                      onChange={handleCategoryColorChange}
                      onSave={handleCategoryColorChange}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 flex items-center gap-2"
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border"
                          style={{ backgroundColor: getSelectedCategoryColor() }}
                        />
                        Category Color
                      </Button>
                    </ColorPicker>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`new${config.label}Category`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                  New Category
                </Label>
                <div className="flex space-x-2">
                  <Input
                    id={`new${config.label}Category`}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Enter new category"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategory.trim()) {
                        setCategory(newCategory.trim());
                        setIsAddingNewCategory(false);
                        setColor(categoryColor);
                        setError('');
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
                        setColor(categoryColor);
                        setError('');
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

                {newCategory.trim() && (
                  <div className="mt-2">
                    <ColorPicker
                      color={categoryColor}
                      onChange={handleCategoryColorChange}
                      onSave={handleCategoryColorChange}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 flex items-center gap-2"
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border"
                          style={{ backgroundColor: categoryColor }}
                        />
                        Category Color
                      </Button>
                    </ColorPicker>
                  </div>
                )}
              </div>
            )}

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
                  aria-label={`Change ${config.label.toLowerCase()} color`}
                >
                  <span
                    className="inline-block w-6 h-6 rounded-full border border-gray-300"
                    style={{ backgroundColor: color }}
                  />
                </Button>
              </ColorPicker>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm" style={{ fontFamily: '"Raleway", sans-serif' }}>
              {error}
            </p>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {isLoading ? `Creating ${config.label}...` : `Create ${config.label}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
