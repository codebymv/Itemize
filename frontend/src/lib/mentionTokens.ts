/**
 * Plain-text client mentions for list items and titles. The stored string is
 * `@[Casey Sanchez](contact:12)`; the label is display-only and the id is what
 * the binding and every projection read. The server rewrites tokens for
 * contacts the owner may not reference, so the client never has to guess.
 */
const MENTION_TOKEN = /@\[([^\]\n]{1,200})\]\(contact:(\d{1,12})\)/g;

/** `@` plus a query with no whitespace, at the start or after whitespace, ending at the caret. */
const TRIGGER_BEFORE_CARET = /(^|\s)@([^\s@]{0,80})$/;

export interface MentionToken {
  contactId: number;
  label: string;
}

export type MentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; contactId: number; label: string };

export const parseMentionSegments = (text: string): MentionSegment[] => {
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) });
    segments.push({ kind: 'mention', contactId: Number(match[2]), label: match[1] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
};

export const collectMentionTokens = (text: string): MentionToken[] =>
  parseMentionSegments(text).flatMap((segment) =>
    segment.kind === 'mention' ? [{ contactId: segment.contactId, label: segment.label }] : [],
  );

/** The readable form: labels keep their `@`, ids are dropped. Use for aria labels and search. */
export const stripMentionTokens = (text: string): string =>
  text.replace(MENTION_TOKEN, (_match, label: string) => `@${label}`);

export const formatMentionToken = (contactId: number, label: string): string =>
  `@[${label.replace(/[\]\n]/g, ' ').trim()}](contact:${contactId})`;

export interface MentionTrigger {
  /** Index of the `@` that opened the trigger. */
  start: number;
  query: string;
}

/** Finds an open `@query` immediately before the caret, if any. */
export const findMentionTrigger = (value: string, caret: number): MentionTrigger | null => {
  const before = value.slice(0, Math.max(0, caret));
  const match = TRIGGER_BEFORE_CARET.exec(before);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2] };
};

/** Replaces the open trigger with a token and returns the next value and caret. */
export const applyMentionTrigger = (
  value: string,
  trigger: MentionTrigger,
  caret: number,
  token: MentionToken,
): { value: string; caret: number } => {
  const inserted = `${formatMentionToken(token.contactId, token.label)} `;
  const next = value.slice(0, trigger.start) + inserted + value.slice(caret);
  return { value: next, caret: trigger.start + inserted.length };
};

/**
 * The binding a plain-text save should carry: the first mentioned client when
 * the card has none yet. Later mentions are references only.
 */
export const firstMentionBinding = (
  text: string,
  currentContactId: number | null | undefined,
): MentionToken | null => {
  if (typeof currentContactId === 'number' && currentContactId > 0) return null;
  return collectMentionTokens(text)[0] ?? null;
};
