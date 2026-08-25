import { fireEvent, render, screen } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ListItemAdd } from './ListItemAdd';

function renderListItemAdd(overrides: Partial<ComponentProps<typeof ListItemAdd>> = {}) {
  const props: ComponentProps<typeof ListItemAdd> = {
    newItemText: '',
    setNewItemText: vi.fn(),
    handleAddItem: vi.fn(),
    inputRef: createRef<HTMLInputElement>(),
    currentInputSuggestion: null,
    currentSuggestion: 'Map the customer onboarding journey',
    handleAcceptSuggestion: vi.fn(),
    handleGetSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    aiEnabled: true,
    isLoadingSuggestions: false,
    suggestionError: null,
    ...overrides,
  };

  render(<ListItemAdd {...props} />);
  return props;
}

describe('ListItemAdd', () => {
  it('accepts the displayed suggestion with Tab even before an inline prefix exists', () => {
    const props = renderListItemAdd();

    fireEvent.keyDown(screen.getByPlaceholderText('Add new item...'), { key: 'Tab' });

    expect(props.handleAcceptSuggestion).toHaveBeenCalledOnce();
  });

  it('accepts the displayed suggestion with ArrowRight at the end of the input', () => {
    const props = renderListItemAdd({ newItemText: 'Map' });
    const input = screen.getByPlaceholderText('Add new item...') as HTMLInputElement;
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(props.handleAcceptSuggestion).toHaveBeenCalledOnce();
  });

  it('keeps ordinary Tab navigation when no suggestion is available', () => {
    const props = renderListItemAdd({ currentSuggestion: null });
    const input = screen.getByPlaceholderText('Add new item...');

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(props.handleAcceptSuggestion).not.toHaveBeenCalled();
  });
});
