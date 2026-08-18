import { normalizeWhiteboardCanvasData, sanitizeWhiteboardPaths } from './whiteboardCanvasData';

describe('normalizeWhiteboardCanvasData', () => {
  it('returns path arrays unchanged', () => {
    const paths = [{ drawMode: true, paths: [] }];
    expect(normalizeWhiteboardCanvasData(paths)).toEqual(paths);
  });

  it('unwraps {paths, shapes} records instead of wiping them', () => {
    const paths = [{ drawMode: true, strokeColor: '#000' }];
    expect(normalizeWhiteboardCanvasData({ paths, shapes: [] })).toEqual(paths);
  });

  it('parses JSON strings', () => {
    expect(normalizeWhiteboardCanvasData('[]')).toEqual([]);
  });

  it('does not coerce unknown objects to an empty canvas', () => {
    expect(() => normalizeWhiteboardCanvasData({ foo: 1 })).toThrow(
      'Whiteboard canvas data must be a path array',
    );
  });
});

describe('sanitizeWhiteboardPaths', () => {
  it('keeps eraser strokes as drawMode false', () => {
    expect(
      sanitizeWhiteboardPaths([
        {
          drawMode: false,
          strokeColor: '#000000',
          strokeWidth: 8,
          paths: [{ x: 1, y: 2 }],
        },
      ]),
    ).toEqual([
      {
        drawMode: false,
        strokeColor: '#000000',
        strokeWidth: 8,
        paths: [{ x: 1, y: 2 }],
      },
    ]);
  });

  it('fills missing pen metadata without forcing eraser strokes to ink', () => {
    expect(
      sanitizeWhiteboardPaths([{ paths: [{ x: 0, y: 0 }] }]),
    ).toEqual([
      {
        drawMode: true,
        strokeColor: '#2563eb',
        strokeWidth: 2,
        paths: [{ x: 0, y: 0 }],
      },
    ]);
  });

  it('drops non-point path entries', () => {
    expect(
      sanitizeWhiteboardPaths([
        { drawMode: true, strokeColor: '#000', strokeWidth: 2, paths: [{ x: 1, y: 1 }, null, { x: 'a' }] },
      ]),
    ).toEqual([
      { drawMode: true, strokeColor: '#000', strokeWidth: 2, paths: [{ x: 1, y: 1 }] },
    ]);
  });

  it('rejects non-arrays instead of returning an empty canvas', () => {
    expect(() => sanitizeWhiteboardPaths({ paths: [] })).toThrow(
      'Whiteboard canvas data must be a path array',
    );
  });
});
