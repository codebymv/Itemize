/**
 * Plain-text client mentions. A list item or title stores
 * `@[Casey Sanchez](contact:12)`; the label is display-only and the id is what
 * the binding and every projection read. Rich-text notes carry the same
 * information as a mention node instead.
 */
const MENTION_TOKEN = /@\[([^\]\n]{1,200})\]\(contact:(\d{1,12})\)/g;

const MENTION_MARKUP =
  /<span\b[^>]*\bdata-type="mention"[^>]*>([\s\S]*?)<\/span>/gi;

export interface MentionToken {
  contactId: number;
  label: string;
}

export const collectMentionTokens = (text: string): MentionToken[] => {
  const tokens: MentionToken[] = [];
  for (const match of text.matchAll(MENTION_TOKEN)) {
    tokens.push({ contactId: Number(match[2]), label: match[1] });
  }
  return tokens;
};

/** Public readers get the label; the id never leaves the owner's projection. */
export const stripMentionTokens = (text: string): string =>
  text.replace(MENTION_TOKEN, (_match, label: string) => `@${label}`);

/**
 * Rewrites tokens whose contact the owner may not reference into plain text.
 * Used inside the save transaction after membership has been checked, so an
 * unauthorized id is never stored and nothing else about the save changes.
 */
export const downgradeMentionTokens = (
  text: string,
  allowedContactIds: ReadonlySet<number>,
): string =>
  text.replace(MENTION_TOKEN, (match, label: string, id: string) =>
    allowedContactIds.has(Number(id)) ? match : `@${label}`,
  );

/** Reduces rich-text mention nodes to their visible text for public projections. */
export const stripMentionMarkup = (html: string): string =>
  html.replace(MENTION_MARKUP, (_match, inner: string) => inner);
