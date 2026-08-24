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
