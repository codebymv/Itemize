import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useToast } from '@/hooks/use-toast';
import { cardsInFrame, frameForCard, shiftedPosition } from '@/lib/frameContainment';
import { isDefaultAccent } from '@/lib/cardAccent';
import logger from '@/lib/logger';
import type { CanvasPositionUpdate } from '@/services/api';
import {
  createWorkspaceFrameViaGraphql,
  deleteWorkspaceFrameViaGraphql,
  updateWorkspaceFrameViaGraphql,
  type WorkspaceFramePayload,
} from '@/services/workspaceFramesGraphql';
import { runWorkspaceCreationAttempt } from '@/services/workspaceMutationReconciliation';
import type { List, Note, Vault, Whiteboard, Wireframe, WorkspaceFrame } from '@/types';

interface CanvasCards {
  lists: List[];
  notes: Note[];
  whiteboards: Whiteboard[];
  wireframes: Wireframe[];
  vaults: Vault[];
}

interface CanvasCardSetters {
  setLists: Dispatch<SetStateAction<List[]>>;
  setNotes: Dispatch<SetStateAction<Note[]>>;
  setWhiteboards: Dispatch<SetStateAction<Whiteboard[]>>;
  setWireframes: Dispatch<SetStateAction<Wireframe[]>>;
  setVaults: Dispatch<SetStateAction<Vault[]>>;
}

export interface FrameContactBinding {
  contact_id: number | null;
  contact_name: string | null;
}

/** How the page writes a client binding onto each card type (vaults have none). */
export interface CardContactUpdaters {
  list: (list: List, binding: FrameContactBinding) => unknown;
  note: (noteId: number, binding: FrameContactBinding) => unknown;
  whiteboard: (whiteboardId: number, binding: FrameContactBinding) => unknown;
  wireframe: (wireframeId: number, binding: FrameContactBinding) => unknown;
}

/** How the page writes a category onto each card type (lists call it `type`). */
export interface CardCategoryUpdaters {
  list: (list: List, category: string) => unknown;
  note: (noteId: number, category: string) => unknown;
  whiteboard: (whiteboardId: number, category: string) => unknown;
  wireframe: (wireframeId: number, category: string) => unknown;
}

/** How the page writes a colour onto each card type. */
export interface CardColorUpdaters {
  list: (list: List, color: string) => unknown;
  note: (noteId: number, color: string) => unknown;
  whiteboard: (whiteboardId: number, color: string) => unknown;
  wireframe: (wireframeId: number, color: string) => unknown;
  vault: (vaultId: number, color: string) => unknown;
}

const DEFAULT_CATEGORY = 'General';
const hasOwnCategory = (category: string | null | undefined): boolean =>
  Boolean(category) && category !== DEFAULT_CATEGORY;

interface UseCanvasFramesOptions {
  frames: WorkspaceFrame[];
  setFrames: Dispatch<SetStateAction<WorkspaceFrame[]>>;
  cards: CanvasCards;
  setters: CanvasCardSetters;
  enqueuePositionUpdate: (update: CanvasPositionUpdate) => void;
  contactUpdaters?: CardContactUpdaters;
  categoryUpdaters?: CardCategoryUpdaters;
  colorUpdaters?: CardColorUpdaters;
}

const DEFAULT_FRAME_SIZE = { width: 1400, height: 900 };

/**
 * Frame lifecycle for the canvas page. Moving a frame moves the cards whose
 * centres it contains: their state updates at once and every position joins
 * the same debounced batch as the frame's, so one mutation carries the move.
 */
