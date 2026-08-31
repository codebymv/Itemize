export const segmentQueryKeys = {
  catalog: (organizationId: number | null) => ['segment-catalog', organizationId] as const,
  editor: (organizationId: number | null, segmentId: number | null) => [
    'segment-editor-bootstrap',
    organizationId,
    segmentId,
  ] as const,
};
