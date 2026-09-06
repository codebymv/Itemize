import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntitySuggestionList, type EntitySuggestionListHandle } from './EntitySuggestionList';
import type { EntitySuggestion } from '@/lib/entitySuggestions';

const rows: EntitySuggestion[] = [
  { kind: 'contact', id: 1, label: 'Casey Sanchez', detail: 'Sanchez Kitchens', initials: 'CS' },
  { kind: 'contact', id: 2, label: 'Casey Adler', detail: 'casey@adler.test', initials: 'CA' },
];

const key = (name: string) => new KeyboardEvent('keydown', { key: name });

describe('EntitySuggestionList', () => {
  it('moves with the arrows, wraps, and accepts with Enter or Tab', () => {
    const onSelect = vi.fn();
    const ref = createRef<EntitySuggestionListHandle>();
    render(<EntitySuggestionList ref={ref} items={rows} onSelect={onSelect} />);

    expect(screen.getByRole('option', { name: /Casey Sanchez/ })).toHaveAttribute('aria-selected', 'true');

    act(() => { expect(ref.current?.onKeyDown(key('ArrowDown'))).toBe(true); });
    expect(screen.getByRole('option', { name: /Casey Adler/ })).toHaveAttribute('aria-selected', 'true');

    act(() => { ref.current?.onKeyDown(key('ArrowDown')); });
    expect(screen.getByRole('option', { name: /Casey Sanchez/ })).toHaveAttribute('aria-selected', 'true');

    act(() => { ref.current?.onKeyDown(key('ArrowUp')); });
    act(() => { expect(ref.current?.onKeyDown(key('Tab'))).toBe(true); });
    expect(onSelect).toHaveBeenCalledWith(rows[1]);

    act(() => { ref.current?.onKeyDown(key('Enter')); });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('leaves unrelated keys and Escape to the editor', () => {
    const ref = createRef<EntitySuggestionListHandle>();
    render(<EntitySuggestionList ref={ref} items={rows} onSelect={vi.fn()} />);
    expect(ref.current?.onKeyDown(key('a'))).toBe(false);
    expect(ref.current?.onKeyDown(key('Escape'))).toBe(false);
  });

  it('selects on click and reports an empty result honestly', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<EntitySuggestionList items={rows} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('option', { name: /Casey Adler/ }));
    expect(onSelect).toHaveBeenCalledWith(rows[1]);

    rerender(<EntitySuggestionList items={[]} onSelect={onSelect} />);
    expect(screen.getByText('No matching clients')).toBeInTheDocument();
    rerender(<EntitySuggestionList items={[]} loading onSelect={onSelect} />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });
});
