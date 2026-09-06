import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { createEntityMentionSuggestion, type MentionContext } from './noteMentionSuggestion';

/**
 * The `/` trigger for notes. Unlike `@` and `$` it inserts no node — an
 * accepted row runs an action — so it is a bare extension that mounts the
 * shared suggestion plugin on the slash sigil.
 */
export const createWorkspaceActionsExtension = (contextRef: { current: MentionContext }) =>
  Extension.create({
    name: 'workspaceActions',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...createEntityMentionSuggestion('/', contextRef),
        }),
      ];
    },
  });
