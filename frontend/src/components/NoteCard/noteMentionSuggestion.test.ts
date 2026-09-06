import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchContactSuggestions,
  fetchMoneySuggestions,
  upgradeSuggestion,
} from '@/lib/entitySuggestions';
import { acceptMention, mentionItems, nodeNameFor, type MentionContext } from './noteMentionSuggestion';

vi.mock('@tiptap/react', () => ({ ReactRenderer: vi.fn() }));
vi.mock('@/lib/entitySuggestions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/entitySuggestions')>()),
  fetchContactSuggestions: vi.fn(),
  fetchMoneySuggestions: vi.fn(),
}));

const chainSpy = () => {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ['focus', 'deleteRange', 'insertContent', 'insertContentAt', 'run']) {
    chain[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return chain;
    };
  }
  return { editor: { chain: () => chain }, calls };
};

const context = (values: Partial<MentionContext> = {}): MentionContext => ({
  organizationId: 9,
  canBind: true,
  contactId: null,
  onLinkContact: vi.fn(),
  onUpgrade: vi.fn(),
  ...values,
});

const casey = { kind: 'contact' as const, id: 5, label: 'Casey Sanchez', detail: null, initials: 'CS' };
const invoice = { kind: 'invoice' as const, id: 4, label: 'INV-0012', detail: null, initials: 'IN', status: 'sent' };

describe('noteMentionSuggestion', () => {
  beforeEach(() => {
    vi.mocked(fetchContactSuggestions).mockReset();
    vi.mocked(fetchMoneySuggestions).mockReset();
  });

  it('maps sigils to node names', () => {
    expect(nodeNameFor('@')).toBe('mention');
    expect(nodeNameFor('$')).toBe('moneyMention');
  });

  it('inserts a client pill from the id and binds an unbound card in the same gesture', () => {
    const ctx = context();
    const { editor, calls } = chainSpy();
    acceptMention(ctx, '@', { editor, range: { from: 3, to: 8 }, props: casey });

    expect(calls).toEqual([
      ['focus', []],
      ['insertContentAt', [
        { from: 3, to: 8 },
        [
          { type: 'mention', attrs: { id: '5', label: 'Casey Sanchez', entity: 'contact' } },
          { type: 'text', text: ' ' },
        ],
      ]],
      ['run', []],
    ]);
    expect(ctx.onLinkContact).toHaveBeenCalledWith(5, 'Casey Sanchez');
  });

  it('inserts a money pill with its entity and never binds', () => {
    const ctx = context();
    const { editor, calls } = chainSpy();
    acceptMention(ctx, '$', { editor, range: { from: 0, to: 4 }, props: invoice });
    expect(calls[1]).toEqual(['insertContentAt', [
      { from: 0, to: 4 },
      [
        { type: 'moneyMention', attrs: { id: '4', label: 'INV-0012', entity: 'invoice' } },
        { type: 'text', text: ' ' },
      ],
    ]]);
    expect(ctx.onLinkContact).not.toHaveBeenCalled();
  });

  it('leaves an existing binding alone and only inserts the reference', () => {
    const ctx = context({ contactId: 2 });
    const { editor } = chainSpy();
    acceptMention(ctx, '@', { editor, range: { from: 0, to: 1 }, props: casey });
    expect(ctx.onLinkContact).not.toHaveBeenCalled();
  });

  it('offers only the upgrade row without the Contacts capability and routes it to upgrade', async () => {
    const ctx = context({ canBind: false });
    await expect(mentionItems(ctx, '@', 'cas')).resolves.toEqual([upgradeSuggestion]);
    await expect(mentionItems(ctx, '$', 'inv')).resolves.toEqual([upgradeSuggestion]);
    expect(fetchContactSuggestions).not.toHaveBeenCalled();
    expect(fetchMoneySuggestions).not.toHaveBeenCalled();

    const { editor, calls } = chainSpy();
    acceptMention(ctx, '@', { editor, range: { from: 0, to: 4 }, props: upgradeSuggestion });
    expect(calls.map(([name]) => name)).toEqual(['focus', 'deleteRange', 'run']);
    expect(ctx.onUpgrade).toHaveBeenCalled();
  });

  it('lists the card actions on / without needing the Contacts capability', async () => {
    const run = vi.fn();
    const ctx = context({ canBind: false, actions: { available: ['share', 'new-note'], run } });
    await expect(mentionItems(ctx, '/', 'sh')).resolves.toEqual([
      { kind: 'action', id: 3, label: 'Share', detail: 'Public link for this card', initials: '/', action: 'share' },
    ]);
    await expect(mentionItems(context({ actions: undefined }), '/', '')).resolves.toEqual([]);
  });

  it('runs an action after removing the typed command, and opens @ for the mention door', () => {
    const run = vi.fn();
    const ctx = context({ actions: { available: ['share', 'mention-client'], run } });
    const share = { kind: 'action' as const, id: 3, label: 'Share', detail: null, initials: '/', action: 'share' as const };
    const mention = { ...share, id: 4, label: 'Mention a client', action: 'mention-client' as const };

    const first = chainSpy();
    acceptMention(ctx, '/', { editor: first.editor, range: { from: 2, to: 6 }, props: share });
    expect(first.calls).toEqual([['focus', []], ['deleteRange', [{ from: 2, to: 6 }]], ['run', []]]);
    expect(run).toHaveBeenCalledWith('share');

    const second = chainSpy();
    acceptMention(ctx, '/', { editor: second.editor, range: { from: 2, to: 6 }, props: mention });
    expect(second.calls).toEqual([
      ['focus', []], ['deleteRange', [{ from: 2, to: 6 }]], ['insertContent', ['@']], ['run', []],
    ]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lists frames on # with the current one last and moves the note on accept', async () => {
    const moveTo = vi.fn();
    const ctx = context({
      canBind: false,
      frames: {
        frames: [
          { id: 1, title: 'Sanchez kitchen', color_value: '#3B82F6' },
          { id: 2, title: 'Spring campaign', color_value: '#10B981' },
        ],
        currentFrameId: 2,
        moveTo,
      },
    });
    await expect(mentionItems(ctx, '#', '')).resolves.toEqual([
      expect.objectContaining({ kind: 'frame', id: 1, label: 'Sanchez kitchen', detail: null }),
      expect.objectContaining({ kind: 'frame', id: 2, detail: 'Current frame' }),
    ]);
    await expect(mentionItems(context({ frames: undefined }), '#', '')).resolves.toEqual([]);

    const { editor, calls } = chainSpy();
    acceptMention(ctx, '#', {
      editor,
      range: { from: 4, to: 8 },
      props: { kind: 'frame', id: 1, label: 'Sanchez kitchen', detail: null, initials: '#' },
    });
    expect(calls).toEqual([['focus', []], ['deleteRange', [{ from: 4, to: 8 }]], ['run', []]]);
    expect(moveTo).toHaveBeenCalledWith(1);
  });

  it('asks the right source per sigil, scoping money documents to the bound client', async () => {
    vi.mocked(fetchContactSuggestions).mockResolvedValue([casey]);
    vi.mocked(fetchMoneySuggestions).mockResolvedValue([invoice]);
    await expect(mentionItems(context(), '@', 'cas')).resolves.toEqual([casey]);
    await expect(mentionItems(context({ contactId: 5 }), '$', 'inv')).resolves.toEqual([invoice]);
    expect(fetchContactSuggestions).toHaveBeenCalledWith('cas', 9);
    expect(fetchMoneySuggestions).toHaveBeenCalledWith('inv', 9, 5);
  });
});
