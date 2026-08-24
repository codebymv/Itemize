import { describe, expect, it } from 'vitest';
import { findOpenCanvasPosition } from './canvasPosition';

describe('findOpenCanvasPosition', () => {
  it('starts new work at the canvas center', () => {
    expect(findOpenCanvasPosition([])).toEqual({ x: 2000, y: 2000 });
  });

  it('places mixed-size content without overlapping existing cards', () => {
    const occupied = [{
      position_x: 2000,
      position_y: 2000,
      canvas_width: 750,
      canvas_height: 620,
    }];

    const next = findOpenCanvasPosition(occupied, { width: 600, height: 600 });

    expect(next).toEqual({ x: 1180, y: 2000 });
  });

  it('ignores records without usable coordinates', () => {
    expect(findOpenCanvasPosition([{ position_x: undefined, position_y: undefined }]))
      .toEqual({ x: 2000, y: 2000 });
  });
});
