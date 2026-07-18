type SearchableWhiteboard = {
  id: number;
  title?: string;
};

export function normalizeWhiteboardSearchRows(
  payload: unknown,
): SearchableWhiteboard[] {
  if (Array.isArray(payload)) {
    return payload as SearchableWhiteboard[];
  }
  if (
    payload
    && typeof payload === 'object'
    && Array.isArray((payload as { whiteboards?: unknown }).whiteboards)
  ) {
    return (payload as { whiteboards: SearchableWhiteboard[] }).whiteboards;
  }
  return [];
}
