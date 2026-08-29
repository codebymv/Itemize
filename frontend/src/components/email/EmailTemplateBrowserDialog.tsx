import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Eye, FileText, Loader2, Mail, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  selectedId?: T['id'] | null;
  onSelect: (item: T) => void | boolean;
  renderPreview?: (item: T) => ReactNode;
  onEdit?: (item: T) => void;
  headerAction?: ReactNode;
  footerAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
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
  selectedId,
  onSelect,
  renderPreview,
  onEdit,
  headerAction,
  footerAction,
  emptyTitle = 'No email templates yet',
  emptyDescription = 'Create a template or compose this email from scratch.',
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

  const categories = useMemo(() => Array.from(new Set(items
    .map(item => item.category?.trim())
    .filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right)), [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      const matchesQuery = !query
        || item.name.toLowerCase().includes(query)
        || item.subject.toLowerCase().includes(query);
      const matchesCategory = category === 'all' || item.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [category, items, searchQuery]);

  const previewItem = items.find(item => item.id === previewId) ?? null;
  const hasQuery = Boolean(searchQuery.trim()) || category !== 'all';

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
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search email templates"
                    placeholder="Search templates…"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-10 w-[132px] shrink-0 sm:w-[168px]" aria-label="Filter email templates by category">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map(value => <SelectItem key={value} value={value}>{categoryLabel(value)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">{filteredItems.length}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {loading ? (
                <div className="flex h-full min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
              ) : filteredItems.length === 0 ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
                  <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="font-medium">{hasQuery ? 'No matching templates' : emptyTitle}</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hasQuery ? 'Try a different search or category.' : emptyDescription}</p>
                  {hasQuery && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { setSearchQuery(''); setCategory('all'); }}>Clear filters</Button>}
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {filteredItems.map(item => {
                    const isSelected = selectedId === item.id;
                    return (
                      <div key={item.id} className={cn('group flex min-w-0 items-center gap-2 transition-colors hover:bg-muted/50', isSelected && 'bg-blue-500/5')}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => choose(item)}>
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400', isSelected && 'bg-blue-600 text-white dark:text-white')}>
                            {isSelected ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              {item.status && <Badge variant="outline" className={cn('hidden shrink-0 text-xs sm:inline-flex', item.status.className)}>{item.status.label}</Badge>}
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
                <Button type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => choose(previewItem)}>Use template</Button>
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
