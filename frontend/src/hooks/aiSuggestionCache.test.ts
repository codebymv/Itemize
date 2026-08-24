import { describe, expect, it } from 'vitest';
import { buildSuggestionCacheKey, fingerprintSuggestionContext } from './aiSuggestionCache';

describe('AI suggestion cache keys', () => {
  it('handles Unicode content', () => {
    expect(() => fingerprintSuggestionContext('Café — 你好 👋')).not.toThrow();
  });

  it('does not expose note or list content in storage keys', () => {
    const secret = 'Confidential customer renewal plan';
    const key = buildSuggestionCacheKey('note', secret, 'meeting');
    expect(key).not.toContain(secret);
    expect(key).toMatch(/^ai-suggestions-v2-note-/);
  });

  it('separates different contexts and feature types', () => {
    expect(buildSuggestionCacheKey('note', 'alpha')).not.toBe(buildSuggestionCacheKey('note', 'beta'));
    expect(buildSuggestionCacheKey('note', 'alpha')).not.toBe(buildSuggestionCacheKey('list', 'alpha'));
  });
});
