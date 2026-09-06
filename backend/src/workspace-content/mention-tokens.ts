/**
 * Inline references in workspace text.
 *
 * Plain text (list items, titles) stores tokens: `@[Casey Sanchez](contact:12)`
 * for clients and `$[INV-0012](invoice:4)` for money documents. Rich-text
 * notes store the same information as a mention node,
 * `<span data-type="mention" data-entity="invoice" data-id="4" data-label="INV-0012">`.
 * The label is display-only; the id is what bindings, hydration, and every
 * projection read.
 */
export type ReferenceEntityType = 'contact' | 'invoice' | 'estimate' | 'payment';

export const MONEY_ENTITY_TYPES: readonly ReferenceEntityType[] = ['invoice', 'estimate', 'payment'];

export interface MentionToken {
  entityType: ReferenceEntityType;
  entityId: number;
  label: string;
}

const MENTION_TOKEN =
  /([@$])\[([^\]\n]{1,200})\]\((contact|invoice|estimate|payment):(\d{1,12})\)/g;

const MENTION_MARKUP =
  /<span\b([^>]*\bdata-entity="(contact|invoice|estimate|payment)"[^>]*)>([\s\S]*?)<\/span>/gi;

const sigilMatches = (sigil: string, entityType: string): boolean =>
  sigil === '@' ? entityType === 'contact' : entityType !== 'contact';

export const referenceKey = (entityType: string, entityId: number | string): string =>
  `${entityType}:${entityId}`;

export const collectMentionTokens = (text: string): MentionToken[] => {
  const tokens: MentionToken[] = [];
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const [, sigil, label, entityType, id] = match;
    if (!sigilMatches(sigil, entityType)) continue;
    tokens.push({
      entityType: entityType as ReferenceEntityType,
      entityId: Number(id),
      label,
    });
  }
  return tokens;
};

/** Public readers get the label with its sigil; the id never leaves the owner's projection. */
export const stripMentionTokens = (text: string): string =>
  text.replace(MENTION_TOKEN, (match, sigil: string, label: string, entityType: string) =>
    sigilMatches(sigil, entityType) ? `${sigil}${label}` : match,
  );

/**
 * Rewrites tokens whose entity the owner may not reference into plain text.
 * Used inside the save transaction after access has been checked, so an
 * unauthorized id is never stored and nothing else about the save changes.
 */
export const downgradeMentionTokens = (
  text: string,
  allowed: ReadonlySet<string>,
): string =>
  text.replace(MENTION_TOKEN, (match, sigil: string, label: string, entityType: string, id: string) =>
    sigilMatches(sigil, entityType) && allowed.has(referenceKey(entityType, id))
      ? match
      : `${sigil}${label}`,
  );

const attribute = (attributes: string, name: string): string | null => {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match ? match[1] : null;
};

/** The references a note's HTML carries as mention nodes. */
export const collectMentionMarkup = (html: string): MentionToken[] => {
  const tokens: MentionToken[] = [];
  for (const match of html.matchAll(MENTION_MARKUP)) {
    const [, attributes, entityType, inner] = match;
    const id = Number(attribute(attributes, 'data-id'));
    if (!Number.isSafeInteger(id) || id < 1) continue;
    const label = attribute(attributes, 'data-label') ?? inner.replace(/^[@$]/, '');
    tokens.push({ entityType: entityType as ReferenceEntityType, entityId: id, label });
  }
  return tokens;
};

/** Reduces mention nodes to their visible text for public projections. */
export const stripMentionMarkup = (html: string): string =>
  html.replace(MENTION_MARKUP, (_match, _attributes, _entityType, inner: string) => inner);

/** Reduces only the mention nodes the owner may not reference. */
export const downgradeMentionMarkup = (
  html: string,
  allowed: ReadonlySet<string>,
): string =>
  html.replace(MENTION_MARKUP, (match, attributes: string, entityType: string, inner: string) => {
    const id = attribute(attributes, 'data-id');
    return id && allowed.has(referenceKey(entityType, id)) ? match : inner;
  });

/** Distinct references, first occurrence wins, so a save stores one row per target. */
export const uniqueReferences = (tokens: MentionToken[]): MentionToken[] => {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const key = referenceKey(token.entityType, token.entityId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
