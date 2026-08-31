export const segmentQueryKeys = {
  catalog: (organizationId: number | null) => ['segment-catalog', organizationId] as const,
  page: (
    organizationId: number | null,
    query: { search: string; status: string; page: number; limit: number },
  ) => [...segmentQueryKeys.catalog(organizationId), query] as const,
  editor: (organizationId: number | null, segmentId: number | null) => [
    'segment-editor-bootstrap',
    organizationId,
    segmentId,
  ] as const,
};
