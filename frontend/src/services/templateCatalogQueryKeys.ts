export const templateCatalogQueryKeys = {
  email: (organizationId: number | null) => ['email-templates', organizationId] as const,
  emailPage: (
    organizationId: number | null,
    query: { search: string; category: string; status: string; page: number; limit: number },
  ) => [...templateCatalogQueryKeys.email(organizationId), query] as const,
  emailPicker: (
    organizationId: number | null,
    query: { search: string; category: string; activeOnly: boolean },
  ) => [...templateCatalogQueryKeys.email(organizationId), 'picker', query] as const,
  sms: (organizationId: number | null) => ['sms-templates', organizationId] as const,
  smsPage: (
    organizationId: number | null,
    query: { search: string; category: string; status: string; page: number; limit: number },
  ) => [...templateCatalogQueryKeys.sms(organizationId), query] as const,
};
