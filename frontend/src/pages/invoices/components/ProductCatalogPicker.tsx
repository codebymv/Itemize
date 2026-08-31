import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { cn } from '@/lib/utils';
import type { Product } from '@/services/invoicesApi';
import { getProductPageViaGraphql } from '@/services/productsGraphql';
import { productQueryKeys } from '@/services/productQueryKeys';

interface ProductCatalogPickerProps {
  organizationId: number | null;
  selectedName?: string;
  selectedProductId?: number;
  onSelect: (product: Product | null) => void;
}

const PAGE_SIZE = 25;

export function ProductCatalogPicker({
  organizationId,
  selectedName,
  selectedProductId,
  onSelect,
}: ProductCatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const catalogQuery = useInfiniteQuery({
    queryKey: productQueryKeys.picker(organizationId, debouncedSearch),
    queryFn: ({ pageParam, signal }) => getProductPageViaGraphql({
      page: pageParam,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      is_active: true,
    }, organizationId as number, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.totalPages
      ? lastPage.pagination.page + 1
      : undefined,
    enabled: open && organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const products = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.products) ?? [],
    [catalogQuery.data],
  );

  const choose = (product: Product | null) => {
    onSelect(product);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-h-11 w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{selectedProductId ? selectedName || 'Selected product' : 'Custom item'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search products..."
            aria-label="Search products"
          />
          <CommandList className="max-h-72">
            <CommandGroup>
              <CommandItem value="custom" onSelect={() => choose(null)} className="min-h-11">
                <Plus className="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Custom item</span>
                {!selectedProductId && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
              </CommandItem>
            </CommandGroup>
            {catalogQuery.isPending ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading products
              </div>
            ) : catalogQuery.isError ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Products could not be loaded.
              </div>
            ) : products.length === 0 ? (
              <CommandEmpty>No matching products.</CommandEmpty>
            ) : (
              <CommandGroup heading="Available products">
                {products.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={String(product.id)}
                    onSelect={() => choose(product)}
                    className="min-h-11"
                  >
                    <Package className="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{product.name}</span>
                    {product.sku && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{product.sku}</span>}
                    <Check className={cn('ml-2 h-4 w-4', selectedProductId === product.id ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {catalogQuery.hasNextPage && (
              <div className="border-t p-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 w-full"
                  onClick={() => void catalogQuery.fetchNextPage()}
                  disabled={catalogQuery.isFetchingNextPage}
                >
                  {catalogQuery.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Load more products
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
