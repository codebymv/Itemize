import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AutocompleteExtension, createAutocompleteStorage } from './autocompleteStorage';

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

  it('handles Tab inside a focused editor when a suggestion is available', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: [StarterKit, AutocompleteExtension],
      content: '<p>Draft note</p>',
    });
    const accept = vi.fn();
    const storage = editor.storage.autocomplete as ReturnType<typeof createAutocompleteStorage>;
    storage.suggestion = ' with a useful continuation';
    storage.acceptSuggestion = accept;
    editor.commands.setTextSelection('end');
    editor.view.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(event);

    expect(accept).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(editor.isFocused).toBe(true);

    editor.destroy();
    element.remove();
  });
});
