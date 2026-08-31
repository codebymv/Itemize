export const templateCatalogQueryKeys = {
  email: (organizationId: number | null) => ['email-templates', organizationId] as const,
  sms: (organizationId: number | null) => ['sms-templates', organizationId] as const,
};
