import { describe, expect, it } from 'vitest';
import { formatNoteSuggestion } from './noteSuggestionText';

describe('formatNoteSuggestion', () => {
  it('adds a separating space for a continuation after a word', () => {
    expect(formatNoteSuggestion('Intuitive and seamless', 'The product should feel'))
      .toBe(' intuitive and seamless');
  });

  it('does not duplicate existing whitespace', () => {
    expect(formatNoteSuggestion('Effortless', 'The product should feel '))
      .toBe('effortless');
  });

  it('capitalizes a new sentence and separates it from prior punctuation', () => {
    expect(formatNoteSuggestion('next, invite the team.', 'The draft is ready.'))
      .toBe(' Next, invite the team.');
  });

  it('does not insert a space before punctuation', () => {
    expect(formatNoteSuggestion(', then publish it.', 'Review the draft'))
      .toBe(', then publish it.');
  });

  it('handles Unicode content without encoding it', () => {
    expect(formatNoteSuggestion('続けます', '計画を'))
      .toBe(' 続けます');
  });
});
