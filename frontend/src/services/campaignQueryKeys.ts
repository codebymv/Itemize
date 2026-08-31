export const campaignQueryKeys = {
  queues: (organizationId: number | null) => ['campaigns', organizationId] as const,
  queue: (
    organizationId: number | null,
    query: { search: string; status: string; page: number; limit: number },
  ) => ['campaigns', organizationId, query] as const,
  bootstrap: (organizationId: number | null, campaignId: number | null) => [
    'campaign-editor-bootstrap',
    organizationId,
    campaignId,
  ] as const,
  audiencePreview: (organizationId: number | null, campaignId: number | null) => [
    'campaign-audience-preview',
    organizationId,
    campaignId,
  ] as const,
  recipients: (organizationId: number | null, campaignId: number | null) => [
    'campaign-recipients',
    organizationId,
    campaignId,
  ] as const,
};
