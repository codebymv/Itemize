import { getContacts } from '@/services/contactsApi';
import { contactDisplayName } from '@/lib/contactDisplayName';
import type { Contact } from '@/types';

/** One row in an inline trigger list (`@` today; `$`, `#`, `/` later). */
export interface EntitySuggestion {
  kind: 'contact' | 'upgrade';
  id: number;
  label: string;
  detail: string | null;
  initials: string;
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

type CacheEntry = { at: number; rows: EntitySuggestion[] };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

export const resetEntitySuggestionCacheForTests = (): void => cache.clear();

/**
 * Fetches client rows for a trigger query. Cached briefly per organization and
 * query because the editor asks on every keystroke; the server still owns the
 * search and the organization scoping.
 */
export const fetchContactSuggestions = async (
  query: string,
  organizationId: number,
): Promise<EntitySuggestion[]> => {
  const key = `${organizationId}:${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const response = await getContacts(
    { search: query.trim() || undefined, status: 'active', limit: SUGGESTION_LIMIT },
    organizationId,
  );
  const rows = response.contacts.map(contactSuggestion);
  cache.set(key, { at: Date.now(), rows });
  return rows;
};
