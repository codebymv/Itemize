export const AI_SUGGEST_STORAGE_KEY = 'itemize-ai-suggest-enabled';

export const aiSuggestStorageKey = (userId?: string | null) => `${AI_SUGGEST_STORAGE_KEY}:${userId || 'guest'}`;
