const SENTENCE_END = /[.!?][\s"')\]]*$/;
const NO_LEADING_SPACE = /^[,.;:!?)}\]]/;

export const formatNoteSuggestion = (suggestion: string, context: string): string => {
  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion) return '';

  const contextWithoutTrailingSpace = context.trimEnd();
  const startsSentence = contextWithoutTrailingSpace.length === 0
    || SENTENCE_END.test(contextWithoutTrailingSpace);

  const casedSuggestion = startsSentence
    ? trimmedSuggestion.charAt(0).toUpperCase() + trimmedSuggestion.slice(1)
    : trimmedSuggestion.charAt(0).toLowerCase() + trimmedSuggestion.slice(1);

  const contextAlreadySeparates = context.length === 0 || /\s$/.test(context);
  const suggestionIsPunctuation = NO_LEADING_SPACE.test(casedSuggestion);
  const separator = contextAlreadySeparates || suggestionIsPunctuation ? '' : ' ';

  return `${separator}${casedSuggestion}`;
};
