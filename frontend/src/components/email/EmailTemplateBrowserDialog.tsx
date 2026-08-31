import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Eye, FileText, Loader2, Mail, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchField } from '@/components/ui/search-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { cn } from '@/lib/utils';

export interface EmailTemplateBrowserItem {
  id: number | string;
  name: string;
  subject: string;
  category?: string | null;
  status?: { label: string; className?: string };

  meta?: ReactNode;
}

interface EmailTemplateBrowserDialogProps<T extends EmailTemplateBrowserItem> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  items: T[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  selectedId?: T['id'] | null;
  onSelect: (item: T) => void | boolean;
  renderPreview?: (item: T) => ReactNode;
  onEdit?: (item: T) => void;
  headerAction?: ReactNode;
  footerAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  remoteQuery?: {
    searchQuery: string;
    category: string;
    categories: string[];
    total: number;
    hasNextPage: boolean;
    loadingMore?: boolean;
    onSearchQueryChange: (value: string) => void;
    onCategoryChange: (value: string) => void;
    onLoadMore: () => void;
  };
}

const categoryLabel = (value: string): string => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

export function EmailTemplateBrowserDialog<T extends EmailTemplateBrowserItem>({
  open,
  onOpenChange,
  title = 'Choose a template',
  description = 'Select a reusable email design.',
  items,
  loading = false,
  error = false,
  onRetry,
  selectedId,
  onSelect,
  renderPreview,
  onEdit,
  headerAction,
  footerAction,
  emptyTitle = 'No email templates yet',
  emptyDescription = 'Create a template or compose this email from scratch.',
  remoteQuery,
}: EmailTemplateBrowserDialogProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [previewId, setPreviewId] = useState<T['id'] | null>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setCategory('all');
      setPreviewId(null);
    }
  }, [open]);

  const activeSearchQuery = remoteQuery?.searchQuery ?? searchQuery;
  const activeCategory = remoteQuery?.category ?? category;

  const localCategories = useMemo(() => Array.from(new Set(items
    .map(item => item.category?.trim())
    .filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right)), [items]);
  const categories = remoteQuery?.categories ?? localCategories;

  const filteredItems = useMemo(() => {
    if (remoteQuery) return items;
    const query = activeSearchQuery.trim().toLowerCase();
    return items.filter(item => {
      const matchesQuery = !query
        || item.name.toLowerCase().includes(query)
        || item.subject.toLowerCase().includes(query);
      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
      return matchesQuery && matchesCategory;
    });
  }, [activeCategory, activeSearchQuery, items, remoteQuery]);

  const previewItem = items.find(item => item.id === previewId) ?? null;
  const hasQuery = Boolean(activeSearchQuery.trim()) || activeCategory !== 'all';

  const clearQuery = () => {
    if (remoteQuery) {
      remoteQuery.onSearchQueryChange('');
      remoteQuery.onCategoryChange('all');
      return;
    }
    setSearchQuery('');
    setCategory('all');
  };

  const choose = (item: T) => {
    if (onSelect(item) === false) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className={cn(
        'flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 p-0 sm:h-[90dvh] sm:w-[94vw] sm:rounded-xl sm:border',
        previewItem ? 'sm:max-w-6xl' : 'sm:max-w-3xl',
      )}>
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base sm:text-lg">{title}</DialogTitle>
              <DialogDescription className="truncate text-left text-xs sm:text-sm">{description}</DialogDescription>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {headerAction}
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Close template browser">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <div className={cn('flex min-h-0 flex-1 flex-col', previewItem && 'lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]')}>
          <section className={cn('flex min-h-0 flex-1 flex-col', previewItem && 'hidden lg:flex')} aria-label="Email templates">
            <div className="shrink-0 border-b p-4">
              <div className="flex min-w-0 items-center gap-2">
                <SearchField
                    label="Search email templates"
                    placeholder="Search templates…"
                    value={activeSearchQuery}
                    onValueChange={remoteQuery?.onSearchQueryChange ?? setSearchQuery}
                    controlSize="compact"
                    containerClassName="min-w-0 flex-1"
                  />
                <Select value={activeCategory} onValueChange={remoteQuery?.onCategoryChange ?? setCategory}>
                  <SelectTrigger controlSize="compact" className="w-[132px] shrink-0 sm:w-[168px]" aria-label="Filter email templates by category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map(value => <SelectItem key={value} value={value}>{categoryLabel(value)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">{remoteQuery?.total ?? filteredItems.length}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {loading ? (
                <div className="flex h-full min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
              ) : error ? (
                <ErrorState
                  icon={FileText}
                  title="Email templates unavailable"
                  description="The template library could not be loaded. Nothing has been changed."
                  onAction={onRetry}
                  className="h-full min-h-48"
                />
              ) : filteredItems.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  kind={hasQuery ? 'results' : 'passive'}
                  size="compact"
                  title={hasQuery ? 'No matching templates' : emptyTitle}
                  description={hasQuery ? undefined : emptyDescription}
                  actionLabel={hasQuery ? 'Clear filters' : undefined}
                  onAction={hasQuery ? clearQuery : undefined}
                  className="h-full min-h-48"
                />
              ) : (
                <div className="divide-y rounded-lg border">
                  {filteredItems.map(item => {
                    const isSelected = selectedId === item.id;
                    return (
                      <div key={item.id} className={cn('group flex min-w-0 items-center gap-2 interaction-row', isSelected && 'bg-blue-500/5')}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => choose(item)}>
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400', isSelected && 'bg-blue-600 text-white dark:text-white')}>
                            {isSelected ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              {item.status && <Badge className={cn('hidden shrink-0 text-xs sm:inline-flex', item.status.className)}>{item.status.label}</Badge>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subject}</span>
                            {(item.category || item.meta) && <span className="mt-1 flex gap-2 text-xs text-muted-foreground">{item.category && <span>{categoryLabel(item.category)}</span>}{item.meta}</span>}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1 pr-2">
                          {renderPreview && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-400/10 dark:hover:text-blue-300" onClick={() => setPreviewId(item.id)} aria-label={`Preview ${item.name}`}><Eye className="h-4 w-4" /></Button>}
                          {onEdit && <Button type="button" variant="ghost" size="sm" className="hidden h-8 sm:inline-flex" onClick={() => onEdit(item)}>Edit</Button>}
                        </div>
                      </div>
                    );
                  })}
                  {remoteQuery?.hasNextPage && <div className="flex justify-center p-3">
                    <Button type="button" variant="outline" size="sm" onClick={remoteQuery.onLoadMore} disabled={remoteQuery.loadingMore}>
                      {remoteQuery.loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                      Load more
                    </Button>
                  </div>}
                </div>
              )}
            </div>
            {footerAction && <div className="flex shrink-0 justify-end border-t p-4">{footerAction}</div>}
          </section>

          {previewItem && renderPreview ? (
            <section className="flex min-h-0 flex-1 flex-col border-l" aria-label={`Preview ${previewItem.name}`}>
              <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
                <Button type="button" variant="ghost" size="sm" className="lg:hidden" onClick={() => setPreviewId(null)}>Back</Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{previewItem.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{previewItem.subject}</p>
                </div>
                <Button type="button" size="sm" className="bg-blue-600 text-white interaction-button--primary" onClick={() => choose(previewItem)}>Use template</Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">{renderPreview(previewItem)}</div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EmailTemplateBrowserDialog;
