import { normalizeWhiteboardCanvasData } from './whiteboardCanvasData';

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
