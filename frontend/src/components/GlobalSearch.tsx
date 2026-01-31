'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, ChevronRight, LayoutDashboard, List, StickyNote, FileText, Users, Inbox, Zap, Calendar, BarChart3, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchCanvasLists } from '@/services/api';
import { getContacts } from '@/services/contactsApi';

interface SearchResult {
  id: string;
  type: 'page' | 'list' | 'note' | 'contact';
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
  { id: 'page-dashboard', type: 'page', title: 'Dashboard', subtitle: 'Main dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'page-canvas', type: 'page', title: 'Canvas', subtitle: 'All your content', icon: List, href: '/canvas' },
  { id: 'page-contacts', type: 'page', title: 'Contacts', subtitle: 'Manage contacts', icon: Users, href: '/contacts' },
  { id: 'page-inbox', type: 'page', title: 'Inbox', subtitle: 'Email inbox', icon: Inbox, href: '/inbox' },
  { id: 'page-calendar', type: 'page', title: 'Calendar', subtitle: 'View calendar', icon: Calendar, href: '/calendar' },
  { id: 'page-automations', type: 'page', title: 'Automations', subtitle: 'Workflows', icon: Zap, href: '/automations' },
  { id: 'page-analytics', type: 'page', title: 'Analytics', subtitle: 'Statistics', icon: BarChart3, href: '/analytics' },
  { id: 'page-forms', type: 'page', title: 'Forms', subtitle: 'Manage forms', icon: FileText, href: '/forms' },
];

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

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

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const lowerQuery = query.toLowerCase();
        const allResults: SearchResult[] = [];

        const matchedPages = STATIC_PAGES.filter(p =>
          p.title.toLowerCase().includes(lowerQuery) ||
          p.subtitle?.toLowerCase().includes(lowerQuery)
        );
        allResults.push(...matchedPages);

        if (query.length > 2) {
          try {
            const [listsData, contactsData] = await Promise.allSettled([
              fetchCanvasLists(localStorage.getItem('auth_token') || ''),
              getContacts({ search: query, limit: 5 })
            ]);

            if (listsData.status === 'fulfilled' && Array.isArray(listsData.value)) {
              const matchedLists = listsData.value
                .filter((l: { title: string }) => l.title.toLowerCase().includes(lowerQuery))
                .slice(0, 5)
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

            if (contactsData.status === 'fulfilled' && contactsData.value?.data) {
              const matchedContacts = contactsData.value.data
                .filter((c: { name?: string; email: string }) =>
                  c.name?.toLowerCase().includes(lowerQuery) || c.email.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 5)
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
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.href);
    onClose();
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-32">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 p-4 border-b bg-white dark:bg-slate-800">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lists, contacts, pages..."
            className="flex-1 text-lg outline-none placeholder:text-slate-400 text-slate-900 dark:text-slate-100 bg-transparent border-none focus:ring-0"
            autoFocus
          />
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-600">
              <kbd className="hidden sm:inline-block pointer-events-none h-5 select-none items-center gap-1 rounded border bg-slate-100 dark:bg-slate-700 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:text-slate-400 opacity-100">
                ESC
              </kbd>
              <X className="h-5 w-5 sm:hidden" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-900/50 min-h-[300px]">
          {!query && (
            <div className="p-8 text-center text-slate-600 dark:text-slate-400">
              <Search className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Search for anything</p>
              <p className="text-sm">Type to find lists, contacts, and more.</p>

              <div className="mt-8 text-left max-w-sm mx-auto">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-3 px-2">Quick Links</p>
                <div className="space-y-1">
                  {STATIC_PAGES.slice(0, 5).map(page => (
                    <button
                      key={page.id}
                      onClick={() => handleSelect(page)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all text-slate-700 dark:text-slate-300 group"
                    >
                      <div className="w-8 h-8 rounded-md bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:bg-teal-100 dark:group-hover:bg-teal-900 transition-colors">
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
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 hover:text-teal-900 dark:hover:text-teal-200 transition-colors group text-left"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 dark:bg-slate-700 dark:text-slate-300 ${
                    result.type === 'list' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
                    result.type === 'note' ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400' :
                    result.type === 'contact' ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {result.icon ? <result.icon className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-slate-700 dark:text-slate-200 group-hover:text-teal-900 dark:group-hover:text-teal-200">
                      {result.title}
                    </p>
                    {result.subtitle && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400">
                        {result.subtitle}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-teal-400 dark:group-hover:text-teal-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
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