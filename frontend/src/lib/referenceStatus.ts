import type { WorkspaceReference } from '@/types';
import { referenceKey } from '@/lib/mentionTokens';

const DAY_MS = 86_400_000;

/** "2d" / "3h" / "now" — compact, for a pill suffix. */
export const compactAge = (iso: string | null | undefined, now = Date.now()): string | null => {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  const elapsed = Math.max(0, now - at);
  if (elapsed < 3_600_000) return 'now';
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed < 30 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)}d`;
  return `${Math.floor(elapsed / (30 * DAY_MS))}mo`;
};

/**
 * The live-state suffix for a money pill: the document's status, plus the
 * most recent thing the recipient did with it. Contacts have no suffix.
 */
export const describeReference = (reference: WorkspaceReference, now = Date.now()): string | null => {
  if (reference.entityType === 'contact') return null;
  const parts: string[] = [];
  if (reference.status) parts.push(reference.status.toLowerCase());
  const events: Array<[string, string | null]> = [
    ['paid', reference.paidAt],
    ['accepted', reference.acceptedAt],
    ['declined', reference.declinedAt],
    ['viewed', reference.viewedAt],
    ['sent', reference.sentAt],
  ];
  const latest = events.find(([, at]) => Boolean(at));
  if (latest && latest[0] !== reference.status?.toLowerCase()) {
    const age = compactAge(latest[1], now);
    parts.push(age ? `${latest[0]} ${age}` : latest[0]);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
};

export const indexReferences = (
  references: readonly WorkspaceReference[] | null | undefined,
): Map<string, WorkspaceReference> => {
  const index = new Map<string, WorkspaceReference>();
  for (const reference of references ?? []) {
    index.set(referenceKey(reference.entityType, reference.entityId), reference);
  }
  return index;
};