export function useCanvasFrames({
  frames,
  setFrames,
  cards,
  setters,
  enqueuePositionUpdate,
  contactUpdaters,
  categoryUpdaters,
  colorUpdaters,
}: UseCanvasFramesOptions) {
  const { toast } = useToast();
  // The frame that was just created opens with its title editable, once.
  const [editingFrameId, setEditingFrameId] = useState<number | null>(null);

  const createFrameAt = useCallback(async (position: { x: number; y: number }) => {
    const payload: WorkspaceFramePayload = {
      position_x: position.x,
      position_y: position.y,
      width: DEFAULT_FRAME_SIZE.width,
      height: DEFAULT_FRAME_SIZE.height,
    };
    try {
      const frame = await runWorkspaceCreationAttempt(
        'frame',
        { ...payload, at: Date.now() },
        (idempotencyKey) => createWorkspaceFrameViaGraphql(payload, idempotencyKey),
      );
      setFrames((current) => (current.some((entry) => entry.id === frame.id) ? current : [...current, frame]));
      setEditingFrameId(frame.id);
      return frame;
    } catch (error) {
      logger.error('Failed to create frame:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not create the frame. Please try again.',
        variant: 'destructive',
      });
      return null;
    }
  }, [setFrames, toast]);

  /**
   * A frame's client is the client of everything inside it: binding writes the
   * badge onto every contained card; unlinking clears only the cards that
   * carried that same client, so a card's own different binding survives.
   */
  const propagateContact = useCallback((frame: WorkspaceFrame, binding: FrameContactBinding) => {
    if (!contactUpdaters) return;
    const shouldChange = (card: { contact_id?: number | null }) =>
      binding.contact_id !== null
        ? card.contact_id !== binding.contact_id
        : card.contact_id !== null && card.contact_id !== undefined && card.contact_id === frame.contact_id;
    for (const list of cardsInFrame(frame, cards.lists)) {
      if (shouldChange(list)) void contactUpdaters.list(list, binding);
    }
    for (const note of cardsInFrame(frame, cards.notes)) {
      if (shouldChange(note)) void contactUpdaters.note(note.id, binding);
    }
    for (const whiteboard of cardsInFrame(frame, cards.whiteboards)) {
      if (shouldChange(whiteboard)) void contactUpdaters.whiteboard(whiteboard.id, binding);
    }
    for (const wireframe of cardsInFrame(frame, cards.wireframes)) {
      if (shouldChange(wireframe)) void contactUpdaters.wireframe(wireframe.id, binding);
    }
  }, [cards, contactUpdaters]);

  /** Setting a frame's category writes it onto every card inside; clearing it pushes nothing. */
  const propagateCategory = useCallback((frame: WorkspaceFrame, category: string | null) => {
    if (!categoryUpdaters || category === null) return;
    for (const list of cardsInFrame(frame, cards.lists)) {
      if (list.type !== category) void categoryUpdaters.list(list, category);
    }
    for (const note of cardsInFrame(frame, cards.notes)) {
      if (note.category !== category) void categoryUpdaters.note(note.id, category);
    }
    for (const whiteboard of cardsInFrame(frame, cards.whiteboards)) {
      if (whiteboard.category !== category) void categoryUpdaters.whiteboard(whiteboard.id, category);
    }
    for (const wireframe of cardsInFrame(frame, cards.wireframes)) {
      if (wireframe.category !== category) void categoryUpdaters.wireframe(wireframe.id, category);
    }
  }, [cards, categoryUpdaters]);

  /** A frame's colour is the colour of everything inside it: changing it recolours every contained card. */
  const propagateColor = useCallback((frame: WorkspaceFrame, color: string) => {
    if (!colorUpdaters) return;
    for (const list of cardsInFrame(frame, cards.lists)) {
      if (list.color_value !== color) void colorUpdaters.list(list, color);
    }
    for (const note of cardsInFrame(frame, cards.notes)) {
      if (note.color_value !== color) void colorUpdaters.note(note.id, color);
    }
    for (const whiteboard of cardsInFrame(frame, cards.whiteboards)) {
      if (whiteboard.color_value !== color) void colorUpdaters.whiteboard(whiteboard.id, color);
    }
    for (const wireframe of cardsInFrame(frame, cards.wireframes)) {
      if (wireframe.color_value !== color) void colorUpdaters.wireframe(wireframe.id, color);
    }
    for (const vault of cardsInFrame(frame, cards.vaults)) {
      if (vault.color_value !== color) void colorUpdaters.vault(vault.id, color);
    }
  }, [cards, colorUpdaters]);

  /**
   * A card that lands in a frame takes what it lacks: the frame's client if
   * it has none, the frame's category if it is still on the default, the
   * frame's colour if it still wears the default blue. Called with the
   * card's new position after a drop or a `#` move.
   */
  const inheritFrameContact = useCallback((
    type: 'list' | 'note' | 'whiteboard' | 'wireframe',
    card: {
      id: number;
      contact_id?: number | null;
      type?: string;
      category?: string;
      color_value?: string | null;
      width?: number | null;
      height?: number | null;
      canvas_width?: number | null;
      canvas_height?: number | null;
    },
    position: { x: number; y: number },
  ) => {
    const frame = frameForCard(frames, { ...card, position_x: position.x, position_y: position.y });
    if (!frame) return;
    const list = type === 'list' ? cards.lists.find((entry) => entry.id === card.id) : undefined;
    if (contactUpdaters && frame.contact_id !== null && (card.contact_id === null || card.contact_id === undefined)) {
      const binding = { contact_id: frame.contact_id, contact_name: frame.contact_name };
      if (type === 'list') {
        if (list) void contactUpdaters.list(list, binding);
      } else {
        void contactUpdaters[type](card.id, binding);
      }
    }
    const ownCategory = type === 'list' ? card.type : card.category;
    if (categoryUpdaters && frame.category !== null && !hasOwnCategory(ownCategory) && frame.category !== ownCategory) {
      if (type === 'list') {
        if (list) void categoryUpdaters.list(list, frame.category);
      } else {
        void categoryUpdaters[type](card.id, frame.category);
      }
    }
    if (colorUpdaters && isDefaultAccent(card.color_value) && frame.color_value !== card.color_value) {
      if (type === 'list') {
        if (list) void colorUpdaters.list(list, frame.color_value);
      } else {
        void colorUpdaters[type](card.id, frame.color_value);
      }
    }
  }, [cards.lists, categoryUpdaters, colorUpdaters, contactUpdaters, frames]);

  const updateFrame = useCallback(async (
    frameId: number,
    updatedData: Partial<Pick<WorkspaceFrame, 'title' | 'category' | 'color_value' | 'contact_id' | 'contact_name'>>,
  ) => {
    if (editingFrameId === frameId) setEditingFrameId(null);
    const previous = frames.find((frame) => frame.id === frameId);
    // Optimistic: the chip and title read from state; the server's row replaces it.
    setFrames((current) => current.map((frame) => (frame.id === frameId ? { ...frame, ...updatedData } : frame)));
    try {
      const payload: WorkspaceFramePayload = {
        ...(updatedData.title === undefined ? {} : { title: updatedData.title }),
        ...(updatedData.category === undefined ? {} : { category: updatedData.category }),
        ...(updatedData.color_value === undefined ? {} : { color_value: updatedData.color_value }),
        ...(updatedData.contact_id === undefined ? {} : { contact_id: updatedData.contact_id }),
      };
      const saved = await updateWorkspaceFrameViaGraphql(frameId, payload);
      setFrames((current) => current.map((frame) => (frame.id === frameId ? saved : frame)));
      if (updatedData.contact_id !== undefined && previous) {
        propagateContact(previous, { contact_id: saved.contact_id, contact_name: saved.contact_name });
      }
      if (updatedData.category !== undefined && previous) {
        propagateCategory(previous, saved.category);
      }
      if (updatedData.color_value !== undefined && previous) {
        propagateColor(previous, saved.color_value);
      }
      return saved;
    } catch (error) {
      logger.error('Failed to update frame:', error);
      if (previous) setFrames((current) => current.map((frame) => (frame.id === frameId ? previous : frame)));
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not save the frame. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [editingFrameId, frames, propagateCategory, propagateColor, propagateContact, setFrames, toast]);

  const deleteFrame = useCallback(async (frameId: number) => {
    try {
      await deleteWorkspaceFrameViaGraphql(frameId);
      setFrames((current) => current.filter((frame) => frame.id !== frameId));
      toast({ title: 'Frame deleted', description: 'The cards inside stayed on the canvas.' });
      return true;
    } catch (error) {
      logger.error('Failed to delete frame:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not delete the frame. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [setFrames, toast]);

  const moveFrame = useCallback((
    frameId: number,
    position: { x: number; y: number },
    size?: { width: number; height: number },
  ) => {
    const frame = frames.find((entry) => entry.id === frameId);
    if (!frame) return;
    const delta = { dx: position.x - frame.position_x, dy: position.y - frame.position_y };
    const nextFrame = { ...frame, position_x: position.x, position_y: position.y, ...(size ?? {}) };
    setFrames((current) => current.map((entry) => (entry.id === frameId ? nextFrame : entry)));
    enqueuePositionUpdate({
      type: 'frame',
      id: frameId,
      position_x: position.x,
      position_y: position.y,
      width: nextFrame.width,
      height: nextFrame.height,
    });

    // A resize leaves the cards alone; a move carries the ones that were inside.
    if (delta.dx === 0 && delta.dy === 0) return;
    const move = <T extends { id: number | string; position_x?: number | null; position_y?: number | null }>(
      type: CanvasPositionUpdate['type'],
      items: T[],
      set: Dispatch<SetStateAction<T[]>>,
    ) => {
      const inside = cardsInFrame(frame, items);
      if (inside.length === 0) return;
      const moved = new Map(inside.map((card) => [card.id, shiftedPosition(card, delta)]));
      set((current) => current.map((card) => {
        const next = moved.get(card.id);
        return next ? { ...card, position_x: next.x, position_y: next.y } : card;
      }));
      for (const card of inside) {
        const next = moved.get(card.id);
        if (next) enqueuePositionUpdate({ type, id: card.id, position_x: next.x, position_y: next.y });
      }
    };
    move('list', cards.lists, setters.setLists);
    move('note', cards.notes, setters.setNotes);
    move('whiteboard', cards.whiteboards, setters.setWhiteboards);
    move('wireframe', cards.wireframes, setters.setWireframes);
    move('vault', cards.vaults, setters.setVaults);
  }, [cards, enqueuePositionUpdate, frames, setFrames, setters]);

  return { createFrameAt, updateFrame, deleteFrame, moveFrame, inheritFrameContact, editingFrameId };
}
