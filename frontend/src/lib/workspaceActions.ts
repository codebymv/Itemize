import type { EntitySuggestion } from '@/lib/entitySuggestions';
import { stripMentionTokens, type MentionTriggerChar } from '@/lib/mentionTokens';
import type { List } from '@/types';

/**
 * The `/` vocabulary: what a card can do from the keyboard. Two of these are
 * doors to the other sigils (`/mention` → `@`, `/reference` → `$`); the rest
 * run something the card already exposes with the mouse.
 */
export type WorkspaceActionId =
  | 'turn-into-estimate'
  | 'new-list'
  | 'new-note'
  | 'share'
  | 'mention-client'
  | 'reference-document'
  | 'move-to-frame';

export interface WorkspaceActionDefinition {
  id: WorkspaceActionId;
  label: string;
  detail: string;
  /** Extra words a query may start with; the label's own words always count. */
  keywords: readonly string[];
}

export const WORKSPACE_ACTIONS: readonly WorkspaceActionDefinition[] = [
  {
    id: 'turn-into-estimate',
    label: 'Turn into estimate',
    detail: 'Draft with this list’s items',
    keywords: ['estimate', 'quote', 'convert', 'promote'],
  },
  { id: 'new-list', label: 'New list', detail: 'Beside this card', keywords: ['list', 'add', 'create'] },
  { id: 'new-note', label: 'New note', detail: 'Beside this card', keywords: ['note', 'add', 'create'] },
  { id: 'share', label: 'Share', detail: 'Public link for this card', keywords: ['share', 'link', 'publish'] },
  { id: 'mention-client', label: 'Mention a client', detail: 'Same as typing @', keywords: ['client', 'contact', 'mention'] },
  {
    id: 'reference-document',
    label: 'Reference a document',
    detail: 'Same as typing $ — invoices, estimates, payments',
    keywords: ['reference', 'invoice', 'estimate', 'payment', 'document', 'money'],
  },
  {
    id: 'move-to-frame',
    label: 'Move into a frame',
    detail: 'Same as typing #',
    keywords: ['frame', 'move', 'group', 'project'],
  },
];

/** The sigil an action stands in for, when it is only a door to another list. */
export const triggerForAction = (id: WorkspaceActionId): MentionTriggerChar | null => {
  if (id === 'mention-client') return '@';
  if (id === 'reference-document') return '$';
  if (id === 'move-to-frame') return '#';
  return null;
};

/** What a surface hands its trigger adapter: the actions it can run, and how. */
export interface WorkspaceActionSurface {
  available: readonly WorkspaceActionId[];
  run: (id: WorkspaceActionId) => void;
}

const words = (text: string): string[] => text.toLowerCase().split(/[\s-]+/).filter(Boolean);

const matches = (definition: WorkspaceActionDefinition, query: string): boolean => {
  const needles = words(query);
  if (needles.length === 0) return true;
  const haystack = [...words(definition.label), ...definition.keywords.map((word) => word.toLowerCase())];
  return needles.every((needle) => haystack.some((word) => word.startsWith(needle)));
};

/**
 * Rows for the `/` list, in vocabulary order, filtered by prefix on any word.
 * The row id is the definition's position so the list keys stay stable.
 */
export const actionSuggestions = (
  available: readonly WorkspaceActionId[],
  query: string,
): EntitySuggestion[] =>
  WORKSPACE_ACTIONS.flatMap((definition, index) =>
    available.includes(definition.id) && matches(definition, query)
      ? [{
          kind: 'action' as const,
          id: index,
          label: definition.label,
          detail: definition.detail,
          initials: '/',
          action: definition.id,
        }]
      : [],
  );

/**
 * What a list hands the estimate editor through router state: its items as
 * line items, and where they came from. The client travels separately as
 * `?contactId=` so the URL carries an id and nothing personal.
 */
export interface EstimatePrefill {
  source: { type: 'list'; id: string; title: string };
  lineItems: Array<{ name: string }>;
}

export const ESTIMATE_PREFILL_STATE = 'estimatePrefill';

const MAX_PREFILL_ITEMS = 100;
const MAX_LINE_ITEM_NAME = 200;

// `List.id` is typed as a string but arrives from GraphQL as a number; the prefill carries one shape.
export const estimatePrefillFromList = (list: List): EstimatePrefill => ({
  source: { type: 'list', id: String(list.id), title: list.title },
  lineItems: list.items
    .map((item) => stripMentionTokens(item.text).replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_ITEM_NAME))
    .filter((name) => name.length > 0)
    .slice(0, MAX_PREFILL_ITEMS)
    .map((name) => ({ name })),
});

/** Router state is untyped and survives reloads; accept only the shape above. */
export const readEstimatePrefill = (state: unknown): EstimatePrefill | null => {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as Record<string, unknown>)[ESTIMATE_PREFILL_STATE];
  if (!candidate || typeof candidate !== 'object') return null;
  const { source, lineItems } = candidate as Record<string, unknown>;
  if (!source || typeof source !== 'object' || !Array.isArray(lineItems)) return null;
  const { type, id, title } = source as Record<string, unknown>;
  if (type !== 'list' || typeof title !== 'string') return null;
  if (typeof id !== 'string' && !(typeof id === 'number' && Number.isFinite(id))) return null;
  const items = lineItems
    .filter((item): item is { name: string } =>
      Boolean(item) && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string')
    .map((item) => ({ name: item.name.trim().slice(0, MAX_LINE_ITEM_NAME) }))
    .filter((item) => item.name.length > 0)
    .slice(0, MAX_PREFILL_ITEMS);
  return { source: { type: 'list', id: String(id), title }, lineItems: items };
};
