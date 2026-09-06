import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContactSuggestions, fetchMoneySuggestions } from '@/lib/entitySuggestions';
import { MentionInput, type MentionContext } from './MentionInput';

vi.mock('@/lib/entitySuggestions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/entitySuggestions')>()),
  fetchContactSuggestions: vi.fn(),
  fetchMoneySuggestions: vi.fn(),
}));

const casey = { kind: 'contact' as const, id: 12, label: 'Casey Sanchez', detail: 'Sanchez Kitchens', initials: 'CS' };
const invoice = { kind: 'invoice' as const, id: 4, label: 'INV-0012', detail: '$1,250.50', initials: 'IN', status: 'sent' };

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
  beforeEach(() => {
    vi.mocked(fetchContactSuggestions).mockReset();
    vi.mocked(fetchMoneySuggestions).mockReset();
  });

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

  it('opens money documents on $ when the surface offers it, scoped to the bound client', async () => {
    vi.mocked(fetchMoneySuggestions).mockResolvedValue([invoice]);
    render(<Harness mention={{ organizationId: 9, canBind: true, contactId: 12, triggers: ['@', '$'] }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, 'Chase $INV');
    expect(await screen.findByRole('option', { name: /INV-0012/ })).toBeInTheDocument();
    expect(fetchMoneySuggestions).toHaveBeenCalledWith('INV', 9, 12);
    fireEvent.keyDown(input, { key: 'Tab' });
    await waitFor(() => expect(input.value).toBe('Chase $[INV-0012](invoice:4) '));
  });

  it('opens the action list on /, runs the picked action, and removes the typed command', async () => {
    const run = vi.fn();
    render(<Harness mention={{
      organizationId: 9,
      canBind: true,
      triggers: ['@', '$', '/'],
      actions: { available: ['turn-into-estimate', 'share', 'mention-client'], run },
    }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, 'Tile /sha');
    const list = await screen.findByRole('listbox', { name: 'Actions' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['SharePublic link for this card']);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalledWith('share');
    await waitFor(() => expect(input.value).toBe('Tile '));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('turns /mention into an open @ list instead of running anything', async () => {
    vi.mocked(fetchContactSuggestions).mockResolvedValue([casey]);
    const run = vi.fn();
    render(<Harness mention={{
      organizationId: 9,
      canBind: true,
      triggers: ['@', '$', '/'],
      actions: { available: ['share', 'mention-client', 'reference-document'], run },
    }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, '/men');
    fireEvent.click(await screen.findByRole('option', { name: /Mention a client/ }));
    await waitFor(() => expect(input.value).toBe('@'));
    expect(run).not.toHaveBeenCalled();
    expect(await screen.findByRole('option', { name: /Casey Sanchez/ })).toBeInTheDocument();
    expect(fetchContactSuggestions).toHaveBeenCalledWith('', 9);
  });

  it('shows nothing for a slash that matches no action, and hides door actions whose sigil is not offered', async () => {
    render(<Harness mention={{
      organizationId: 9,
      canBind: true,
      triggers: ['@', '/'],
      actions: { available: ['share', 'reference-document'], run: vi.fn() },
    }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, '/usr/bin');
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    typeAt(input, '/');
    await screen.findByRole('listbox', { name: 'Actions' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['SharePublic link for this card']);
  });

  it('lists frames on #, moves the card on Enter, and removes the typed text', async () => {
    const moveTo = vi.fn();
    render(<Harness mention={{
      organizationId: 9,
      canBind: true,
      triggers: ['@', '#'],
      frames: {
        frames: [
          { id: 1, title: 'Sanchez kitchen', color_value: '#3B82F6' },
          { id: 2, title: 'Spring campaign', color_value: '#10B981' },
        ],
        currentFrameId: 1,
        moveTo,
      },
    }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, 'Tile #');
    await screen.findByRole('listbox', { name: 'Frames' });
    // The current frame is listed last so Enter always moves somewhere new.
    expect(screen.getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Spring campaign', 'Sanchez kitchenCurrent frame']);

    typeAt(input, 'Tile #spr');
    await screen.findByRole('option', { name: /Spring campaign/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(moveTo).toHaveBeenCalledWith(2);
    await waitFor(() => expect(input.value).toBe('Tile '));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps #42 as text but explains a bare # when there are no frames', async () => {
    render(<Harness mention={{
      organizationId: 9,
      canBind: true,
      triggers: ['#'],
      frames: { frames: [], currentFrameId: null, moveTo: vi.fn() },
    }} />);
    const input = screen.getByLabelText('Add new item') as HTMLInputElement;

    typeAt(input, 'Ticket #42');
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    typeAt(input, 'Ticket #');
    expect(await screen.findByText('No frames yet — add one from the Add menu')).toBeInTheDocument();
  });

  it('ignores $ on a surface that only offers clients', () => {
    render(<Harness mention={{ organizationId: 9, canBind: true }} />);
    typeAt(screen.getByLabelText('Add new item') as HTMLInputElement, 'costs $5');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(fetchMoneySuggestions).not.toHaveBeenCalled();
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
