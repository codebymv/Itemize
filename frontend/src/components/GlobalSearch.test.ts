import { describe, expect, it } from 'vitest';
import { normalizeWhiteboardSearchRows } from './globalSearchUtils';

describe('normalizeWhiteboardSearchRows', () => {
  const rows = [{ id: 7, title: 'Cutover whiteboard' }];

  it('accepts the paginated workspace whiteboard envelope', () => {
    expect(normalizeWhiteboardSearchRows({
      whiteboards: rows,
      pagination: { page: 1, totalPages: 1 },
    })).toEqual(rows);
  });

  it('preserves the legacy bare-array response and rejects invalid payloads', () => {
    expect(normalizeWhiteboardSearchRows(rows)).toEqual(rows);
    expect(normalizeWhiteboardSearchRows({ whiteboards: null })).toEqual([]);
  });
});
