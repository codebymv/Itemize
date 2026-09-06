import { describe, expect, it } from 'vitest';
import {
  applyMentionTrigger,
  collectMentionTokens,
  findMentionTrigger,
  firstMentionBinding,
  formatMentionToken,
  parseMentionSegments,
  stripMentionTokens,
} from './mentionTokens';

describe('mentionTokens', () => {
  const text = 'Call @[Casey Sanchez](contact:12) about tile';

  it('parses text into plain and mention segments', () => {
    expect(parseMentionSegments(text)).toEqual([
      { kind: 'text', text: 'Call ' },
      { kind: 'mention', contactId: 12, label: 'Casey Sanchez' },
      { kind: 'text', text: ' about tile' },
    ]);
    expect(parseMentionSegments('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
  });

  it('collects tokens, strips them to readable labels, and formats safely', () => {
    expect(collectMentionTokens(text)).toEqual([{ contactId: 12, label: 'Casey Sanchez' }]);
    expect(stripMentionTokens(text)).toBe('Call @Casey Sanchez about tile');
    expect(formatMentionToken(3, 'Weird ] name\nhere')).toBe('@[Weird   name here](contact:3)');
  });

  it('detects an open @ trigger only at a word boundary before the caret', () => {
    expect(findMentionTrigger('Call @Cas', 9)).toEqual({ start: 5, query: 'Cas' });
    expect(findMentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
    expect(findMentionTrigger('email me@work', 13)).toBeNull();
    // A caret right after an @word reopens the list, the same as editing a Slack mention.
    expect(findMentionTrigger('Call @Casey now', 11)).toEqual({ start: 5, query: 'Casey' });
    expect(findMentionTrigger('Call @Casey now', 5)).toBeNull();
  });

  it('replaces the trigger with a token and moves the caret past it', () => {
    const trigger = findMentionTrigger('Call @Cas today', 9);
    expect(trigger).not.toBeNull();
    expect(applyMentionTrigger('Call @Cas today', trigger!, 9, { contactId: 12, label: 'Casey Sanchez' })).toEqual({
      value: 'Call @[Casey Sanchez](contact:12)  today',
      caret: 'Call @[Casey Sanchez](contact:12) '.length,
    });
  });

  it('binds an unbound card to the first mention and leaves a bound card alone', () => {
    expect(firstMentionBinding(text, null)).toEqual({ contactId: 12, label: 'Casey Sanchez' });
    expect(firstMentionBinding(text, 4)).toBeNull();
    expect(firstMentionBinding('nothing', null)).toBeNull();
  });
});
