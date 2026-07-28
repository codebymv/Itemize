import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlPublicRequest,
} from './graphqlClient';
import {
  askMarketingChat,
  fetchListSuggestions,
  fetchMarketingChatToken,
  fetchNoteSuggestions,
} from './aiGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlPublicRequest: vi.fn(),
}));

describe('AI GraphQL client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a public marketing chat capability', async () => {
    vi.mocked(graphqlPublicRequest).mockResolvedValue({
      marketingChatToken: { token: 'capability' },
    });

    await expect(fetchMarketingChatToken()).resolves.toBe('capability');
    expect(graphqlPublicRequest).toHaveBeenCalledWith(
      expect.stringContaining('MarketingChatToken'),
      {},
    );
  });

  it('sends the capability and bounded conversation through GraphQL', async () => {
    const messages = [{ role: 'user' as const, content: 'What is Itemize?' }];
    vi.mocked(graphqlPublicRequest).mockResolvedValue({
      marketingChatAsk: { reply: 'A business operations workspace.' },
    });

    await expect(askMarketingChat(messages, 'capability')).resolves.toBe(
      'A business operations workspace.',
    );
    expect(graphqlPublicRequest).toHaveBeenCalledWith(
      expect.stringContaining('MarketingChatAsk'),
      { input: { token: 'capability', messages } },
    );
  });

  it('requests authenticated list suggestions with CSRF protection', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      listSuggestions: { suggestions: ['Butter'] },
    });

    await expect(fetchListSuggestions('Groceries', ['Bread'])).resolves.toEqual({
      suggestions: ['Butter'],
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('ListSuggestions'),
      { input: { listTitle: 'Groceries', existingItems: ['Bread'] } },
    );
  });

  it('requests authenticated note suggestions with CSRF protection', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      noteSuggestions: { suggestions: ['Follow up tomorrow.'] },
    });

    await expect(fetchNoteSuggestions('We should follow up')).resolves.toEqual({
      suggestions: ['Follow up tomorrow.'],
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('NoteSuggestions'),
      { input: { content: 'We should follow up' } },
    );
  });
});
