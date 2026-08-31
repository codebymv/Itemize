import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { EmailTemplateBrowserDialog } from './EmailTemplateBrowserDialog';
import { toBadgeStatus } from '@/lib/statusVisuals';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';
import { getEmailTemplates, type EmailTemplate } from '@/services/emailApi';
import { templateCatalogQueryKeys } from '@/services/templateCatalogQueryKeys';

const PAGE_SIZE = 20;

type BrowserTemplate = EmailTemplate & {
  status: { label: string; className: string };
  meta?: ReactNode;
};

interface OrganizationEmailTemplateBrowserDialogProps {
  organizationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  activeOnly?: boolean;
  selectedId?: number | null;
  onSelect: (template: EmailTemplate) => void | boolean;
  renderPreview?: (template: EmailTemplate) => ReactNode;
  onEdit?: (template: EmailTemplate) => void;
  getMeta?: (template: EmailTemplate) => ReactNode;
  headerAction?: ReactNode;
  footerAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function OrganizationEmailTemplateBrowserDialog({
  organizationId,
  open,
  onOpenChange,
  title,
  description,
  activeOnly = false,
  selectedId,
  onSelect,
  renderPreview,
  onEdit,
  getMeta,
  headerAction,
  footerAction,
  emptyTitle,
  emptyDescription,
}: OrganizationEmailTemplateBrowserDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (open) return;
    setSearchQuery('');
    setDebouncedSearch('');
    setCategory('all');
  }, [open]);

  const query = useInfiniteQuery({
    queryKey: templateCatalogQueryKeys.emailPicker(organizationId, {
      search: debouncedSearch,
      category,
      activeOnly,
    }),
    queryFn: ({ pageParam, signal }) => getEmailTemplates(organizationId, {
      page: pageParam,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      category: category === 'all' ? undefined : category,
      is_active: activeOnly ? true : undefined,
    }, signal),
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.pagination.page < lastPage.pagination.totalPages
      ? lastPage.pagination.page + 1
      : undefined,
    enabled: open,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });

  const items = useMemo(() => {
    const byId = new Map<number, BrowserTemplate>();
    for (const page of query.data?.pages ?? []) {
      for (const template of page.templates) {
        byId.set(template.id, {
          ...template,
          status: toBadgeStatus(getCatalogStatusVisual(template.is_active)),
          ...(getMeta ? { meta: getMeta(template) } : {}),
        });
      }
    }
    return [...byId.values()];
  }, [getMeta, query.data?.pages]);
  const firstPage = query.data?.pages[0];
  const categories = (firstPage?.categories ?? []).map(item => item.category);

  return <EmailTemplateBrowserDialog
    open={open}
    onOpenChange={onOpenChange}
    title={title}
    description={description}
    items={items}
    loading={query.isPending}
    error={query.isError && !query.data}
    onRetry={() => void query.refetch()}
    selectedId={selectedId}
    onSelect={onSelect}
    renderPreview={renderPreview}
    onEdit={onEdit}
    headerAction={headerAction}
    footerAction={footerAction}
    emptyTitle={emptyTitle}
    emptyDescription={emptyDescription}
    remoteQuery={{
      searchQuery,
      category,
      categories,
      total: firstPage?.pagination.total ?? 0,
      hasNextPage: query.hasNextPage,
      loadingMore: query.isFetchingNextPage,
      onSearchQueryChange: setSearchQuery,
      onCategoryChange: setCategory,
      onLoadMore: () => void query.fetchNextPage(),
    }}
  />;
}

export default OrganizationEmailTemplateBrowserDialog;
