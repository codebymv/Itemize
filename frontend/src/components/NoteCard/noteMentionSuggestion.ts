import type { Editor, Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import {
  EntitySuggestionList,
  type EntitySuggestionListHandle,
} from '@/components/workspace/EntitySuggestionList';
import {
  fetchContactSuggestions,
  fetchMoneySuggestions,
  upgradeSuggestion,
  type EntitySuggestion,
} from '@/lib/entitySuggestions';
import type { MentionTriggerChar } from '@/lib/mentionTokens';

/**
 * Live values the suggestion plugins read at call time. The editor is created
 * once, so anything that changes across renders arrives through this ref.
 */
export interface MentionContext {
  organizationId: number | null;
  canBind: boolean;
  contactId: number | null;
  onLinkContact?: (contactId: number, contactName: string) => Promise<unknown> | unknown;
  onUpgrade?: () => void;
}

export interface MentionCommandProps {
  editor: Pick<Editor, 'chain'>;
  range: Range;
  props: EntitySuggestion;
}

/** Node type names: `@` inserts `mention`, `$` inserts `moneyMention`. */
export const nodeNameFor = (char: MentionTriggerChar): 'mention' | 'moneyMention' =>
  char === '@' ? 'mention' : 'moneyMention';

/**
 * Inserts the pill and, for a client on an unbound card, binds the card in
 * the same gesture. Money references never bind.
 */
export const acceptMention = (
  context: MentionContext,
  char: MentionTriggerChar,
  { editor, range, props }: MentionCommandProps,
): void => {
  if (props.kind === 'upgrade') {
    editor.chain().focus().deleteRange(range).run();
    context.onUpgrade?.();
    return;
  }
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: nodeNameFor(char),
        attrs: { id: String(props.id), label: props.label, entity: props.kind },
      },
      { type: 'text', text: ' ' },
    ])
    .run();
  if (
    props.kind === 'contact'
    && (context.contactId === null || context.contactId === undefined)
  ) {
    void context.onLinkContact?.(props.id, props.label);
  }
};

export const mentionItems = async (
  context: MentionContext,
  char: MentionTriggerChar,
  query: string,
): Promise<EntitySuggestion[]> => {
  if (!context.canBind || context.organizationId === null) return [upgradeSuggestion];
  return char === '$'
    ? fetchMoneySuggestions(query, context.organizationId, context.contactId)
    : fetchContactSuggestions(query, context.organizationId);
};

const POPUP_OFFSET_PX = 6;

const placePopup = (element: HTMLElement, clientRect: (() => DOMRect | null) | null | undefined) => {
  const rect = clientRect?.();
  if (!rect) return;
  const width = element.offsetWidth || 288;
  const height = element.offsetHeight || 0;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + POPUP_OFFSET_PX;
  const top = below + height > window.innerHeight - 8 && rect.top - height - POPUP_OFFSET_PX > 8
    ? rect.top - height - POPUP_OFFSET_PX
    : below;
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
};

/**
 * Builds the `suggestion` config for one trigger sigil. Rendering uses a
 * fixed-position host appended to <body> so the list escapes the card's
 * overflow and the canvas transform.
 */
export const createEntityMentionSuggestion = (
  char: MentionTriggerChar,
  contextRef: { current: MentionContext },
): Omit<SuggestionOptions<EntitySuggestion>, 'editor'> => ({
  char,
  allowSpaces: false,
  // Two suggestion plugins share one editor; each needs its own key.
  pluginKey: new PluginKey(char === '@' ? 'contactMentionSuggestion' : 'moneyMentionSuggestion'),
  items: ({ query }) => mentionItems(contextRef.current, char, query),
  command: ({ editor, range, props }) =>
    acceptMention(contextRef.current, char, { editor, range, props }),
  render: () => {
    let renderer: ReactRenderer<EntitySuggestionListHandle> | null = null;
    let host: HTMLDivElement | null = null;

    const destroy = () => {
      renderer?.destroy();
      renderer = null;
      host?.remove();
      host = null;
    };

    const listProps = (props: SuggestionProps<EntitySuggestion>) => ({
      items: props.items,
      onSelect: props.command,
      emptyLabel: char === '$' ? 'No matching documents' : 'No matching clients',
    });

    return {
      onStart: (props: SuggestionProps<EntitySuggestion>) => {
        host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.zIndex = '10050';
        host.setAttribute('data-testid', 'mention-popup');
        document.body.appendChild(host);
        renderer = new ReactRenderer(EntitySuggestionList, {
          props: listProps(props),
          editor: props.editor,
        });
        host.appendChild(renderer.element);
        placePopup(host, props.clientRect);
      },
      onUpdate: (props: SuggestionProps<EntitySuggestion>) => {
        renderer?.updateProps(listProps(props));
        if (host) placePopup(host, props.clientRect);
      },
      onKeyDown: ({ event }) => {
        if (event.key === 'Escape') {
          destroy();
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: destroy,
    };
  },
});

/** Kept for callers that only offer clients. */
export const createContactMentionSuggestion = (contextRef: { current: MentionContext }) =>
  createEntityMentionSuggestion('@', contextRef);
