'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ChevronRight, LayoutDashboard, List, StickyNote, FileText, FileSignature, Users, Inbox, Zap, Calendar, BarChart3, PenTool, Workflow, Lock, Package, Megaphone, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FailureNotice } from '@/components/FailureNotice';
import { cn } from '@/lib/utils';
import { fetchCanvasLists, getNotes, getWhiteboards, getWireframes, getVaults } from '@/services/api';
import { getContacts } from '@/services/contactsApi';
import { getSegments } from '@/services/segmentsApi';
import { getCampaigns } from '@/services/campaignsApi';
import { getWorkflows } from '@/services/automationsApi';
import { getInvoices } from '@/services/invoicesApi';
import { getSignatures } from '@/services/signaturesApi';
import { normalizeWhiteboardSearchRows } from './globalSearchUtils';
import type { Invoice } from '@/services/invoicesApi';
import type { SignatureDocument } from '@/services/signaturesApi';

interface SearchResult {
  id: string;
  type: 'page' | 'list' | 'note' | 'contact' | 'whiteboard' | 'wireframe' | 'vault' | 'segment' | 'campaign' | 'automation' | 'invoice' | 'signature';
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  href: string;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  hasPaidAccess: boolean;
}

const STATIC_PAGES: SearchResult[] = [
  { id: 'page-dashboard', type: 'page', title: 'Dashboard', subtitle: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'page-canvas', type: 'page', title: 'Canvas', subtitle: 'All content', icon: List, href: '/canvas' },
  { id: 'page-contacts', type: 'page', title: 'Contacts', subtitle: 'Manage contacts', icon: Users, href: '/contacts' },
  { id: 'page-inbox', type: 'page', title: 'Inbox', subtitle: 'Customer conversations', icon: Inbox, href: '/inbox' },
  { id: 'page-calendar', type: 'page', title: 'Calendar', subtitle: 'Appointments', icon: Calendar, href: '/calendars' },
  { id: 'page-automations', type: 'page', title: 'Automations', subtitle: 'Workflows', icon: Zap, href: '/automations' },
  { id: 'page-campaigns', type: 'page', title: 'Campaigns', subtitle: 'Email campaigns', icon: Megaphone, href: '/campaigns' },
  { id: 'page-segments', type: 'page', title: 'Segments', subtitle: 'Contact segments', icon: Package, href: '/segments' },
  { id: 'page-pipelines', type: 'page', title: 'Pipelines', subtitle: 'Deals & sales', icon: StickyNote, href: '/pipelines' },
  { id: 'page-analytics', type: 'page', title: 'Analytics', subtitle: 'Statistics', icon: BarChart3, href: '/analytics' },
  { id: 'page-forms', type: 'page', title: 'Forms', subtitle: 'Custom forms', icon: FileText, href: '/forms' },
  { id: 'page-settings', type: 'page', title: 'Settings', subtitle: 'Account settings', icon: FileText, href: '/settings' },
];

