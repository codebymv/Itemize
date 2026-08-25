import { CANVAS_CENTER } from '@/pages/canvas/constants/canvasConstants';

export type CanvasPositionedItem = {
  position_x?: number | null;
  position_y?: number | null;
  width?: number | null;
  height?: number | null;
  canvas_width?: number | null;
  canvas_height?: number | null;
};

type CanvasItemSize = { width: number; height: number };

const HORIZONTAL_STEP = 820;
const VERTICAL_STEP = 690;
const ITEM_GAP = 50;
const DEFAULT_ITEM_SIZE: CanvasItemSize = { width: 600, height: 420 };

const itemSize = (item: CanvasPositionedItem): CanvasItemSize => ({
  width: item.width ?? item.canvas_width ?? DEFAULT_ITEM_SIZE.width,
  height: item.height ?? item.canvas_height ?? DEFAULT_ITEM_SIZE.height,
});

const overlaps = (
  position: { x: number; y: number },
  size: CanvasItemSize,
  item: CanvasPositionedItem,
) => {
  if (!Number.isFinite(item.position_x) || !Number.isFinite(item.position_y)) return false;
  const existing = itemSize(item);
  const x = item.position_x as number;
  const y = item.position_y as number;
  return position.x < x + existing.width + ITEM_GAP
    && position.x + size.width + ITEM_GAP > x
    && position.y < y + existing.height + ITEM_GAP
    && position.y + size.height + ITEM_GAP > y;
};

/** Finds a deterministic, non-overlapping canvas position near the center. */
export function findOpenCanvasPosition(
  items: CanvasPositionedItem[],
  size: CanvasItemSize = DEFAULT_ITEM_SIZE,
  origin: { x: number; y: number } = CANVAS_CENTER,
): { x: number; y: number } {
  for (let ring = 0; ring <= 24; ring += 1) {
    const offsets: Array<[number, number]> = ring === 0
      ? [[0, 0]]
      : [[-ring, 0], [ring, 0], [0, ring], [0, -ring]];

    if (ring > 0) {
      for (let row = -ring; row <= ring; row += 1) {
        for (let column = -ring; column <= ring; column += 1) {
          if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue;
          if ((row === 0 || column === 0) && Math.abs(row + column) === ring) continue;
          offsets.push([column, row]);
        }
      }
    }

    for (const [column, row] of offsets) {
      const candidate = {
        x: origin.x + column * HORIZONTAL_STEP,
        y: origin.y + row * VERTICAL_STEP,
      };
      if (candidate.x < 0 || candidate.y < 0) continue;
      if (!items.some((item) => overlaps(candidate, size, item))) return candidate;
    }
  }

  return {
    x: origin.x + (items.length + 1) * HORIZONTAL_STEP,
    y: origin.y,
  };
}
