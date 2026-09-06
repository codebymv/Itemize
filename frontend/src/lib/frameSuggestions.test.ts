import { describe, expect, it, vi } from 'vitest';
import { frameSuggestions } from './frameSuggestions';

const surface = {
  frames: [
    { id: 1, title: 'Sanchez kitchen', color_value: '#3B82F6' },
    { id: 2, title: 'Spring campaign', color_value: '#10B981' },
    { id: 3, title: 'Kitchen phase 2', color_value: '#F59E0B' },
  ],
  currentFrameId: 1,
  moveTo: vi.fn(),
};

describe('frameSuggestions', () => {
  it('lists every frame for an empty query with the current one last', () => {
    expect(frameSuggestions(surface, '').map((row) => [row.id, row.detail])).toEqual([
      [2, null],
      [3, null],
      [1, 'Current frame'],
    ]);
  });

  it('matches word prefixes and carries the frame colour', () => {
    expect(frameSuggestions(surface, 'kit').map((row) => row.id)).toEqual([3, 1]);
    expect(frameSuggestions(surface, 'phase 2').map((row) => row.id)).toEqual([3]);
    expect(frameSuggestions(surface, 'nothing')).toEqual([]);
    expect(frameSuggestions(surface, 'spr')[0]).toEqual({
      kind: 'frame', id: 2, label: 'Spring campaign', detail: null, initials: '#', color: '#10B981',
    });
  });
});
