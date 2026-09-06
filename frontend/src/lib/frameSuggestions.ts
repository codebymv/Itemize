import type { EntitySuggestion } from '@/lib/entitySuggestions';

/** What a card's `#` list needs: the frames on the canvas, which one holds the card, and how to move. */
export interface FrameSurface {
  frames: ReadonlyArray<{ id: number; title: string; color_value: string }>;
  currentFrameId: number | null;
  moveTo: (frameId: number) => void;
}

const words = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Rows for `#`: frames whose title has a word starting with every query word,
 * the card's current frame last so the first Enter always moves somewhere new.
 */
export const frameSuggestions = (surface: FrameSurface, query: string): EntitySuggestion[] => {
  const needles = words(query);
  return surface.frames
    .filter((frame) => {
      if (needles.length === 0) return true;
      const haystack = words(frame.title);
      return needles.every((needle) => haystack.some((word) => word.startsWith(needle)));
    })
    .map((frame) => ({
      kind: 'frame' as const,
      id: frame.id,
      label: frame.title,
      detail: frame.id === surface.currentFrameId ? 'Current frame' : null,
      initials: '#',
      color: frame.color_value,
    }))
    .sort((left, right) => Number(left.detail !== null) - Number(right.detail !== null));
};
