import { createContext, useContext } from 'react';
import type { CanvasPositionedItem } from '@/lib/canvasPosition';

/**
 * What the canvas page lets a card do to the canvas around it. Cards also
 * render on Contents and in modals, where there is no canvas; there the
 * context is absent and the `/new list` / `/new note` rows stay hidden.
 */
export interface WorkspaceCanvasActions {
  createListNear: (anchor: CanvasPositionedItem) => void;
  createNoteNear: (anchor: CanvasPositionedItem) => void;
}

const WorkspaceCanvasActionsContext = createContext<WorkspaceCanvasActions | null>(null);

export const WorkspaceCanvasActionsProvider = WorkspaceCanvasActionsContext.Provider;

export const useWorkspaceCanvasActions = (): WorkspaceCanvasActions | null =>
  useContext(WorkspaceCanvasActionsContext);
