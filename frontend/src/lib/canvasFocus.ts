export type CanvasFocusType = 'list' | 'note' | 'whiteboard' | 'wireframe' | 'frame';

export interface CanvasFocusTarget {
  type: CanvasFocusType;
  id: number;
}

const FOCUS_TYPES: readonly CanvasFocusType[] = ['list', 'note', 'whiteboard', 'wireframe', 'frame'];

export const CANVAS_FOCUS_PARAM = 'focus';

/** Builds the canvas route that opens with one card centered, e.g. `/canvas?focus=list:12`. */
export const buildCanvasFocusPath = (type: CanvasFocusType, id: number | string): string =>
  `/canvas?${CANVAS_FOCUS_PARAM}=${type}:${id}`;

/** Parses the `focus` query value; anything malformed yields null rather than a partial target. */
export const parseCanvasFocus = (value: string | null | undefined): CanvasFocusTarget | null => {
  if (!value) return null;
  const [type, rawId, ...rest] = value.split(':');
  if (rest.length > 0) return null;
  if (!FOCUS_TYPES.includes(type as CanvasFocusType)) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return { type: type as CanvasFocusType, id };
};
