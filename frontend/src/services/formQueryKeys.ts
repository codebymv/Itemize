export const formQueryKeys = {
  all: (organizationId: number | null | undefined) => (
    ['forms', organizationId] as const
  ),
  pages: (organizationId: number | null | undefined) => (
    [...formQueryKeys.all(organizationId), 'page'] as const
  ),
  page: (
    organizationId: number | null | undefined,
    params: { status: string; search: string; page: number; limit: number },
  ) => [...formQueryKeys.pages(organizationId), params] as const,
};
