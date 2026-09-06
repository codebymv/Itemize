import { describe, expect, it } from 'vitest';
import { buildCanvasFocusPath, parseCanvasFocus } from './canvasFocus';

describe('canvasFocus', () => {
  it('round-trips a focus target through the route', () => {
    const path = buildCanvasFocusPath('note', 42);
    expect(path).toBe('/canvas?focus=note:42');
    const search = new URLSearchParams(path.split('?')[1]);
    expect(parseCanvasFocus(search.get('focus'))).toEqual({ type: 'note', id: 42 });
  });

  it('accepts string ids so list ids can be passed as stored', () => {
    expect(parseCanvasFocus(buildCanvasFocusPath('list', '7').split('=')[1])).toEqual({
      type: 'list',
      id: 7,
    });
  });

  it('rejects unknown types, non-positive ids, and extra segments', () => {
    expect(parseCanvasFocus('vault:3')).toBeNull();
    expect(parseCanvasFocus('list:0')).toBeNull();
    expect(parseCanvasFocus('list:-2')).toBeNull();
    expect(parseCanvasFocus('list:abc')).toBeNull();
    expect(parseCanvasFocus('list:3:extra')).toBeNull();
    expect(parseCanvasFocus('')).toBeNull();
    expect(parseCanvasFocus(null)).toBeNull();
    expect(parseCanvasFocus(undefined)).toBeNull();
  });
});
