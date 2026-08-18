export function normalizeWhiteboardCanvasData(value: unknown): unknown[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed) as unknown;
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (
    parsed
    && typeof parsed === 'object'
    && Array.isArray((parsed as { paths?: unknown }).paths)
  ) {
    return (parsed as { paths: unknown[] }).paths;
  }
  throw new Error('Whiteboard canvas data must be a path array');
}
