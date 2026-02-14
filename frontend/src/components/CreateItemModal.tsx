import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StickyNote, CheckSquare, Palette, GitBranch, KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ColorPicker } from './ui/color-picker';
import { UI_COLORS, UI_LABELS } from '@/constants/ui';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from './ui/form';
import { createItemFormSchema, type CreateItemFormValues } from '@/lib/formSchemas';

interface LocalCategory {
  name: string;
  color_value?: string;
}

type ItemType = 'note' | 'list' | 'whiteboard' | 'wireframe' | 'vault';

interface CreateItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false
  },
  list: {
    label: 'List',
    icon: CheckSquare,
    titlePlaceholder: 'Enter list title',
    defaultColor: UI_COLORS.brandBlue,
    requireResult: true,
    showValidationError: true
  },
  whiteboard: {
    label: 'Whiteboard',
    icon: Palette,
    titlePlaceholder: 'Enter whiteboard title',
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false
  },
  wireframe: {
    label: 'Wireframe',
    icon: GitBranch,
    titlePlaceholder: 'Enter wireframe title',
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false
  },
  vault: {
    label: 'Vault',
    icon: KeyRound,
    titlePlaceholder: 'Enter vault title',
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false
  }
};

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  open,
  onOpenChange,
  itemType,
  onCreate,
  existingCategories,
  position,
  updateCategory
}) => {
  const config = itemConfig[itemType];
  const Icon = config.icon;

  const form = useForm<CreateItemFormValues>({
    resolver: zodResolver(createItemFormSchema),
    defaultValues: {
      title: '',
      category: '',
      newCategory: '',
      isAddingNewCategory: false,
      color: config.defaultColor,
      categoryColor: UI_COLORS.neutralGray,
    },
  });

  const title = form.watch('title') || '';
  const category = form.watch('category') || '';
  const newCategory = form.watch('newCategory') || '';
  const isAddingNewCategory = form.watch('isAddingNewCategory');
  const color = form.watch('color') || config.defaultColor;
  const categoryColor = form.watch('categoryColor') || UI_COLORS.neutralGray;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      form.reset({
        title: '',
        category: '',
        newCategory: '',
        isAddingNewCategory: false,
        color: config.defaultColor,
        categoryColor: UI_COLORS.neutralGray,
      });
      setError('');
      setIsLoading(false);
    }
  }, [open, config.defaultColor, form]);

  const availableCategories = useMemo(() => {
    const hasGeneral = existingCategories.some(cat => cat.name === 'General');
    return hasGeneral ? existingCategories : [{ name: 'General', color_value: UI_COLORS.neutralGray }, ...existingCategories];
  }, [existingCategories]);

  const getSelectedCategoryColor = () => {
    if (isAddingNewCategory) {
      return categoryColor;
    }
    if (category) {
      return categoryColor;
    }
    return UI_COLORS.neutralGray;
  };

  const handleCategoryColorChange = (newColor: string) => {
    form.setValue('categoryColor', newColor, { shouldDirty: true });
    if (category !== 'General') {
      form.setValue('color', newColor, { shouldDirty: true });
    }
    if (category && !isAddingNewCategory && updateCategory) {
      updateCategory(category, newColor);
    }
  };

  const handleSubmit = async (values: CreateItemFormValues) => {
    const selectedCategory = values.isAddingNewCategory
      ? values.newCategory?.trim()
      : values.category?.trim();
    const finalCategory = selectedCategory || 'General';

    setIsLoading(true);
    setError('');

    try {
      const result = await onCreate(
        values.title.trim(),
        finalCategory,
        values.color || config.defaultColor,
        position || { x: 0, y: 0 }
      );

      if (config.requireResult && !result) {
        setError(`Failed to create ${config.label.toLowerCase()}. Please try again.`);
        return;
      }

      onOpenChange(false);
    } catch (err) {
      setError(`Failed to create ${config.label.toLowerCase()}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setError('');
          onOpenChange(false);
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="space-y-2">
                <FormLabel className="font-raleway">Title</FormLabel>
                  <FormControl>
                    <Input
                      id={`${itemType}Title`}
                      placeholder={config.titlePlaceholder}
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  {config.showValidationError ? <FormMessage /> : null}
                </FormItem>
              )}
            />

          <div className="grid grid-cols-[1fr_60px] gap-4 items-start">
            {!isAddingNewCategory ? (
              <div className="space-y-2">
                <Label htmlFor={`${itemType}Category`} className="font-raleway">
                  Category
                </Label>
                <Select
                  value={category}
                  onValueChange={(value) => {
                    if (value === '__add_new__') {
                      form.setValue('isAddingNewCategory', true);
                      form.setValue('category', '');
                      form.setValue('newCategory', '');
                      return;
                    }

                    form.setValue('category', value, { shouldDirty: true });
                    form.setValue('isAddingNewCategory', false);
                    const selectedCat = existingCategories.find(cat => cat.name === value);
                    const categoryColorValue = value === 'General' ? UI_COLORS.neutralGray : (selectedCat?.color_value || UI_COLORS.neutralGray);
                    form.setValue('categoryColor', categoryColorValue, { shouldDirty: true });
                    setError('');

                    if (value === 'General') {
                      form.setValue('color', config.defaultColor, { shouldDirty: true });
                    } else {
                      form.setValue('color', categoryColorValue, { shouldDirty: true });
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
                <p className="text-xs text-gray-500 font-raleway">
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
                <Label htmlFor={`new${config.label}Category`} className="font-raleway">
                  New Category
                </Label>
                <div className="flex space-x-2">
                  <Input
                    id={`new${config.label}Category`}
                    value={newCategory}
                    onChange={(e) => form.setValue('newCategory', e.target.value, { shouldDirty: true })}
                    placeholder="Enter new category"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategory.trim()) {
                        form.setValue('category', newCategory.trim(), { shouldDirty: true });
                        form.setValue('isAddingNewCategory', false);
                        form.setValue('color', categoryColor, { shouldDirty: true });
                        setError('');
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (newCategory.trim()) {
                        form.setValue('category', newCategory.trim(), { shouldDirty: true });
                        form.setValue('isAddingNewCategory', false);
                        form.setValue('color', categoryColor, { shouldDirty: true });
                        setError('');
                      }
                    }}
                    disabled={!newCategory.trim()}
                    className="font-raleway"
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      form.setValue('isAddingNewCategory', false);
                      form.setValue('newCategory', '');
                    }}
                    className="font-raleway"
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
              <Label className="font-raleway">Color</Label>
              <ColorPicker
                color={color}
                onChange={(newColor) => form.setValue('color', newColor, { shouldDirty: true })}
                onSave={(newColor) => form.setValue('color', newColor, { shouldDirty: true })}
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
            <p className="text-red-500 text-sm font-raleway">
              {error}
            </p>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-raleway">
              {UI_LABELS.cancel}
            </Button>
<Button
              type="submit"
              disabled={!title.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-raleway"
            >
              {isLoading ? `Creating ${config.label}...` : `${UI_LABELS.create} ${config.label}`}
            </Button>
          </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
