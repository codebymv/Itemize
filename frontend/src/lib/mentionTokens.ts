/**
 * Inline references in plain text (list items, titles). The stored string
 * carries `@[Casey Sanchez](contact:12)` for clients and `$[INV-0012](invoice:4)`
 * for money documents; the label is display-only and the id is what the
 * binding, hydration, and every projection read. The server rewrites tokens
 * for entities the owner may not reference, so the client never has to guess.
 */
export type ReferenceEntityType = 'contact' | 'invoice' | 'estimate' | 'payment';
export type MentionTriggerChar = '@' | '$';

const MENTION_TOKEN =
  /([@$])\[([^\]\n]{1,200})\]\((contact|invoice|estimate|payment):(\d{1,12})\)/g;

/** A sigil plus a query with no whitespace, at the start or after whitespace, ending at the caret. */
const TRIGGER_BEFORE_CARET = /(^|\s)([@$])([^\s@$]{0,80})$/;

const sigilFor = (entityType: ReferenceEntityType): MentionTriggerChar =>
  entityType === 'contact' ? '@' : '$';

const sigilMatches = (sigil: string, entityType: string): boolean =>
  sigil === '@' ? entityType === 'contact' : entityType !== 'contact';

export interface MentionToken {
  entityType: ReferenceEntityType;
  entityId: number;
  label: string;
}

export const referenceKey = (entityType: string, entityId: number | string): string =>
  `${entityType}:${entityId}`;

export type MentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; entityType: ReferenceEntityType; entityId: number; label: string };

export const parseMentionSegments = (text: string): MentionSegment[] => {
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const [whole, sigil, label, entityType, id] = match;
    if (!sigilMatches(sigil, entityType)) continue;
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) });
    segments.push({
      kind: 'mention',
      entityType: entityType as ReferenceEntityType,
      entityId: Number(id),
      label,
    });
    cursor = start + whole.length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
};

export const collectMentionTokens = (text: string): MentionToken[] =>
  parseMentionSegments(text).flatMap((segment) =>
    segment.kind === 'mention'
      ? [{ entityType: segment.entityType, entityId: segment.entityId, label: segment.label }]
      : [],
  );

/** The readable form: labels keep their sigil, ids are dropped. Use for aria labels and search. */
export const stripMentionTokens = (text: string): string =>
  text.replace(MENTION_TOKEN, (match, sigil: string, label: string, entityType: string) =>
    sigilMatches(sigil, entityType) ? `${sigil}${label}` : match,
  );

export const formatMentionToken = (token: MentionToken): string =>
  `${sigilFor(token.entityType)}[${token.label.replace(/[\]\n]/g, ' ').trim()}](${token.entityType}:${token.entityId})`;

export interface MentionTrigger {
  /** Index of the sigil that opened the trigger. */
  start: number;
  char: MentionTriggerChar;
  query: string;
}

/** Finds an open `@query` or `$query` immediately before the caret, if any. */
export const findMentionTrigger = (
  value: string,
  caret: number,
  chars: readonly MentionTriggerChar[] = ['@'],
): MentionTrigger | null => {
  const before = value.slice(0, Math.max(0, caret));
  const match = TRIGGER_BEFORE_CARET.exec(before);
  if (!match) return null;
  const char = match[2] as MentionTriggerChar;
  if (!chars.includes(char)) return null;
  return { start: before.length - match[3].length - 1, char, query: match[3] };
};

/** Replaces the open trigger with a token and returns the next value and caret. */
export const applyMentionTrigger = (
  value: string,
  trigger: MentionTrigger,
  caret: number,
  token: MentionToken,
): { value: string; caret: number } => {
  const inserted = `${formatMentionToken(token)} `;
  const next = value.slice(0, trigger.start) + inserted + value.slice(caret);
  return { value: next, caret: trigger.start + inserted.length };
};

/**
 * The binding a plain-text save should carry: the first mentioned client when
 * the card has none yet. Money references never bind; later mentions are
 * references only.
 */
export const firstMentionBinding = (
  text: string,
  currentContactId: number | null | undefined,
): MentionToken | null => {
  if (typeof currentContactId === 'number' && currentContactId > 0) return null;
  return collectMentionTokens(text).find((token) => token.entityType === 'contact') ?? null;
};
