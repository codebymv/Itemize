import {
  graphqlMutationRequest,
  graphqlPublicRequest,
} from './graphqlClient';

export type MarketingChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiSuggestionsResult = {
  suggestions: string[];
  cached?: boolean;
  error?: string;
};

export const fetchMarketingChatToken = async (): Promise<string | null> => {
  const data = await graphqlPublicRequest<
    { marketingChatToken: { token: string } },
    Record<string, never>
  >(
    `query MarketingChatToken {
      marketingChatToken {
        token
      }
    }`,
    {},
  );
  return data.marketingChatToken.token || null;
};

export const askMarketingChat = async (
  messages: MarketingChatMessage[],
  token: string,
): Promise<string> => {
  const data = await graphqlPublicRequest<
    { marketingChatAsk: { reply: string } },
    { input: { token: string; messages: MarketingChatMessage[] } }
  >(
    `mutation MarketingChatAsk($input: MarketingChatAskInput!) {
      marketingChatAsk(input: $input) {
        reply
      }
    }`,
    { input: { token, messages } },
  );
  return data.marketingChatAsk.reply;
};

export const fetchListSuggestions = async (
  listTitle: string,
  existingItems: string[],
  forceRefresh = false,
): Promise<AiSuggestionsResult> => {
  const data = await graphqlMutationRequest<
    { listSuggestions: AiSuggestionsResult },
    { input: { listTitle: string; existingItems: string[]; forceRefresh: boolean } }
  >(
    `mutation ListSuggestions($input: ListSuggestionsInput!) {
      listSuggestions(input: $input) {
        suggestions
        cached
        error
      }
    }`,
    { input: { listTitle, existingItems, forceRefresh } },
  );
  return data.listSuggestions;
};

export const fetchNoteSuggestions = async (
  content: string,
  forceRefresh = false,
): Promise<AiSuggestionsResult> => {
  const data = await graphqlMutationRequest<
    { noteSuggestions: AiSuggestionsResult },
    { input: { content: string; forceRefresh: boolean } }
  >(
    `mutation NoteSuggestions($input: NoteSuggestionsInput!) {
      noteSuggestions(input: $input) {
        suggestions
        cached
        error
      }
    }`,
    { input: { content, forceRefresh } },
  );
  return data.noteSuggestions;
};