export function GlobalSearch({ open, onClose, hasPaidAccess }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | string>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.href);
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
      setResults([]);
      setSearchError(false);
      setSelectedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!query) {
          // Quick links navigation
          const maxIndex = STATIC_PAGES.slice(0, 5).length - 1;
          const currentNumIndex = typeof selectedIndex === 'number' && selectedIndex >= 0 ? selectedIndex : -1;
          setSelectedIndex(Math.min(currentNumIndex + 1, maxIndex));
        } else {
          // Search results navigation
          const maxIndex = results.length - 1;
          const currentNumIndex = typeof selectedIndex === 'number' ? selectedIndex : -1;
          setSelectedIndex(Math.min(currentNumIndex + 1, maxIndex));
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!query) {
          const currentNumIndex = typeof selectedIndex === 'number' && selectedIndex >= 0 ? selectedIndex : -1;
          setSelectedIndex(Math.max(currentNumIndex - 1, -1));
        } else {
          const currentNumIndex = typeof selectedIndex === 'number' ? selectedIndex : -1;
          setSelectedIndex(Math.max(currentNumIndex - 1, -1));
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (typeof selectedIndex === 'number' && selectedIndex >= 0) {
          if (!query && STATIC_PAGES[selectedIndex]) {
            handleSelect(STATIC_PAGES[selectedIndex]);
          } else if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
        }
        return;
      }
    };

    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleSelect, open, onClose, results, selectedIndex, query]);

  const getOrgId = useCallback(() => {
    return localStorage.getItem('current_org_id');
  }, []);

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        setSearchError(false);
        setSelectedIndex(-1);
        return;
      }

      setLoading(true);
      setSearchError(false);
      setSelectedIndex(-1); // Reset selection when query changes
      try {
        const lowerQuery = query.toLowerCase();
        const allResults: SearchResult[] = [];

        const searchablePages = hasPaidAccess
          ? STATIC_PAGES
          : STATIC_PAGES.filter((page) => page.href === '/canvas' || page.href === '/settings');
        const matchedPages = searchablePages.filter(p =>
          p.title.toLowerCase().includes(lowerQuery) ||
          p.subtitle?.toLowerCase().includes(lowerQuery)
        );
        allResults.push(...matchedPages);

        if (query.length > 1) {
          try {
            const contentResults = await Promise.allSettled([
              fetchCanvasLists(),
              getNotes(),
              getWhiteboards(),
              getWireframes(),
              getVaults(),
              hasPaidAccess ? getSegments({ search: query, page: 1, limit: 3 }) : Promise.resolve([]),
              hasPaidAccess ? getCampaigns({ search: query, limit: 3 }) : Promise.resolve({ campaigns: [] }),
              hasPaidAccess
                ? getWorkflows(Number(getOrgId() || 0), { search: query, limit: 3 })
                : Promise.resolve({ workflows: [] })
            ]);
            const [listsData, notesData, whiteboardsData, wireframesData, vaultsData, segmentsData, campaignsData, automationsData] = contentResults;
            if (contentResults.some((result) => result.status === 'rejected')) setSearchError(true);

            if (listsData.status === 'fulfilled' && Array.isArray(listsData.value)) {
              const matchedLists = listsData.value
                .filter((l: { title: string }) => l.title.toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((l: { id: string | number; title: string }) => ({
                  id: `list-${l.id}`,
                  type: 'list' as const,
                  title: l.title,
                  subtitle: 'List',
                  icon: List,
                  href: `/canvas#list-${l.id}`
                }));
              allResults.push(...matchedLists);
            }

            if (notesData.status === 'fulfilled' && Array.isArray(notesData.value)) {
              const matchedNotes = notesData.value
                .filter((n: { title?: string }) => (n.title || '').toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((n: { id: number; title?: string }) => ({
                  id: `note-${n.id}`,
                  type: 'note' as const,
                  title: n.title || 'Untitled Note',
                  subtitle: 'Note',
                  icon: StickyNote,
                  href: `/canvas#note-${n.id}`
                }));
              allResults.push(...matchedNotes);
            }

            if (whiteboardsData.status === 'fulfilled') {
              const matchedWhiteboards = normalizeWhiteboardSearchRows(whiteboardsData.value)
                .filter((w: { title?: string }) => (w.title || '').toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((w: { id: number; title?: string }) => ({
                  id: `whiteboard-${w.id}`,
                  type: 'whiteboard' as const,
                  title: w.title || 'Untitled Whiteboard',
                  subtitle: 'Whiteboard',
                  icon: PenTool,
                  href: `/canvas#whiteboard-${w.id}`
                }));
              allResults.push(...matchedWhiteboards);
            }

            if (wireframesData.status === 'fulfilled' && Array.isArray(wireframesData.value)) {
              const matchedWireframes = wireframesData.value
                .filter((w: { title?: string }) => (w.title || '').toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((w: { id: string; title?: string }) => ({
                  id: `wireframe-${w.id}`,
                  type: 'wireframe' as const,
                  title: w.title || 'Untitled Wireframe',
                  subtitle: 'Wireframe',
                  icon: Workflow,
                  href: `/canvas#wireframe-${w.id}`
                }));
              allResults.push(...matchedWireframes);
            }

            if (vaultsData.status === 'fulfilled') {
              const vaults = vaultsData.value?.vaults || [];
              const matchedVaults = (Array.isArray(vaults) ? vaults : [])
                .filter((v: { title?: string }) => (v.title || '').toLowerCase().includes(lowerQuery))
                .slice(0, 2)
                .map((v: { id: number; title?: string }) => ({
                  id: `vault-${v.id}`,
                  type: 'vault' as const,
                  title: v.title || 'Untitled Vault',
                  subtitle: 'Vault',
                  icon: Lock,
                  href: `/canvas#vault-${v.id}`
                }));
              allResults.push(...matchedVaults);
            }

            if (segmentsData.status === 'fulfilled' && Array.isArray(segmentsData.value)) {
              const matchedSegments = segmentsData.value
                .filter((s: { name: string }) => s.name.toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((s: { id: number; name: string }) => ({
                  id: `segment-${s.id}`,
                  type: 'segment' as const,
                  title: s.name,
                  subtitle: 'Segment',
                  icon: Package,
                  href: `/segments`
                }));
              allResults.push(...matchedSegments);
            }

            if (campaignsData.status === 'fulfilled' && campaignsData.value?.campaigns) {
              const matchedCampaigns = campaignsData.value.campaigns
                .filter((c: { name: string }) => c.name.toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((c: { id: number; name: string; status?: string }) => ({
                  id: `campaign-${c.id}`,
                  type: 'campaign' as const,
                  title: c.name,
                  subtitle: c.status || 'Campaign',
                  icon: Megaphone,
                  href: `/campaigns`
                }));
              allResults.push(...matchedCampaigns);
            }

            if (automationsData.status === 'fulfilled' && automationsData.value?.workflows) {
              const matchedAutomations = automationsData.value.workflows
                .filter((a: { name: string }) => a.name.toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((a: { id: number; name: string }) => ({
                  id: `automation-${a.id}`,
                  type: 'automation' as const,
                  title: a.name,
                  subtitle: 'Automation',
                  icon: Zap,
                  href: `/automations`
                }));
              allResults.push(...matchedAutomations);
            }

            if (hasPaidAccess && query.length > 2) {
              const paidResults = await Promise.allSettled([
                getContacts({ search: query, limit: 3 }),
                getInvoices({ search: query, limit: 3 }),
                getSignatures({ search: query, limit: 3 })
              ]);
              const [contactsData, invoicesData, signaturesData] = paidResults;
              if (paidResults.some((result) => result.status === 'rejected')) setSearchError(true);
              
              // Invoices
              if (invoicesData.status === 'fulfilled' && invoicesData.value?.invoices) {
                const matchedInvoices = invoicesData.value.invoices
                  .filter((inv: Invoice) =>
                    inv.invoice_number?.toLowerCase().includes(lowerQuery) ||
                    `${inv.contact_first_name || ''} ${inv.contact_last_name || ''}`.toLowerCase().includes(lowerQuery) ||
                    inv.customer_name?.toLowerCase().includes(lowerQuery)
                  )
                  .slice(0, 3)
                  .map((inv: Invoice) => ({
                    id: `invoice-${inv.id}`,
                    type: 'invoice' as const,
                    title: inv.invoice_number || `Invoice #${inv.id}`,
                    subtitle: inv.status || 'Invoice',
                    icon: FileText,
                    href: `/invoices/${inv.id}`
                  }));
                allResults.push(...matchedInvoices);
              }
              
              // Signatures
              if (signaturesData.status === 'fulfilled' && signaturesData.value?.documents) {
                const matchedSignatures = signaturesData.value.documents
                  .filter((sig: SignatureDocument) =>
                    sig.title?.toLowerCase().includes(lowerQuery)
                  )
                  .slice(0, 3)
                  .map((sig: SignatureDocument) => ({
                    id: `signature-${sig.id}`,
                    type: 'signature' as const,
                    title: sig.title || 'Document',
                    subtitle: sig.status || 'Document',
                    icon: FileSignature,
                    href: `/documents/${sig.id}`
                  }));
                allResults.push(...matchedSignatures);
              }

              if (contactsData.status === 'fulfilled' && contactsData.value?.contacts) {
                const matchedContacts = contactsData.value.contacts
                  .filter((c) => {
                    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                    return name.toLowerCase().includes(lowerQuery) || (c.email || '').toLowerCase().includes(lowerQuery);
                  }
                  )
                  .slice(0, 3)
                  .map((c) => {
                    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                    return {
                    id: `contact-${c.id}`,
                    type: 'contact' as const,
                    title: name || c.email || 'Contact',
                    subtitle: c.email || '',
                    icon: Users,
                    href: '/contacts'
                  };
                });
                allResults.push(...matchedContacts);
              }
            }
          } catch (error) {
            console.error('Search error', error);
            setSearchError(true);
          }
        }

        setResults(allResults);
      } catch (error) {
        console.error('Search error', error);
        setSearchError(true);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query, getOrgId, hasPaidAccess, searchAttempt]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className="top-0 flex h-dvh w-full max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-border bg-popover p-0 text-popover-foreground shadow-2xl sm:top-32 sm:h-auto sm:max-h-[70vh] sm:min-h-[400px] sm:max-w-2xl sm:translate-y-0 sm:rounded-xl"
      >
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-popover p-4">
          <SearchField
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            label="Search anything"
            placeholder="Search anything..."
            loading={loading}
            containerClassName="flex-1"
            className="border-0 bg-transparent text-lg shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
          <div className="flex items-center">
            <Button variant="ghost" size="iconToolbar" onClick={onClose} aria-label="Close global search">
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:inline-block">
                ESC
              </kbd>
              <X className="h-5 w-5 sm:hidden" />
            </Button>
          </div>
        </div>

        <div className="min-h-[300px] flex-1 overflow-y-auto bg-muted/20 p-2">
          {!query && (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="mx-auto mb-3 h-12 w-12 text-primary/50" />
              <p className="text-lg font-medium text-foreground">Search for anything</p>
              <p className="text-sm text-muted-foreground">
                {hasPaidAccess
                  ? 'Type to find lists, notes, contacts, campaigns, and more.'
                  : 'Type to find lists, notes, whiteboards, wireframes, and vaults.'}
              </p>

              <div className="mt-8 text-left max-w-sm mx-auto">
                <p className="mb-3 px-2 text-xs font-semibold uppercase text-muted-foreground">Quick links</p>
                <div className="space-y-1">
                  {(hasPaidAccess
                    ? STATIC_PAGES.slice(0, 5)
                    : STATIC_PAGES.filter((page) => page.href === '/canvas' || page.href === '/settings')
                  ).map((page, index) => (
                    <button
                      key={page.id}
                      onClick={() => handleSelect(page)}
                      onMouseEnter={() => setSelectedIndex(`quick-${index}`)}
                      className={cn(
                        "interaction-row group flex w-full items-center gap-3 rounded-lg p-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selectedIndex === `quick-${index}` && "bg-muted"
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100 group-focus-visible:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:group-hover:bg-blue-900 dark:group-focus-visible:bg-blue-900">
                        {page.icon && <page.icon className="h-4 w-4" />}
                      </div>
                      <span className="font-medium">{page.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {query && searchError && results.length === 0 && !loading && (
            <ErrorState
              kind="inline"
              title="Unable to complete search"
              description="Some search sources couldn't be reached. Try again."
              icon={Search}
              onAction={() => setSearchAttempt((current) => current + 1)}
              className="p-8"
            />
          )}

          {query && searchError && results.length > 0 && !loading && (
            <FailureNotice
              title="Some results couldn't be loaded"
              onRetry={() => setSearchAttempt((current) => current + 1)}
              className="mb-3"
            />
          )}

          {query && results.length === 0 && !loading && !searchError && (
            <EmptyState
              icon={Search}
              kind="results"
              size="compact"
              title={`No results for "${query}"`}
              actionLabel="Clear search"
              onAction={() => setQuery('')}
              className="p-8"
            />
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "interaction-row group flex w-full items-center gap-4 rounded-lg p-3 text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selectedIndex === index && "bg-muted"
                  )}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 dark:bg-slate-700 dark:text-slate-300 ${
                    result.type === 'list' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
                    result.type === 'note' ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400' :
                    result.type === 'contact' ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' :
                    result.type === 'whiteboard' ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' :
                    result.type === 'wireframe' ? 'bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400' :
                    result.type === 'vault' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
                    result.type === 'segment' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400' :
                    result.type === 'campaign' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400' :
                    result.type === 'automation' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400' :
                    result.type === 'invoice' ? 'bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400' :
                    result.type === 'signature' ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {result.icon ? <result.icon className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {result.title}
                    </p>
                    {result.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">
                        {result.subtitle}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-blue-600 group-focus-visible:text-blue-600 dark:group-hover:text-blue-400 dark:group-focus-visible:text-blue-400" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span><kbd className="rounded border bg-background px-1 font-sans">↑</kbd> <kbd className="rounded border bg-background px-1 font-sans">↓</kbd> to navigate</span>
            <span><kbd className="rounded border bg-background px-1 font-sans">↵</kbd> to select</span>
          </div>
          <span><kbd className="rounded border bg-background px-1 font-sans">ESC</kbd> to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
