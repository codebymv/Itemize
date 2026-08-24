import { describe, expect, it, vi } from 'vitest';
import { createAutocompleteStorage } from './autocompleteStorage';

describe('note autocomplete storage', () => {
  it('isolates every note editor instance', () => {
    const first = createAutocompleteStorage();
    const second = createAutocompleteStorage();
    const accept = vi.fn();

    first.suggestion = ' first suggestion';
    first.acceptSuggestion = accept;

    expect(second).not.toBe(first);
    expect(second.suggestion).toBeNull();
    expect(second.acceptSuggestion).toBeNull();
  });
});
