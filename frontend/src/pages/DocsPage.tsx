import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import axios from 'axios';
import { Menu, X, FileText, Folder } from 'lucide-react';

// Dynamic syntax highlighting import based on theme
// We'll handle this through CSS classes instead of multiple imports

// Define DocStructure interface (similar to hrvstr.us)
interface DocStructure {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: DocStructure[];
}

const DocsPage: React.FC = () => {
  const { '*': docPath } = useParams<{ '*': string }>();
  const { theme } = useTheme();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docStructure, setDocStructure] = useState<DocStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Dynamically load theme-appropriate syntax highlighting
  useEffect(() => {
    const existingLink = document.querySelector('#highlight-theme');
    if (existingLink) {
      existingLink.remove();
    }

    const link = document.createElement('link');
    link.id = 'highlight-theme';
    link.rel = 'stylesheet';
    link.href = theme === 'dark' 
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    document.head.appendChild(link);

    return () => {
      const linkToRemove = document.querySelector('#highlight-theme');
      if (linkToRemove) {
        linkToRemove.remove();
      }
    };
  }, [theme]);

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

  useEffect(() => {
    const fetchDocContent = async () => {
      setLoading(true);
      try {
        setError(null);
        const effectivePath = (!docPath || docPath === '/') ? 'getting-started' : docPath;
        const response = await axios.get(`/api/docs/content?path=${effectivePath}`);
        setMarkdownContent(response.data.content);
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
        const response = await axios.get(`/api/docs/structure`);
        setDocStructure(response.data);
      } catch (err) {
        console.error('Error fetching documentation structure:', err);
      }
    };

    fetchDocContent();
    fetchDocStructure();
  }, [docPath]);

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
    <div className={`flex h-screen ${bgColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
      {/* Sidebar */}
      <div className={`w-80 ${sidebarBg} overflow-y-auto fixed inset-y-0 left-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 z-30 border-r ${borderColor} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
        <div className="p-6">
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Mobile menu button */}
          <div className="lg:hidden mb-6">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className={`flex items-center px-4 py-3 rounded-lg ${buttonBg} ${textColor} transition-colors shadow-sm`}
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              <Menu className="h-5 w-5 mr-3" />
              <span className="text-sm font-medium">Documentation Menu</span>
            </button>
          </div>

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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {markdownContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocsPage;