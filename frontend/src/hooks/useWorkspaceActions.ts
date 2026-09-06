import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceCanvasActions } from '@/components/workspace/WorkspaceCanvasActions';
import {
  ESTIMATE_PREFILL_STATE,
  estimatePrefillFromList,
  type WorkspaceActionId,
  type WorkspaceActionSurface,
} from '@/lib/workspaceActions';
import type { List, Note } from '@/types';

type WorkspaceActionCard =
  | { source: 'list'; card: List }
  | { source: 'note'; card: Note };

interface UseWorkspaceActionsOptions {
  onShare: () => void;
}

/**
 * The `/` surface for one card: which actions apply here, and what each one
 * does. Lists can become estimates; anything on the canvas can spawn a
 * neighbour; every card can share. The door actions (`@`, `$`) are listed
 * but never run — the trigger adapter rewrites the input instead.
 */
export const useWorkspaceActions = (
  target: WorkspaceActionCard,
  { onShare }: UseWorkspaceActionsOptions,
): WorkspaceActionSurface => {
  const navigate = useNavigate();
  const canvas = useWorkspaceCanvasActions();
  const { source, card } = target;

  return useMemo(() => {
    const available: WorkspaceActionId[] = [];
    if (source === 'list') available.push('turn-into-estimate');
    if (canvas) available.push('new-list', 'new-note');
    available.push('share', 'mention-client', 'reference-document');
    if (canvas) available.push('move-to-frame');

    const run = (id: WorkspaceActionId) => {
      switch (id) {
        case 'turn-into-estimate': {
          if (source !== 'list') return;
          const contactId = card.contact_id;
          navigate(
            {
              pathname: '/estimates/new',
              search: typeof contactId === 'number' && contactId > 0 ? `?contactId=${contactId}` : '',
            },
            { state: { [ESTIMATE_PREFILL_STATE]: estimatePrefillFromList(card) } },
          );
          return;
        }
        case 'new-list':
          canvas?.createListNear(card);
          return;
        case 'new-note':
          canvas?.createNoteNear(card);
          return;
        case 'share':
          onShare();
          return;
        default:
          return;
      }
    };

    return { available, run };
  }, [canvas, card, navigate, onShare, source]);
};
