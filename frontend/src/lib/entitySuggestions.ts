import { getContacts } from '@/services/contactsApi';
import { graphqlRequest } from '@/services/graphqlClient';
import { contactDisplayName } from '@/lib/contactDisplayName';
import { formatMoney } from '@/lib/numberFormat';
import type { ReferenceEntityType } from '@/lib/mentionTokens';
import type { Contact } from '@/types';

/** One row in an inline trigger list: `@` clients, `$` money documents, or the upgrade row. */
export interface EntitySuggestion {
  kind: ReferenceEntityType | 'upgrade';
  id: number;
  label: string;
  detail: string | null;
  initials: string;
  status?: string | null;
}

export const SUGGESTION_LIMIT = 6;

const initialsFor = (label: string): string =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

export const contactSuggestion = (contact: Contact): EntitySuggestion => {
  const label = contactDisplayName(contact) ?? `Client #${contact.id}`;
  const detail = contact.company && contact.company !== label
    ? contact.company
    : contact.email && contact.email !== label
      ? contact.email
      : null;
  return { kind: 'contact', id: contact.id, label, detail, initials: initialsFor(label) };
};

/** Shown instead of clients when the plan has no Contacts capability. */
export const upgradeSuggestion: EntitySuggestion = {
  kind: 'upgrade',
  id: 0,
  label: 'Link clients with Solo',
  detail: 'Turn notes into client work',
  initials: '↑',
};

export interface MoneyDocumentRow {
  entityType: string;
  entityId: number;
  label: string;
  detail: string | null;
  status: string | null;
  total: string | null;
  currency: string | null;
  contactId: number | null;
}

const MONEY_INITIALS: Record<string, string> = { invoice: 'IN', estimate: 'ES', payment: 'PA' };

export const moneySuggestion = (row: MoneyDocumentRow): EntitySuggestion => {
  const amount = row.total ? formatMoney(row.total, { currency: row.currency ?? 'USD' }) : null;
  const parts = [row.detail, amount].filter((part): part is string => Boolean(part));
  return {
    kind: row.entityType as ReferenceEntityType,
    id: row.entityId,
    label: row.label,
    detail: parts.length > 0 ? parts.join(' · ') : null,
    initials: MONEY_INITIALS[row.entityType] ?? '$',
    status: row.status,
  };
};

type CacheEntry = { at: number; rows: EntitySuggestion[] };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

export const resetEntitySuggestionCacheForTests = (): void => cache.clear();

const cached = async (key: string, load: () => Promise<EntitySuggestion[]>) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const rows = await load();
  cache.set(key, { at: Date.now(), rows });
  return rows;
};

/**
 * Client rows for a trigger query. Cached briefly per organization and query
 * because the editor asks on every keystroke; the server still owns the
 * search and the organization scoping.
 */
export const fetchContactSuggestions = (query: string, organizationId: number): Promise<EntitySuggestion[]> =>
  cached(`contact:${organizationId}:${query.trim().toLowerCase()}`, async () => {
    const response = await getContacts(
      { search: query.trim() || undefined, status: 'active', limit: SUGGESTION_LIMIT },
      organizationId,
    );
    return response.contacts.map(contactSuggestion);
  });

const moneySuggestionsQuery = `
  query MoneyDocumentSuggestions($query: String, $contactId: Int) {
    moneyDocumentSuggestions(query: $query, contactId: $contactId) {
      entityType entityId label detail status total currency contactId
    }
  }
`;

/** Money-document rows for `$`; the bound client's documents come first. */
export const fetchMoneySuggestions = (
  query: string,
  organizationId: number,
  contactId: number | null,
): Promise<EntitySuggestion[]> =>
  cached(`money:${organizationId}:${contactId ?? 0}:${query.trim().toLowerCase()}`, async () => {
    const variables = { query: query.trim() || null, contactId };
    const data = await graphqlRequest<{ moneyDocumentSuggestions: MoneyDocumentRow[] }, typeof variables>(
      moneySuggestionsQuery,
      variables,
      organizationId,
    );
    return data.moneyDocumentSuggestions.map(moneySuggestion);
  });
