import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListCardLogic } from './useListCardLogic';
import type { List } from '@/types';

vi.mock('@/context/AISuggestContext', () => ({
  useAISuggest: () => ({ aiEnabled: false, setAiEnabled: vi.fn() }),
}));
vi.mock('@/hooks/use-ai-suggestions', () => ({
  useAISuggestions: () => ({
    currentSuggestion: null,
    suggestions: [],
    isLoading: false,
    error: null,
    debouncedFetchSuggestions: vi.fn(),
    forceRefreshSuggestions: vi.fn(),
    getNextSuggestion: vi.fn(),
    getSuggestionForInput: () => null,
    clearSuggestions: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const list: List = {
  id: 'list-7',
  title: 'Kitchen scope',
  type: 'General',
  items: [{ id: 'a', text: 'Demo', completed: false }],
  contact_id: null,
};

const renderLogic = (onUpdate: (next: List) => void, card: List = list) =>
  renderHook(() => useListCardLogic({
    list: card,
    onUpdate,
    onDelete: vi.fn(),
    updateCategory: vi.fn().mockResolvedValue(undefined),
  }));

describe('useListCardLogic client binding', () => {
  it('binds an unbound list to the first client mentioned in a new item', () => {
    const onUpdate = vi.fn();
    const { result } = renderLogic(onUpdate);
    act(() => result.current.setNewItemText('Call @[Casey Sanchez](contact:12) about tile'));
    act(() => result.current.handleAddItem());
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      contact_id: 12,
      contact_name: 'Casey Sanchez',
      items: [
        list.items[0],
        expect.objectContaining({ text: 'Call @[Casey Sanchez](contact:12) about tile', completed: false }),
      ],
    }));
  });

  it('binds through an edited item too, and leaves an existing binding alone', () => {
    const onUpdate = vi.fn();
    const { result } = renderLogic(onUpdate);
    act(() => result.current.startEditingItem(list.items[0]));
    act(() => result.current.setEditingItemText('Demo for @[Casey Sanchez](contact:12)'));
    act(() => result.current.handleEditItem());
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ contact_id: 12, contact_name: 'Casey Sanchez' }));

    const bound = vi.fn();
    const boundLogic = renderLogic(bound, { ...list, contact_id: 3, contact_name: 'Other' });
    act(() => boundLogic.result.current.setNewItemText('@[Casey Sanchez](contact:12)'));
    act(() => boundLogic.result.current.handleAddItem());
    expect(bound).toHaveBeenCalledWith(expect.objectContaining({ contact_id: 3, contact_name: 'Other' }));
  });
});
