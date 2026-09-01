import { useCallback, useState } from 'react';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

type CategoryAction = 'update' | 'add' | 'color';

interface UseCardCategoryManagementOptions {
  onUpdateCategory: (category: string) => Promise<void> | void;
  onAddCustomCategory?: (category: string) => Promise<void> | void;
  onUpdateCategoryColor?: (categoryName: string, newColor: string) => Promise<void> | void;
  onError?: (error: unknown, action: CategoryAction) => void;
  onEmptyCategory?: () => void;
}

export const useCardCategoryManagement = ({
  onUpdateCategory,
  onAddCustomCategory,
  onUpdateCategoryColor,
  onError,
  onEmptyCategory
}: UseCardCategoryManagementOptions) => {
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const { pending: isSavingCategory, run } = useSingleFlightAction();

  const handleEditCategory = useCallback(async (category: string) => {
    if (category === '__custom__') {
      setShowNewCategoryInput(true);
      return;
    }

    await run(async () => {
      try {
        await onUpdateCategory(category);
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
      } catch (error) {
        onError?.(error, 'update');
      }
    });
  }, [onError, onUpdateCategory, run]);

  const handleAddCustomCategory = useCallback(async () => {
    const trimmedCategory = newCategory.trim();
    if (!trimmedCategory) {
      onEmptyCategory?.();
      return;
    }

    if (!onAddCustomCategory) {
      return;
    }

    await run(async () => {
      try {
        await onAddCustomCategory(trimmedCategory);
        setIsEditingCategory(false);
        setShowNewCategoryInput(false);
        setNewCategory('');
      } catch (error) {
        onError?.(error, 'add');
      }
    });
  }, [newCategory, onAddCustomCategory, onEmptyCategory, onError, run]);

  const handleUpdateCategoryColor = useCallback(async (categoryName: string, newColor: string) => {
    if (!onUpdateCategoryColor) return;

    await run(async () => {
      try {
        await onUpdateCategoryColor(categoryName, newColor);
      } catch (error) {
        onError?.(error, 'color');
      }
    });
  }, [onError, onUpdateCategoryColor, run]);

  return {
    isEditingCategory,
    setIsEditingCategory,
    showNewCategoryInput,
    setShowNewCategoryInput,
    newCategory,
    setNewCategory,
    isSavingCategory,
    handleEditCategory,
    handleAddCustomCategory,
    handleUpdateCategoryColor
  };
};
