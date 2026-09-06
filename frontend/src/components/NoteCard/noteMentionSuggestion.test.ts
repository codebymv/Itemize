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
  for (const name of ['focus', 'deleteRange', 'insertContentAt', 'run']) {
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

  it('asks the right source per sigil, scoping money documents to the bound client', async () => {
    vi.mocked(fetchContactSuggestions).mockResolvedValue([casey]);
    vi.mocked(fetchMoneySuggestions).mockResolvedValue([invoice]);
    await expect(mentionItems(context(), '@', 'cas')).resolves.toEqual([casey]);
    await expect(mentionItems(context({ contactId: 5 }), '$', 'inv')).resolves.toEqual([invoice]);
    expect(fetchContactSuggestions).toHaveBeenCalledWith('cas', 9);
    expect(fetchMoneySuggestions).toHaveBeenCalledWith('inv', 9, 5);
  });
});
