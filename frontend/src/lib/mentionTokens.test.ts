import { describe, expect, it } from 'vitest';
import {
  applyMentionTrigger,
  collectMentionTokens,
  findMentionTrigger,
  firstMentionBinding,
  formatMentionToken,
  parseMentionSegments,
  replaceMentionTrigger,
  stripMentionTokens,
} from './mentionTokens';

describe('mentionTokens', () => {
  const text = 'Call @[Casey Sanchez](contact:12) about $[INV-0012](invoice:4) tile';

  it('parses text into plain, client, and money segments', () => {
    expect(parseMentionSegments(text)).toEqual([
      { kind: 'text', text: 'Call ' },
      { kind: 'mention', entityType: 'contact', entityId: 12, label: 'Casey Sanchez' },
      { kind: 'text', text: ' about ' },
      { kind: 'mention', entityType: 'invoice', entityId: 4, label: 'INV-0012' },
      { kind: 'text', text: ' tile' },
    ]);
    expect(parseMentionSegments('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
    expect(parseMentionSegments('$[x](contact:1)')).toEqual([{ kind: 'text', text: '$[x](contact:1)' }]);
  });

  it('collects tokens, strips them to readable labels, and formats safely', () => {
    expect(collectMentionTokens(text)).toEqual([
      { entityType: 'contact', entityId: 12, label: 'Casey Sanchez' },
      { entityType: 'invoice', entityId: 4, label: 'INV-0012' },
    ]);
    expect(stripMentionTokens(text)).toBe('Call @Casey Sanchez about $INV-0012 tile');
    expect(formatMentionToken({ entityType: 'contact', entityId: 3, label: 'Weird ] name\nhere' }))
      .toBe('@[Weird   name here](contact:3)');
    expect(formatMentionToken({ entityType: 'estimate', entityId: 9, label: 'EST-3' }))
      .toBe('$[EST-3](estimate:9)');
  });

  it('detects an open trigger only for the sigils the surface enables', () => {
    expect(findMentionTrigger('Call @Cas', 9)).toEqual({ start: 5, char: '@', query: 'Cas' });
    expect(findMentionTrigger('Pay $INV', 8, ['@', '$'])).toEqual({ start: 4, char: '$', query: 'INV' });
    expect(findMentionTrigger('Pay $INV', 8)).toBeNull();
    expect(findMentionTrigger('@', 1)).toEqual({ start: 0, char: '@', query: '' });
    expect(findMentionTrigger('email me@work', 13)).toBeNull();
    expect(findMentionTrigger('costs $5', 8, ['$'])).toEqual({ start: 6, char: '$', query: '5' });
    // A caret right after an @word reopens the list, the same as editing a Slack mention.
    expect(findMentionTrigger('Call @Casey now', 11)).toEqual({ start: 5, char: '@', query: 'Casey' });
    expect(findMentionTrigger('Call @Casey now', 5)).toBeNull();
    expect(findMentionTrigger('/sha', 4, ['@', '$', '/'])).toEqual({ start: 0, char: '/', query: 'sha' });
    expect(findMentionTrigger('/sha', 4)).toBeNull();
    expect(findMentionTrigger('and/or', 6, ['/'])).toBeNull();
    expect(findMentionTrigger('Move #kit', 9, ['#'])).toEqual({ start: 5, char: '#', query: 'kit' });
    expect(findMentionTrigger('Move #kit', 9)).toBeNull();
  });

  it('replaces the open trigger with nothing or with another sigil', () => {
    const trigger = findMentionTrigger('Tile /sha now', 9, ['/']);
    expect(replaceMentionTrigger('Tile /sha now', trigger!, 9)).toEqual({ value: 'Tile  now', caret: 5 });
    expect(replaceMentionTrigger('Tile /sha now', trigger!, 9, '@')).toEqual({ value: 'Tile @ now', caret: 6 });
  });

  it('replaces the trigger with a token and moves the caret past it', () => {
    const trigger = findMentionTrigger('Call @Cas today', 9);
    expect(trigger).not.toBeNull();
    expect(applyMentionTrigger('Call @Cas today', trigger!, 9, {
      entityType: 'contact',
      entityId: 12,
      label: 'Casey Sanchez',
    })).toEqual({
      value: 'Call @[Casey Sanchez](contact:12)  today',
      caret: 'Call @[Casey Sanchez](contact:12) '.length,
    });
  });

  it('binds an unbound card to the first client mention only', () => {
    expect(firstMentionBinding(text, null)).toEqual({ entityType: 'contact', entityId: 12, label: 'Casey Sanchez' });
    expect(firstMentionBinding('$[INV-1](invoice:1) only', null)).toBeNull();
    expect(firstMentionBinding(text, 4)).toBeNull();
    expect(firstMentionBinding('nothing', null)).toBeNull();
  });
});
