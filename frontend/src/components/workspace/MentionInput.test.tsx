import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContactSuggestions } from '@/lib/entitySuggestions';
import { MentionInput, type MentionContext } from './MentionInput';

vi.mock('@/lib/entitySuggestions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/entitySuggestions')>()),
  fetchContactSuggestions: vi.fn(),
}));

const casey = { kind: 'contact' as const, id: 12, label: 'Casey Sanchez', detail: 'Sanchez Kitchens', initials: 'CS' };

function Harness({ mention, onEnter }: { mention: MentionContext; onEnter?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <MentionInput
      aria-label="Add new item"
      value={value}
      onValueChange={setValue}
      mention={mention}
      onKeyDown={(event) => event.key === 'Enter' && onEnter?.()}
    />
  );
}

const typeAt = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
};

describe('MentionInput', () => {
  beforeEach(() => vi.mocked(fetchContactSuggestions).mockReset());

  it('opens the client list on @, inserts a token on Enter, and keeps Enter from reaching the caller', async () => {
    vi.mocked(fetchContactSuggestions).mockResolvedValue([casey]);
    const onEnter = vi.fn();
    render(<Harness mention={{ organizationId: 9, canBind: true }} onEnter={onEnter} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, 'Call @Cas');
    expect(await screen.findByRole('option', { name: /Casey Sanchez/ })).toBeInTheDocument();
    expect(fetchContactSuggestions).toHaveBeenCalledWith('Cas', 9);

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(input.value).toBe('Call @[Casey Sanchez](contact:12) '));
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and leaves the typed text in place', async () => {
    vi.mocked(fetchContactSuggestions).mockResolvedValue([casey]);
    render(<Harness mention={{ organizationId: 9, canBind: true }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;
    typeAt(input, '@Ca');
    await screen.findByRole('listbox');
    act(() => { fireEvent.keyDown(input, { key: 'Escape' }); });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input.value).toBe('@Ca');
  });

  it('offers only the upgrade row without the Contacts capability', async () => {
    const onUpgrade = vi.fn();
    render(<Harness mention={{ organizationId: 9, canBind: false, onUpgrade }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;
    typeAt(input, '@');
    fireEvent.click(await screen.findByRole('option', { name: /Link clients with Solo/ }));
    expect(onUpgrade).toHaveBeenCalled();
    expect(fetchContactSuggestions).not.toHaveBeenCalled();
    expect(input.value).toBe('@');
  });

  it('stays a plain input without a mention context', () => {
    function Plain() {
      const [value, setValue] = useState('');
      return <MentionInput aria-label="Plain" value={value} onValueChange={setValue} />;
    }
    render(<Plain />);
    typeAt(screen.getByLabelText('Plain') as HTMLInputElement, '@anything');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
