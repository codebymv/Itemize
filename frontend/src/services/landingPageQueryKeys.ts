export const landingPageQueryKeys = {
  all: (organizationId: number | null | undefined) => (
    ['landing-pages', organizationId] as const
  ),
  pages: (organizationId: number | null | undefined) => (
    [...landingPageQueryKeys.all(organizationId), 'page'] as const
  ),
  page: (
    organizationId: number | null | undefined,
    params: { status: string; search: string; page: number; limit: number },
  ) => [...landingPageQueryKeys.pages(organizationId), params] as const,
};
