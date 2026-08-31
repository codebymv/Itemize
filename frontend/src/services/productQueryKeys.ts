export const productQueryKeys = {
  all: (organizationId: number | null) => ['products', organizationId] as const,
  page: (
    organizationId: number | null,
    query: { search: string; status: string; type: string; page: number; limit: number },
  ) => [...productQueryKeys.all(organizationId), query] as const,
  picker: (organizationId: number | null, search: string) =>
    [...productQueryKeys.all(organizationId), 'picker', search] as const,
};
