import type { CanvasPositionedItem } from '@/lib/canvasPosition';

/**
 * Frame membership is geometry, never a stored link: a card belongs to the
 * frame whose rectangle contains the card's centre. Drag a card in and it
 * joins; drag it out and it leaves; drag the frame and its cards follow.
 */
export interface FrameRect {
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export const DEFAULT_CARD_SIZE = { width: 600, height: 420 };

export const cardCenter = (card: CanvasPositionedItem): { x: number; y: number } | null => {
  if (!Number.isFinite(card.position_x) || !Number.isFinite(card.position_y)) return null;
  const width = card.width ?? card.canvas_width ?? DEFAULT_CARD_SIZE.width;
  const height = card.height ?? card.canvas_height ?? DEFAULT_CARD_SIZE.height;
  return {
    x: (card.position_x as number) + width / 2,
    y: (card.position_y as number) + height / 2,
  };
};

export const containsCard = (frame: FrameRect, card: CanvasPositionedItem): boolean => {
  const center = cardCenter(card);
  if (!center) return false;
  return center.x >= frame.position_x
    && center.x <= frame.position_x + frame.width
    && center.y >= frame.position_y
    && center.y <= frame.position_y + frame.height;
};

export const cardsInFrame = <T extends CanvasPositionedItem>(frame: FrameRect, cards: readonly T[]): T[] =>
  cards.filter((card) => containsCard(frame, card));

/** The frame a card sits in, when exactly one contains its centre (frames may overlap; the topmost wins). */
export const frameForCard = <F extends FrameRect & { z_index?: number; id: number }>(
  frames: readonly F[],
  card: CanvasPositionedItem,
): F | null => {
  const candidates = frames.filter((frame) => containsCard(frame, card));
  if (candidates.length === 0) return null;
  return candidates.reduce((top, frame) =>
    (frame.z_index ?? 0) > (top.z_index ?? 0) || ((frame.z_index ?? 0) === (top.z_index ?? 0) && frame.id > top.id)
      ? frame
      : top);
};

export interface PositionDelta {
  dx: number;
  dy: number;
}

export const shiftedPosition = (
  card: CanvasPositionedItem,
  delta: PositionDelta,
): { x: number; y: number } => ({
  x: (card.position_x ?? 0) + delta.dx,
  y: (card.position_y ?? 0) + delta.dy,
});

/** The first open slot inside a frame for a card of `size`, scanning rows from the top-left. */
export const openSlotInFrame = (
  frame: FrameRect,
  occupants: readonly CanvasPositionedItem[],
  size: { width: number; height: number },
  gap = 24,
  headerHeight = 48,
): { x: number; y: number } | null => {
  const stepX = size.width + gap;
  const stepY = size.height + gap;
  const right = frame.position_x + frame.width - size.width - gap;
  const bottom = frame.position_y + frame.height - size.height - gap;
  for (let y = frame.position_y + headerHeight + gap; y <= bottom; y += stepY) {
    for (let x = frame.position_x + gap; x <= right; x += stepX) {
      const collides = occupants.some((card) => {
        if (!Number.isFinite(card.position_x) || !Number.isFinite(card.position_y)) return false;
        const cardWidth = card.width ?? card.canvas_width ?? DEFAULT_CARD_SIZE.width;
        const cardHeight = card.height ?? card.canvas_height ?? DEFAULT_CARD_SIZE.height;
        return x < (card.position_x as number) + cardWidth + gap
          && x + size.width + gap > (card.position_x as number)
          && y < (card.position_y as number) + cardHeight + gap
          && y + size.height + gap > (card.position_y as number);
      });
      if (!collides) return { x, y };
    }
  }
  return null;
};
