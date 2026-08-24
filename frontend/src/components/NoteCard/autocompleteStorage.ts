import { Extension } from '@tiptap/core';

export type AutocompleteStorage = {
  suggestion: string | null;
  triggerSuggestions: (() => void) | null;
  acceptSuggestion: (() => void) | null;
};

export const createAutocompleteStorage = (): AutocompleteStorage => ({
  suggestion: null,
  triggerSuggestions: null,
  acceptSuggestion: null,
});

export const AutocompleteExtension = Extension.create<Record<string, never>, AutocompleteStorage>({
  name: 'autocomplete',

  addStorage: createAutocompleteStorage,

  addKeyboardShortcuts() {
    const acceptCurrentSuggestion = () => {
      if (!this.editor.isFocused) return false;
      if (!this.storage.suggestion || !this.storage.acceptSuggestion) return false;
      this.storage.acceptSuggestion();
      return true;
    };

    return {
      Tab: acceptCurrentSuggestion,
      ArrowRight: acceptCurrentSuggestion,
      'Mod-Space': () => {
        this.storage.triggerSuggestions?.();
        return Boolean(this.storage.triggerSuggestions);
      },
    };
  },
});
