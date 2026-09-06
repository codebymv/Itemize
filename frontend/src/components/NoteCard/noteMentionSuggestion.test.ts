import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContactSuggestions, upgradeSuggestion } from '@/lib/entitySuggestions';
import { acceptMention, mentionItems, type MentionContext } from './noteMentionSuggestion';

vi.mock('@tiptap/react', () => ({ ReactRenderer: vi.fn() }));
vi.mock('@/lib/entitySuggestions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/entitySuggestions')>()),
  fetchContactSuggestions: vi.fn(),
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

describe('noteMentionSuggestion', () => {
  beforeEach(() => vi.mocked(fetchContactSuggestions).mockReset());

  it('inserts a pill from the id and binds an unbound card in the same gesture', () => {
    const ctx = context();
    const { editor, calls } = chainSpy();
    acceptMention(ctx, { editor, range: { from: 3, to: 8 }, props: casey });

    expect(calls).toEqual([
      ['focus', []],
      ['insertContentAt', [
        { from: 3, to: 8 },
        [
          { type: 'mention', attrs: { id: '5', label: 'Casey Sanchez' } },
          { type: 'text', text: ' ' },
        ],
      ]],
      ['run', []],
    ]);
    expect(ctx.onLinkContact).toHaveBeenCalledWith(5, 'Casey Sanchez');
  });

  it('leaves an existing binding alone and only inserts the reference', () => {
    const ctx = context({ contactId: 2 });
    const { editor } = chainSpy();
    acceptMention(ctx, { editor, range: { from: 0, to: 1 }, props: casey });
    expect(ctx.onLinkContact).not.toHaveBeenCalled();
  });

  it('offers only the upgrade row without the Contacts capability and routes it to upgrade', async () => {
    const ctx = context({ canBind: false });
    await expect(mentionItems(ctx, 'cas')).resolves.toEqual([upgradeSuggestion]);
    expect(fetchContactSuggestions).not.toHaveBeenCalled();

    const { editor, calls } = chainSpy();
    acceptMention(ctx, { editor, range: { from: 0, to: 4 }, props: upgradeSuggestion });
    expect(calls.map(([name]) => name)).toEqual(['focus', 'deleteRange', 'run']);
    expect(ctx.onUpgrade).toHaveBeenCalled();
    expect(ctx.onLinkContact).not.toHaveBeenCalled();
  });

  it('asks the client source with the query when binding is allowed', async () => {
    vi.mocked(fetchContactSuggestions).mockResolvedValue([casey]);
    await expect(mentionItems(context(), 'cas')).resolves.toEqual([casey]);
    expect(fetchContactSuggestions).toHaveBeenCalledWith('cas', 9);
  });
});
