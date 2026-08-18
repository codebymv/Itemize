import { describe, expect, it, vi } from 'vitest';
import {
  alignPointerEventWithSketchCanvas,
  layoutPointFromVisualRect,
} from './sketchCanvasPointer';

describe('layoutPointFromVisualRect', () => {
  it('is a no-op when visual size matches layout size', () => {
    expect(
      layoutPointFromVisualRect(150, 90, { left: 100, top: 40, width: 400, height: 300 }, 400, 300),
    ).toEqual({ x: 50, y: 50 });
  });

  it('converts zoomed-in screen pixels back to layout space', () => {
    // Workspace scale 1.25: a 400×300 canvas is visually 500×375.
    // Click 100px right and 80px down from the visual origin.
    expect(
      layoutPointFromVisualRect(
        100,
        80,
        { left: 0, top: 0, width: 500, height: 375 },
        400,
        300,
      ),
    ).toEqual({ x: 80, y: 64 });
  });

  it('converts zoomed-out screen pixels back to layout space', () => {
    expect(
      layoutPointFromVisualRect(
        80,
        64,
        { left: 0, top: 0, width: 320, height: 240 },
        400,
        300,
      ),
    ).toEqual({ x: 100, y: 80 });
  });

  it('maps a zoomed-out click so the stroke is not pulled toward the origin', () => {
    // Workspace scale 0.5: a 400×300 canvas is visually 200×150.
    // Cursor at visual (100, 80) must draw at layout (200, 160), not (100, 80).
    expect(
      layoutPointFromVisualRect(
        100,
        80,
        { left: 0, top: 0, width: 200, height: 150 },
        400,
        300,
      ),
    ).toEqual({ x: 200, y: 160 });
  });

  it('guards against a zero-size visual rect', () => {
    expect(
      layoutPointFromVisualRect(10, 20, { left: 0, top: 0, width: 0, height: 0 }, 400, 300),
    ).toEqual({ x: 10, y: 20 });
  });
});

describe('alignPointerEventWithSketchCanvas', () => {
  it('makes pageX − rect − scroll match layout coordinates under CSS scale', () => {
    const sketchRoot = document.createElement('div');
    sketchRoot.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 20,
        width: 500,
        height: 375,
        right: 540,
        bottom: 395,
        x: 40,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(sketchRoot, 'offsetWidth', { value: 400 });
    Object.defineProperty(sketchRoot, 'offsetHeight', { value: 300 });

    const event = new MouseEvent('pointerdown', { clientX: 140, clientY: 100 }) as PointerEvent;
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(8);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(16);

    alignPointerEventWithSketchCanvas(event, sketchRoot);

    const rect = sketchRoot.getBoundingClientRect();
    expect(event.pageX - rect.left - window.scrollX).toBeCloseTo(80);
    expect(event.pageY - rect.top - window.scrollY).toBeCloseTo(64);
  });
});
