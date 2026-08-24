import { describe, expect, it } from 'vitest';
import { aiSuggestStorageKey } from './aiSuggestPreference';

describe('AI suggestion preference scope', () => {
  it('uses a separate preference key for every account', () => {
    expect(aiSuggestStorageKey('user-1')).not.toBe(aiSuggestStorageKey('user-2'));
    expect(aiSuggestStorageKey('user-1')).toBe('itemize-ai-suggest-enabled:user-1');
  });
});
