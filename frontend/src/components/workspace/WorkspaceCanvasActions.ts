import { createContext, useContext } from 'react';
import type { CanvasPositionedItem } from '@/lib/canvasPosition';
import type { WorkspaceFrame } from '@/types';

/** A card the canvas can move: its type, id, and current rectangle. */
export type CanvasCardRef = CanvasPositionedItem & {
  type: 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
  id: number | string;
};

/**
 * What the canvas page lets a card do to the canvas around it. Cards also
 * render on Contents and in modals, where there is no canvas; there the
 * context is absent and the `/new list` / `/new note` rows stay hidden.
 */
export interface WorkspaceCanvasActions {
  createListNear: (anchor: CanvasPositionedItem) => void;
  createNoteNear: (anchor: CanvasPositionedItem) => void;
  /** The canvas's frames, for `#`. */
  frames: WorkspaceFrame[];
  /** Places the card in the frame's first open slot, growing the frame if it is full. */
  moveCardToFrame: (card: CanvasCardRef, frameId: number) => void;
}

const WorkspaceCanvasActionsContext = createContext<WorkspaceCanvasActions | null>(null);

export const WorkspaceCanvasActionsProvider = WorkspaceCanvasActionsContext.Provider;

export const useWorkspaceCanvasActions = (): WorkspaceCanvasActions | null =>
  useContext(WorkspaceCanvasActionsContext);
