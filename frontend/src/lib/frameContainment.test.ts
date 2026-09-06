import { describe, expect, it } from 'vitest';
import {
  cardCenter,
  cardsInFrame,
  containsCard,
  frameForCard,
  openSlotInFrame,
  shiftedPosition,
} from './frameContainment';

const frame = { id: 1, position_x: 1000, position_y: 1000, width: 1400, height: 900, z_index: 0 };

describe('frameContainment', () => {
  it('judges membership by the card centre, using canvas_* sizes when width is absent', () => {
    expect(cardCenter({ position_x: 100, position_y: 100, width: 200, height: 100 })).toEqual({ x: 200, y: 150 });
    expect(cardCenter({ position_x: 0, position_y: 0, canvas_width: 800, canvas_height: 600 })).toEqual({ x: 400, y: 300 });
    expect(cardCenter({ position_x: null, position_y: 4 })).toBeNull();

    // Straddling the edge counts once the centre is inside.
    expect(containsCard(frame, { position_x: 900, position_y: 1100, width: 300, height: 200 })).toBe(true);
    expect(containsCard(frame, { position_x: 600, position_y: 1100, width: 300, height: 200 })).toBe(false);
    expect(containsCard(frame, { position_x: 1200, position_y: 1200 })).toBe(true); // default 600x420
  });

  it('collects contained cards and shifts them by the frame delta', () => {
    const inside = { id: 'a', position_x: 1100, position_y: 1200, width: 300, height: 200 };
    const outside = { id: 'b', position_x: 3000, position_y: 3000, width: 300, height: 200 };
    expect(cardsInFrame(frame, [inside, outside])).toEqual([inside]);
    expect(shiftedPosition(inside, { dx: 50, dy: -20 })).toEqual({ x: 1150, y: 1180 });
  });

  it('picks the topmost frame when frames overlap', () => {
    const above = { ...frame, id: 2, z_index: 1 };
    const card = { position_x: 1100, position_y: 1200, width: 300, height: 200 };
    expect(frameForCard([frame, above], card)?.id).toBe(2);
    expect(frameForCard([frame, { ...frame, id: 3 }], card)?.id).toBe(3);
    expect(frameForCard([frame], { position_x: 0, position_y: 0 })).toBeNull();
  });

  it('finds the first open slot below the header and skips occupied ones', () => {
    const size = { width: 600, height: 420 };
    expect(openSlotInFrame(frame, [], size)).toEqual({ x: 1024, y: 1072 });
    const occupant = { position_x: 1024, position_y: 1072, width: 600, height: 420 };
    expect(openSlotInFrame(frame, [occupant], size)).toEqual({ x: 1648, y: 1072 });
    expect(openSlotInFrame({ ...frame, width: 500, height: 300 }, [], size)).toBeNull();
  });
});
