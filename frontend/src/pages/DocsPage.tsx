import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, X, FileText, Folder, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { docsService, DocStructure } from '../services/docsService';

const DocsPage: React.FC = () => {
  const { '*': docPath } = useParams<{ '*': string }>();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docStructure, setDocStructure] = useState<DocStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Theme-aware color classes - matching canvas slate colors
  const bgColor = theme === 'dark' ? 'bg-slate-800' : 'bg-gray-50';
  const sidebarBg = theme === 'dark' ? 'bg-slate-700' : 'bg-white';
  const textColor = theme === 'dark' ? 'text-slate-100' : 'text-gray-900';
  const mutedTextColor = theme === 'dark' ? 'text-slate-400' : 'text-gray-500';
  const borderColor = theme === 'dark' ? 'border-slate-600' : 'border-gray-200';
  const hoverBg = theme === 'dark' ? 'hover:bg-slate-600' : 'hover:bg-gray-100';
  const activeBg = theme === 'dark' ? 'bg-blue-900 text-blue-300' : 'bg-blue-200 text-blue-800';
  const buttonBg = theme === 'dark' ? 'bg-slate-600 hover:bg-slate-500' : 'bg-gray-200 hover:bg-gray-300';
  const shadowClass = theme === 'dark' ? 'shadow-slate-900/50' : 'shadow-md';





  // Function to format names for display
  const formatName = (name: string) => {
    return name
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Function to filter documentation structure based on search query
  const filterDocStructure = (items: DocStructure[], query: string): DocStructure[] => {
    if (!query.trim()) return items;
    
    const searchLower = query.toLowerCase();
    
    const filterItems = (items: DocStructure[]): DocStructure[] => {
      const filtered: DocStructure[] = [];
      
      for (const item of items) {
        const nameMatches = formatName(item.name).toLowerCase().includes(searchLower);
        const pathMatches = item.path.toLowerCase().includes(searchLower);
        
        if (item.children) {
          const filteredChildren = filterItems(item.children);
          if (nameMatches || pathMatches || filteredChildren.length > 0) {
            filtered.push({
              ...item,
              children: filteredChildren.length > 0 ? filteredChildren : item.children
            });
          }
        } else if (nameMatches || pathMatches) {
          filtered.push(item);
        }
      }
      
      return filtered;
    };
    
    return filterItems(items);
  };

  // Function to recursively render the document tree (sidebar)
  const renderDocTree = (items: DocStructure[], level = 0) => {
    // Safety check to ensure items is an array
    if (!Array.isArray(items)) {
      console.warn('renderDocTree received non-array items:', items);
      return [];
    }
    return items.map((item) => (
      <div key={item.path} style={{ paddingLeft: `${level * 16}px` }}>
        <Link
          to={`/help/${item.path}`}
          className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
            docPath === item.path || (docPath === undefined && item.path === 'getting-started') 
              ? activeBg + ' shadow-sm'
              : `${textColor} ${hoverBg}`
          }`}
          style={{ fontFamily: '"Raleway", sans-serif' }}
          onClick={() => setIsSidebarOpen(false)}
        >
          {item.type === 'folder' ? (
            <Folder className={`h-4 w-4 mr-3 flex-shrink-0 ${
              docPath === item.path || (docPath === undefined && item.path === 'getting-started') 
                ? (theme === 'dark' ? 'text-blue-300' : 'text-blue-600')
                : (theme === 'dark' ? 'text-blue-400' : 'text-blue-500')
            }`} />
          ) : (
            <FileText className={`h-4 w-4 mr-3 flex-shrink-0 ${
              docPath === item.path || (docPath === undefined && item.path === 'getting-started') 
                ? (theme === 'dark' ? 'text-blue-300' : 'text-blue-600')
                : (theme === 'dark' ? 'text-blue-400' : 'text-blue-500')
            }`} />
          )}
          <span className="truncate font-medium">{formatName(item.name)}</span>
        </Link>
        {item.children && (
          <div className="mt-1 space-y-1">
            {renderDocTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  // Helper function to find an item by path in the structure
  const findItemByPath = (items: DocStructure[], path: string): DocStructure | null => {
    for (const item of items) {
      if (item.path === path) {
        return item;
      }
      if (item.children) {
        const found = findItemByPath(item.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  useEffect(() => {
    const fetchDocContent = async () => {
      setLoading(true);
      try {
        setError(null);
        const effectivePath = (!docPath || docPath === '/') ? 'getting-started' : docPath;

        // Check if this path is a folder in our structure
        const structure = await docsService.getDocStructure();
        const isFolder = findItemByPath(structure, effectivePath)?.type === 'folder';

        let markdownContent: string;
        if (isFolder) {
          markdownContent = docsService.generateFolderContent(effectivePath);
        } else {
          markdownContent = await docsService.getDocContent(effectivePath);
        }

        setMarkdownContent(markdownContent);
      } catch (err) {
        console.error('Error fetching documentation content:', err);
        setError('Failed to load documentation content. Please try again later.');
        setMarkdownContent('');
      } finally {
        setLoading(false);
      }
    };

    const fetchDocStructure = async () => {
      try {
        const structure = await docsService.getDocStructure();
        // Ensure the response data is an array
        const structureData = Array.isArray(structure) ? structure : [];
        setDocStructure(structureData);
      } catch (err) {
        console.error('Error fetching documentation structure:', err);
        // Set empty array on error to prevent .map() issues
        setDocStructure([]);
      }
    };

    fetchDocContent();
    fetchDocStructure();
  }, [docPath]);

  // Sync sidebar height with main content (desktop only)
  useEffect(() => {
    const syncHeights = () => {
      if (mainContentRef.current && sidebarRef.current) {
        const isDesktop = window.innerWidth >= 1024; // lg breakpoint
        
        if (isDesktop) {
          // On desktop, sync height with main content
          const mainContentHeight = mainContentRef.current.offsetHeight;
          sidebarRef.current.style.height = `${mainContentHeight}px`;
        } else {
          // On mobile, clear any explicit height to let CSS take over
          sidebarRef.current.style.height = '';
        }
      }
    };

    // Initial sync
    syncHeights();

    // Sync on window resize
    window.addEventListener('resize', syncHeights);

    // Sync when content changes (using MutationObserver)
    const observer = new MutationObserver(syncHeights);
    if (mainContentRef.current) {
      observer.observe(mainContentRef.current, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    return () => {
      window.removeEventListener('resize', syncHeights);
      observer.disconnect();
    };
  }, [markdownContent]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isSidebarOpen]);

  // Keyboard shortcut to focus search (press "/" key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Only if not focused on an input/textarea
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          return;
        }
        
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
        <div className={`max-w-md mx-auto p-8 text-center rounded-lg border ${borderColor} ${sidebarBg} ${shadowClass}`}>
          <div className={`text-lg font-medium mb-2 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
            Documentation Error
          </div>
          <div className={mutedTextColor}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex ${bgColor} ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
      <div className="flex w-full">
      {/* Sidebar */}
      <div ref={sidebarRef} className={`w-80 ${sidebarBg} fixed inset-y-0 left-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:self-stretch z-30 border-r ${borderColor} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`} style={{ fontFamily: '"Raleway", sans-serif' }}>
        {/* Fixed header area */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-600 bg-inherit">
          <h2 className={`text-xl font-bold mb-6 ${textColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Documentation</h2>

          {/* Search box */}
          <div className="mb-6">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documentation... (Press / to focus)"
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${borderColor} ${theme === 'dark' ? 'bg-slate-700 text-slate-100 placeholder-slate-400' : 'bg-gray-50 text-gray-900 placeholder-gray-500'} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors`}
                style={{ fontFamily: '"Raleway", sans-serif' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Search results count */}
            {searchQuery && (
              <div className={`mt-2 text-xs ${mutedTextColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                {(() => {
                  const filteredDocs = filterDocStructure(docStructure, searchQuery);
                  const count = filteredDocs.reduce((total, item) => {
                    const countItems = (items: DocStructure[]): number => {
                      return items.reduce((sum, i) => sum + 1 + (i.children ? countItems(i.children) : 0), 0);
                    };
                    return total + countItems([item]);
                  }, 0);
                  
                  return count === 0 
                    ? `No results found` 
                    : `${count} result${count === 1 ? '' : 's'} found`;
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable navigation area */}
        <div className="flex-1 overflow-y-auto p-6 pt-0">
          <nav className="space-y-1">
            {loading && docStructure.length === 0 ? (
              <div className={`text-center py-4 ${mutedTextColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                <div className="text-sm">Loading structure...</div>
              </div>
            ) : (
              (() => {
                const filteredDocs = filterDocStructure(docStructure, searchQuery);
                return filteredDocs.length === 0 && searchQuery ? (
                  <div className={`text-center py-4 ${mutedTextColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
                    <div className="text-sm">No results found for "{searchQuery}"</div>
                    <button
                      onClick={() => setSearchQuery('')}
                      className={`text-xs mt-2 ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} transition-colors`}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  renderDocTree(filteredDocs)
                );
              })()
            )}
          </nav>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div ref={mainContentRef} className="flex-1 min-h-0">
        {/* Back button and Mobile menu - responsive layout */}
        <div className="py-4">
          {/* Desktop: Back button aligned with logo using container positioning */}
          <div className="hidden lg:block">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center">
                {/* Spacer to match logo position - using estimated logo width */}
                <div className="w-24 sm:w-28 lg:w-32"></div>
                <Button
                  onClick={() => navigate(-1)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-normal"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile/Tablet: Back and Documentation Menu in same row */}
          <div className="lg:hidden px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => navigate('/')}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-normal"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <button
                onClick={() => setIsSidebarOpen(true)}
                className={`flex items-center px-4 py-3 rounded-lg ${buttonBg} ${textColor} transition-colors shadow-sm`}
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                <Menu className="h-5 w-5 mr-3" />
                <span className="text-sm font-medium">Documentation Menu</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

          {loading && !markdownContent ? (
            <div className={`text-center py-12 ${mutedTextColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
              <div className="text-lg">Loading documentation...</div>
            </div>
          ) : (
            <div 
              className={`prose lg:prose-xl max-w-none ${
                theme === 'dark' 
                  ? 'prose-invert prose-headings:text-slate-100 prose-p:text-slate-300 prose-strong:text-slate-200 prose-code:text-slate-200 prose-pre:bg-slate-700 prose-blockquote:text-slate-300'
                  : 'prose-headings:text-gray-900 prose-p:text-gray-700'
              }`}
              style={{ 
                fontFamily: '"Raleway", sans-serif',
                '--tw-prose-body': '"Raleway", sans-serif',
                '--tw-prose-headings': '"Raleway", sans-serif',
                '--tw-prose-lead': '"Raleway", sans-serif',
                '--tw-prose-links': '"Raleway", sans-serif',
                '--tw-prose-bold': '"Raleway", sans-serif',
                '--tw-prose-counters': '"Raleway", sans-serif',
                '--tw-prose-bullets': '"Raleway", sans-serif',
                '--tw-prose-hr': '"Raleway", sans-serif',
                '--tw-prose-quotes': '"Raleway", sans-serif',
                '--tw-prose-quote-borders': '"Raleway", sans-serif',
                '--tw-prose-captions': '"Raleway", sans-serif',
                '--tw-prose-kbd': '"Raleway", sans-serif',
                '--tw-prose-code': '"Raleway", sans-serif',
                '--tw-prose-pre-code': '"Raleway", sans-serif',
                '--tw-prose-th-borders': '"Raleway", sans-serif'
              } as React.CSSProperties}
            >
              <div className={`prose prose-lg max-w-none ${
                theme === 'dark'
                  ? 'prose-invert prose-headings:text-white prose-p:text-gray-200 prose-li:text-gray-200 prose-strong:text-white'
                  : 'prose-gray'
              }`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {markdownContent}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default DocsPage;