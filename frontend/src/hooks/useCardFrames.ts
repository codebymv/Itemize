import { useMemo } from 'react';
import { useWorkspaceCanvasActions } from '@/components/workspace/WorkspaceCanvasActions';
import { frameForCard } from '@/lib/frameContainment';
import type { FrameSurface } from '@/lib/frameSuggestions';
import type { List, Note } from '@/types';

type CardRef =
  | { source: 'list'; card: List }
  | { source: 'note'; card: Note };

/**
 * The `#` surface for a card: the canvas's frames, the one this card sits in,
 * and a move that asks the canvas to place the card inside another frame.
 * Absent off the canvas (Contents, modals), where cards have no geometry.
 */
export const useCardFrames = ({ source, card }: CardRef): FrameSurface | undefined => {
  const canvas = useWorkspaceCanvasActions();
  return useMemo(() => {
    if (!canvas) return undefined;
    return {
      frames: canvas.frames,
      currentFrameId: frameForCard(canvas.frames, card)?.id ?? null,
      // The kind goes last: a list's own `type` field is its category, not its kind.
      moveTo: (frameId) => canvas.moveCardToFrame({ ...card, type: source }, frameId),
    };
  }, [canvas, card, source]);
};
