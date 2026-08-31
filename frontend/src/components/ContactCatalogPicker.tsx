import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, UserRound, UserRoundX } from 'lucide-react';
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
import { getContacts, type ContactsQueryParams } from '@/services/contactsApi';
import type { Contact } from '@/types';

interface ContactCatalogPickerProps {
  organizationId: number | null;
  selectedContact: Contact | null;
  onSelect: (contact: Contact | null) => void;
  status?: ContactsQueryParams['status'];
  allowNone?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

const PAGE_SIZE = 25;

const contactCatalogLabel = (contact: Contact): string => {
  const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
  return name || contact.email || contact.phone || contact.company || 'Unnamed contact';
};

export function ContactCatalogPicker({
  organizationId,
  selectedContact,
  onSelect,
  status,
  allowNone = true,
  placeholder = 'Choose a contact',
  disabled = false,
}: ContactCatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const catalogQuery = useInfiniteQuery({
    queryKey: ['contact-catalog-picker', organizationId, status ?? 'all', debouncedSearch],
    queryFn: ({ pageParam, signal }) => getContacts({
      page: pageParam,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status,
      sort_by: 'first_name',
      sort_order: 'asc',
    }, organizationId as number, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.totalPages
      ? lastPage.pagination.page + 1
      : undefined,
    enabled: open && organizationId !== null && !disabled,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const contacts = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.contacts) ?? [],
    [catalogQuery.data],
  );

  const choose = (contact: Contact | null) => {
    onSelect(contact);
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
          className="min-h-11 w-full justify-between bg-background px-3 font-normal"
          disabled={disabled || organizationId === null}
        >
          <span className="min-w-0 truncate">
            {selectedContact ? contactCatalogLabel(selectedContact) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search contacts..."
            aria-label="Search contacts"
          />
          <CommandList className="max-h-72">
            {allowNone && (
              <CommandGroup>
                <CommandItem value="none" onSelect={() => choose(null)} className="min-h-11">
                  <UserRoundX className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>No contact</span>
                  {!selectedContact && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
                </CommandItem>
              </CommandGroup>
            )}
            {catalogQuery.isPending ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading contacts
              </div>
            ) : catalogQuery.isError ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Contacts could not be loaded.
              </div>
            ) : contacts.length === 0 ? (
              <CommandEmpty>No matching contacts.</CommandEmpty>
            ) : (
              <CommandGroup heading="Contacts">
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={String(contact.id)}
                    onSelect={() => choose(contact)}
                    className="min-h-11 gap-3"
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{contactCatalogLabel(contact)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[contact.email, contact.phone, contact.company].filter(Boolean).join(' · ') || 'No contact details'}
                      </span>
                    </span>
                    <Check className={cn(
                      'h-4 w-4 shrink-0',
                      selectedContact?.id === contact.id ? 'opacity-100' : 'opacity-0',
                    )} aria-hidden="true" />
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
                  {catalogQuery.isFetchingNextPage && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  Load more contacts
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
