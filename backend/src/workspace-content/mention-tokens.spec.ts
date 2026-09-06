import {
  collectMentionMarkup,
  collectMentionTokens,
  downgradeMentionMarkup,
  downgradeMentionTokens,
  stripMentionMarkup,
  stripMentionTokens,
  uniqueReferences,
} from './mention-tokens';

describe('mention tokens', () => {
  const text =
    'Call @[Casey Sanchez](contact:12) about $[INV-0012](invoice:4), cc @[North Roofing](contact:7) and $[EST-3](estimate:9)';

  it('collects every token with its entity, id, and label', () => {
    expect(collectMentionTokens(text)).toEqual([
      { entityType: 'contact', entityId: 12, label: 'Casey Sanchez' },
      { entityType: 'invoice', entityId: 4, label: 'INV-0012' },
      { entityType: 'contact', entityId: 7, label: 'North Roofing' },
      { entityType: 'estimate', entityId: 9, label: 'EST-3' },
    ]);
    expect(collectMentionTokens('no mentions here')).toEqual([]);
  });

  it('keeps the sigil and label and drops the id for public readers', () => {
    expect(stripMentionTokens(text)).toBe(
      'Call @Casey Sanchez about $INV-0012, cc @North Roofing and $EST-3',
    );
  });

  it('downgrades only the tokens the owner may not reference', () => {
    expect(downgradeMentionTokens(text, new Set(['contact:12', 'estimate:9']))).toBe(
      'Call @[Casey Sanchez](contact:12) about $INV-0012, cc @North Roofing and $[EST-3](estimate:9)',
    );
  });

  it('ignores malformed or mismatched tokens rather than guessing', () => {
    const malformed = '@[](contact:1) @[x](contact:abc) @[y](deal:3) $[z](contact:2) @[w](invoice:5) @[z](contact:1)';
    expect(collectMentionTokens(malformed)).toEqual([{ entityType: 'contact', entityId: 1, label: 'z' }]);
    expect(stripMentionTokens('$[z](contact:2)')).toBe('$[z](contact:2)');
  });

  const html =
    '<p>Walk-through with <span class="mention" data-type="mention" data-entity="contact" data-id="12" data-label="Casey Sanchez">@Casey Sanchez</span> for <span data-type="moneyMention" data-entity="invoice" data-id="4" data-label="INV-0012">$INV-0012</span></p>';

  it('reads references out of rich-text mention nodes', () => {
    expect(collectMentionMarkup(html)).toEqual([
      { entityType: 'contact', entityId: 12, label: 'Casey Sanchez' },
      { entityType: 'invoice', entityId: 4, label: 'INV-0012' },
    ]);
    expect(collectMentionMarkup('<p>plain</p>')).toEqual([]);
  });

  it('reduces mention nodes to visible text, in full or only where access is missing', () => {
    expect(stripMentionMarkup(html)).toBe(
      '<p>Walk-through with @Casey Sanchez for $INV-0012</p>',
    );
    expect(downgradeMentionMarkup(html, new Set(['invoice:4']))).toBe(
      '<p>Walk-through with @Casey Sanchez for <span data-type="moneyMention" data-entity="invoice" data-id="4" data-label="INV-0012">$INV-0012</span></p>',
    );
  });

  it('keeps one reference per target, first occurrence winning', () => {
    expect(uniqueReferences([
      { entityType: 'contact', entityId: 1, label: 'A' },
      { entityType: 'contact', entityId: 1, label: 'B' },
      { entityType: 'invoice', entityId: 1, label: 'C' },
    ])).toEqual([
      { entityType: 'contact', entityId: 1, label: 'A' },
      { entityType: 'invoice', entityId: 1, label: 'C' },
    ]);
  });
});
