import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategorySelector } from './CategorySelector';

vi.mock('@/components/ui/color-picker', () => ({
  ColorPicker: ({
    children,
    onChange,
    onSave,
  }: {
    children: ReactNode;
    onChange: (color: string) => void;
    onSave?: (color: string) => void;
  }) => (
    <div>
      {children}
      <button
        type="button"
        onClick={() => {
          onChange('#EF4444');
          onSave?.('#EF4444');
        }}
      >
        Choose red
      </button>
    </div>
  ),
}));

describe('CategorySelector', () => {
  it('persists a preset color once even when the picker emits preview and save', () => {
    const handleUpdateCategoryColor = vi.fn();

    render(
      <CategorySelector
        currentCategory="Planning"
        categoryColor="#3B82F6"
        existingCategories={[{ name: 'Planning', color_value: '#3B82F6' }]}
        isEditingCategory
        showNewCategoryInput={false}
        newCategory=""
        setNewCategory={vi.fn()}
        setIsEditingCategory={vi.fn()}
        setShowNewCategoryInput={vi.fn()}
        handleEditCategory={vi.fn()}
        handleAddCustomCategory={vi.fn()}
        handleUpdateCategoryColor={handleUpdateCategoryColor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose red' }));

    expect(handleUpdateCategoryColor).toHaveBeenCalledOnce();
    expect(handleUpdateCategoryColor).toHaveBeenCalledWith('Planning', '#EF4444');
  });
});
