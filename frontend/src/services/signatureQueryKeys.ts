export const signatureQueryKeys = {
  templates: (organizationId: number | null) => ['signature-templates', organizationId] as const,
  template: (organizationId: number | null, templateId: number | null) => [
    'signature-template-editor',
    organizationId,
    templateId,
  ] as const,
  documents: (organizationId: number | null) => ['signature-documents', organizationId] as const,
  documentQueue: (
    organizationId: number | null,
    query: { search: string; status: string; page: number; limit: number },
  ) => ['signature-documents', organizationId, query] as const,
  document: (organizationId: number | null, documentId: number | null) => [
    'signature-document-editor',
    organizationId,
    documentId,
  ] as const,
};
