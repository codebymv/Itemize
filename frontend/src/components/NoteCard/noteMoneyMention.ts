import { Extension } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { describeReference, indexReferences } from '@/lib/referenceStatus';
import { referenceKey } from '@/lib/mentionTokens';
import type { WorkspaceReference } from '@/types';

/**
 * The `$` node: an invoice, estimate, or payment referenced inline. It is the
 * client mention node with its own name (so both can live in one schema) and
 * an `entity` attribute, because `$` can point at three kinds of document.
 */
export const MoneyMention = Mention.extend({
  name: 'moneyMention',
  addAttributes() {
    return {
      ...this.parent?.(),
      entity: {
        default: 'invoice',
        parseHTML: (element) => element.getAttribute('data-entity') ?? 'invoice',
        renderHTML: (attributes) => ({ 'data-entity': attributes.entity }),
      },
    };
  },
});

export const REFERENCE_STATUS_META = 'referenceStatus';

const referenceStatusKey = new PluginKey<DecorationSet>('referenceStatus');

/**
 * Appends each money pill's live state ("sent · viewed 2d") as a widget after
 * the node. State is not part of the document: it arrives from the owner's
 * hydrated references and is pushed in with a transaction meta, so the
 * decorations refresh without touching content or the save path.
 */
export const ReferenceStatus = Extension.create({
  name: 'referenceStatus',
  addStorage() {
    return { references: [] as WorkspaceReference[] };
  },
  addProseMirrorPlugins() {
    const storage = this.storage as { references: WorkspaceReference[] };
    const build = (doc: Parameters<typeof DecorationSet.create>[0]) => {
      const index = indexReferences(storage.references);
      const decorations: Decoration[] = [];
      doc.descendants((node, position) => {
        if (node.type.name !== 'moneyMention') return;
        const reference = index.get(referenceKey(String(node.attrs.entity), String(node.attrs.id)));
        const state = reference ? describeReference(reference) : null;
        if (!state) return;
        decorations.push(
          Decoration.widget(
            position + node.nodeSize,
            () => {
              const span = document.createElement('span');
              span.className = 'mention-status';
              span.setAttribute('contenteditable', 'false');
              span.textContent = ` · ${state}`;
              return span;
            },
            { side: 1, key: `${node.attrs.entity}:${node.attrs.id}:${state}` },
          ),
        );
      });
      return DecorationSet.create(doc, decorations);
    };
    return [
      new Plugin({
        key: referenceStatusKey,
        state: {
          init: (_config, state) => build(state.doc),
          apply: (transaction, decorations) =>
            transaction.docChanged || transaction.getMeta(REFERENCE_STATUS_META)
              ? build(transaction.doc)
              : decorations,
        },
        props: {
          decorations: (state) => referenceStatusKey.getState(state),
        },
      }),
    ];
  },
});
