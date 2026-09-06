import {
  collectMentionTokens,
  downgradeMentionTokens,
  stripMentionMarkup,
  stripMentionTokens,
} from './mention-tokens';

describe('mention tokens', () => {
  const text = 'Call @[Casey Sanchez](contact:12) about tile, cc @[North Roofing](contact:7)';

  it('collects every token with its id and label', () => {
    expect(collectMentionTokens(text)).toEqual([
      { contactId: 12, label: 'Casey Sanchez' },
      { contactId: 7, label: 'North Roofing' },
    ]);
    expect(collectMentionTokens('no mentions here')).toEqual([]);
  });

  it('keeps the label and drops the id for public readers', () => {
    expect(stripMentionTokens(text)).toBe(
      'Call @Casey Sanchez about tile, cc @North Roofing',
    );
  });

  it('downgrades only the tokens the owner may not reference', () => {
    expect(downgradeMentionTokens(text, new Set([12]))).toBe(
      'Call @[Casey Sanchez](contact:12) about tile, cc @North Roofing',
    );
  });

  it('ignores malformed tokens rather than guessing', () => {
    const malformed = '@[](contact:1) @[x](contact:abc) @[y](deal:3) @[z](contact:1)';
    expect(collectMentionTokens(malformed)).toEqual([{ contactId: 1, label: 'z' }]);
  });

  it('reduces rich-text mention nodes to their visible text', () => {
    const html = '<p>Walk-through with <span class="mention" data-type="mention" data-id="12" data-label="Casey Sanchez">@Casey Sanchez</span> today</p>';
    expect(stripMentionMarkup(html)).toBe('<p>Walk-through with @Casey Sanchez today</p>');
  });
});
