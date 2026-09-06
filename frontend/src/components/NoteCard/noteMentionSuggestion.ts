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
import {
  actionSuggestions,
  triggerForAction,
  type WorkspaceActionSurface,
} from '@/lib/workspaceActions';
import { frameSuggestions, type FrameSurface } from '@/lib/frameSuggestions';

/**
 * Live values the suggestion plugins read at call time. The editor is created
 * once, so anything that changes across renders arrives through this ref.
 */
export interface MentionContext {
  organizationId: number | null;
  canBind: boolean;
  contactId: number | null;
  /** The card's `/` actions; without them `/` lists nothing. */
  actions?: WorkspaceActionSurface;
  /** The canvas's frames for `#`; absent off the canvas. */
  frames?: FrameSurface;
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

const LIST_LABELS: Record<MentionTriggerChar, { label: string; empty: string }> = {
  '@': { label: 'Client suggestions', empty: 'No matching clients' },
  $: { label: 'Document suggestions', empty: 'No matching documents' },
  '/': { label: 'Actions', empty: 'No matching actions' },
  '#': { label: 'Frames', empty: 'No frames yet — add one from the Add menu' },
};

const PLUGIN_KEYS: Record<MentionTriggerChar, string> = {
  '@': 'contactMentionSuggestion',
  $: 'moneyMentionSuggestion',
  '/': 'workspaceActionSuggestion',
  '#': 'frameSuggestion',
};

/**
 * Inserts the pill and, for a client on an unbound card, binds the card in
 * the same gesture. Money references never bind. An action row removes the
 * typed `/query` and either opens another sigil or runs the action.
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
  if (props.kind === 'frame') {
    editor.chain().focus().deleteRange(range).run();
    context.frames?.moveTo(props.id);
    return;
  }
  if (props.kind === 'action') {
    const sigil = props.action ? triggerForAction(props.action) : null;
    const chain = editor.chain().focus().deleteRange(range);
    (sigil ? chain.insertContent(sigil) : chain).run();
    if (!sigil && props.action) context.actions?.run(props.action);
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
  if (char === '/') return actionSuggestions(context.actions?.available ?? [], query);
  if (char === '#') return context.frames ? frameSuggestions(context.frames, query) : [];
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
  // Three suggestion plugins share one editor; each needs its own key.
  pluginKey: new PluginKey(PLUGIN_KEYS[char]),
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
      label: LIST_LABELS[char].label,
      emptyLabel: LIST_LABELS[char].empty,
    });

    // A `/` or `#` with nothing behind it is text (a path, "#42"), not a request;
    // a bare `#` still explains where frames come from.
    const showHost = (props: SuggestionProps<EntitySuggestion>) => {
      if (!host) return;
      host.hidden = (char === '/' || char === '#')
        && props.items.length === 0
        && !(char === '#' && props.query === '');
      if (!host.hidden) placePopup(host, props.clientRect);
    };

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
        showHost(props);
      },
      onUpdate: (props: SuggestionProps<EntitySuggestion>) => {
        renderer?.updateProps(listProps(props));
        showHost(props);
      },
      onKeyDown: ({ event }) => {
        if (host?.hidden) return false;
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
