'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, ChevronRight, LayoutDashboard, List, StickyNote, FileText, FileSignature, Users, Inbox, Zap, Calendar, BarChart3, PenTool, Workflow, Lock, Package, Megaphone, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchCanvasLists, getNotes, getWhiteboards, getWireframes, getVaults } from '@/services/api';
import { getContacts } from '@/services/contactsApi';
import { getSegments } from '@/services/segmentsApi';
import { getCampaigns } from '@/services/campaignsApi';
import { getWorkflows } from '@/services/automationsApi';
import { getInvoices } from '@/services/invoicesApi';
import { getSignatures } from '@/services/signaturesApi';

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
}

const STATIC_PAGES: SearchResult[] = [
  { id: 'page-dashboard', type: 'page', title: 'Dashboard', subtitle: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'page-canvas', type: 'page', title: 'Canvas', subtitle: 'All content', icon: List, href: '/canvas' },
  { id: 'page-contacts', type: 'page', title: 'Contacts', subtitle: 'Manage contacts', icon: Users, href: '/contacts' },
  { id: 'page-inbox', type: 'page', title: 'Inbox', subtitle: 'Email messages', icon: Inbox, href: '/inbox' },
  { id: 'page-calendar', type: 'page', title: 'Calendar', subtitle: 'Appointments', icon: Calendar, href: '/calendars' },
  { id: 'page-automations', type: 'page', title: 'Automations', subtitle: 'Workflows', icon: Zap, href: '/automations' },
  { id: 'page-campaigns', type: 'page', title: 'Campaigns', subtitle: 'Email campaigns', icon: Megaphone, href: '/campaigns' },
  { id: 'page-segments', type: 'page', title: 'Segments', subtitle: 'Contact segments', icon: Package, href: '/segments' },
  { id: 'page-pipelines', type: 'page', title: 'Pipelines', subtitle: 'Deals & sales', icon: StickyNote, href: '/pipelines' },
  { id: 'page-analytics', type: 'page', title: 'Analytics', subtitle: 'Statistics', icon: BarChart3, href: '/analytics' },
  { id: 'page-forms', type: 'page', title: 'Forms', subtitle: 'Custom forms', icon: FileText, href: '/forms' },
  { id: 'page-settings', type: 'page', title: 'Settings', subtitle: 'Account settings', icon: FileText, href: '/settings' },
];

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | string>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

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
  }, [open, onClose, results, selectedIndex, query]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const getToken = useCallback(() => {
    return localStorage.getItem('itemize_auth_token');
  }, []);

  const getOrgId = useCallback(() => {
    return localStorage.getItem('current_org_id');
  }, []);

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        setSelectedIndex(-1);
        return;
      }

      setLoading(true);
      setSelectedIndex(-1); // Reset selection when query changes
      try {
        const lowerQuery = query.toLowerCase();
        const allResults: SearchResult[] = [];

        const matchedPages = STATIC_PAGES.filter(p =>
          p.title.toLowerCase().includes(lowerQuery) ||
          p.subtitle?.toLowerCase().includes(lowerQuery)
        );
        allResults.push(...matchedPages);

        if (query.length > 1) {
          const token = getToken();
          try {
            const [listsData, notesData, whiteboardsData, wireframesData, vaultsData, segmentsData, campaignsData, automationsData] = await Promise.allSettled([
              fetchCanvasLists(token),
              getNotes(token),
              getWhiteboards(token),
              getWireframes(token),
              getVaults(token),
              getSegments({ search: query, limit: 3 }),
              getCampaigns({ search: query, limit: 3 }),
              getWorkflows(Number(getOrgId() || 0), { search: query }).catch(() => ({ workflows: [] }))
            ]);

            if (listsData.status === 'fulfilled' && Array.isArray(listsData.value)) {
              const matchedLists = listsData.value
                .filter((l: { title: string }) => l.title.toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((l: { id: string; title: string }) => ({
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

            if (whiteboardsData.status === 'fulfilled' && Array.isArray(whiteboardsData.value)) {
              const matchedWhiteboards = whiteboardsData.value
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

            if (segmentsData.status === 'fulfilled' && Array.isArray(segmentsData)) {
              const matchedSegments = segmentsData
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

            if (automationsData.status === 'fulfilled' && automationsData?.workflows) {
              const matchedAutomations = automationsData.workflows
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

            if (query.length > 2) {
              const [contactsData, invoicesData, signaturesData] = await Promise.allSettled([
                getContacts({ search: query, limit: 3 }),
                getInvoices({ search: query, limit: 3 }),
                getSignatures({ search: query, limit: 3 })
              ]);
              
              // Invoices
              if (invoicesData.status === 'fulfilled' && invoicesData.value?.invoices) {
                const matchedInvoices = invoicesData.value.invoices
                  .filter((inv: any) =>
                    inv.number?.toLowerCase().includes(lowerQuery) ||
                    inv.contact_name?.toLowerCase().includes(lowerQuery)
                  )
                  .slice(0, 3)
                  .map((inv: any) => ({
                    id: `invoice-${inv.id}`,
                    type: 'invoice' as const,
                    title: inv.number || `Invoice #${inv.id}`,
                    subtitle: inv.status || 'Invoice',
                    icon: FileText,
                    href: `/invoices/${inv.id}`
                  }));
                allResults.push(...matchedInvoices);
              }
              
              // Signatures
              if (signaturesData.status === 'fulfilled' && signaturesData.value?.documents) {
                const matchedSignatures = signaturesData.value.documents
                  .filter((sig: any) =>
                    sig.title?.toLowerCase().includes(lowerQuery)
                  )
                  .slice(0, 3)
                  .map((sig: any) => ({
                    id: `signature-${sig.id}`,
                    type: 'signature' as const,
                    title: sig.title || 'Document',
                    subtitle: sig.status || 'Document',
                    icon: FileSignature,
                    href: `/documents/${sig.id}`
                  }));
                allResults.push(...matchedSignatures);
              }

              if (contactsData.status === 'fulfilled' && contactsData.value?.data) {
                const matchedContacts = contactsData.data
                  .filter((c: { name?: string; email: string }) =>
                    c.name?.toLowerCase().includes(lowerQuery) || c.email.toLowerCase().includes(lowerQuery)
                  )
                  .slice(0, 3)
                  .map((c: { id: string; name?: string; email: string }) => ({
                    id: `contact-${c.id}`,
                    type: 'contact' as const,
                    title: c.name || c.email,
                    subtitle: c.email,
                    icon: Users,
                    href: '/contacts'
                  }));
                allResults.push(...matchedContacts);
              }
            }
          } catch (error) {
            console.error('Search error', error);
          }
        }

        setResults(allResults);
      } catch (error) {
        console.error('Search error', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query, getToken, getOrgId]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.href);
    onClose();
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start sm:justify-center pt-0 sm:pt-20 sm:pt-32">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl mx-0 sm:mx-4 bg-white dark:bg-slate-800 rounded-none sm:rounded-xl shadow-2xl overflow-hidden flex flex-col h-full sm:max-h-[70vh] sm:min-h-[400px] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 p-4 border-b bg-white dark:bg-slate-800 shrink-0">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything..."
            className="flex-1 text-lg outline-none placeholder:text-slate-400 text-slate-900 dark:text-slate-100 bg-transparent border-none focus:ring-0"
            autoFocus
          />
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-600">
              <kbd className="hidden sm:inline-block pointer-events-none h-5 select-none items-center gap-1 rounded border bg-slate-100 dark:bg-slate-700 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:text-slate-400 opacity-100">
                ESC
              </kbd>
              <X className="h-5 w-5 sm:hidden" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-900/50 min-h-[300px]">
          {!query && (
            <div className="p-8 text-center text-slate-600 dark:text-slate-400">
              <Search className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Search for anything</p>
              <p className="text-sm">Type to find lists, notes, contacts, campaigns, and more.</p>

              <div className="mt-8 text-left max-w-sm mx-auto">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-3 px-2">Quick Links</p>
                <div className="space-y-1">
                  {STATIC_PAGES.slice(0, 5).map((page, index) => (
                    <button
                      key={page.id}
                      onClick={() => handleSelect(page)}
                      onMouseEnter={() => setSelectedIndex(`quick-${index}`)}
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all text-slate-700 dark:text-slate-300 group",
                        selectedIndex === `quick-${index}` && "bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200"
                      )}
                    >
                      <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                        {page.icon && <page.icon className="h-4 w-4" />}
                      </div>
                      <span className="font-medium">{page.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {query && results.length === 0 && !loading && (
            <div className="p-12 text-center text-slate-600 dark:text-slate-400">
              <p>No results found for "{query}"</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full flex items-center gap-4 p-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-900 dark:hover:text-blue-200 transition-colors group text-left",
                    selectedIndex === index && "bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200"
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
                    <p className="font-medium truncate text-slate-700 dark:text-slate-200 group-hover:text-blue-900 dark:group-hover:text-blue-200">
                      {result.title}
                    </p>
                    {result.subtitle && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400">
                        {result.subtitle}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-400 dark:group-hover:text-blue-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex gap-4">
            <span><kbd className="font-sans border rounded px-1 bg-white dark:bg-slate-800">↑</kbd> <kbd className="font-sans border rounded px-1 bg-white dark:bg-slate-800">↓</kbd> to navigate</span>
            <span><kbd className="font-sans border rounded px-1 bg-white dark:bg-slate-800">↵</kbd> to select</span>
          </div>
          <span><kbd className="font-sans border rounded px-1 bg-white dark:bg-slate-800">ESC</kbd> to close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}