import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, X, FileText, Folder, ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { docsService, DocStructure } from '../services/docsService';

const DocsPage: React.FC = () => {
  const { '*': docPath } = useParams<{ '*': string }>();
  const navigate = useNavigate();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docStructure, setDocStructure] = useState<DocStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Theme-aware color classes - matching canvas slate colors
  const sidebarBg = 'bg-card';
  const textColor = 'text-foreground';
  const mutedTextColor = 'text-muted-foreground';
  const borderColor = 'border-border';
  const hoverBg = 'hover:bg-accent';
  const activeBg = 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300';





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
            <Folder className="h-4 w-4 mr-3 flex-shrink-0 text-blue-600 dark:text-blue-400" />
          ) : (
            <FileText className="h-4 w-4 mr-3 flex-shrink-0 text-blue-600 dark:text-blue-400" />
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

  const backButton = (
    <Button
      onClick={() => navigate(-1)}
      size="sm"
      variant="ghost"
      className="text-foreground"
    >
      <ArrowLeft className="h-4 w-4 mr-1" />
      Back
    </Button>
  );

  const filteredDocs = filterDocStructure(docStructure, searchQuery);
  const searchResultCount = filteredDocs.reduce((total, item) => {
    const countItems = (items: DocStructure[]): number =>
      items.reduce((sum, i) => sum + 1 + (i.children ? countItems(i.children) : 0), 0);
    return total + countItems([item]);
  }, 0);

  const renderSearchField = (withShortcutRef = false) => (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={withShortcutRef ? searchInputRef : undefined}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documentation... (Press / to focus)"
          className={`w-full pl-10 pr-4 py-2 rounded-lg border ${borderColor} bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {searchQuery && (
        <div className={`mt-2 text-xs ${mutedTextColor}`}>
          {searchResultCount === 0
            ? 'No results found'
            : `${searchResultCount} result${searchResultCount === 1 ? '' : 's'} found`}
        </div>
      )}
    </div>
  );

  const renderTree = () =>
    loading && docStructure.length === 0 ? (
      <p className={`text-sm text-center py-4 ${mutedTextColor}`}>Loading structure...</p>
    ) : filteredDocs.length === 0 && searchQuery ? (
      <EmptyState
        icon={Search}
        title={`No results for "${searchQuery}"`}
        size="compact"
        actionLabel="Clear search"
        onAction={() => setSearchQuery('')}
      />
    ) : (
      <div className="space-y-1">{renderDocTree(filteredDocs)}</div>
    );

  const docsNav = (
    <nav className={`hidden md:flex flex-col w-72 lg:w-80 shrink-0 max-h-[calc(100vh-12rem)] overflow-hidden ${sidebarBg} border ${borderColor} rounded-lg`}>
      <div className="p-4 border-b border-border">{renderSearchField(true)}</div>
      <div className="flex-1 overflow-y-auto p-4 pt-2">{renderTree()}</div>
    </nav>
  );

  const article = error ? (
    <ErrorState title="Documentation Error" description={error} />
  ) : loading && !markdownContent ? (
    <div className="space-y-3 p-2">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ) : (
    <div
      className="prose lg:prose-xl max-w-none dark:prose-invert px-4 sm:px-6 py-4"
      style={{ fontFamily: '"Raleway", sans-serif' }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {markdownContent}
      </ReactMarkdown>
    </div>
  );

  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <div
        className={`w-80 ${sidebarBg} fixed inset-y-0 left-0 transform transition-transform duration-300 ease-in-out md:hidden z-30 border-r ${borderColor} flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4 border-b border-border">{renderSearchField()}</div>
        <div className="flex-1 overflow-y-auto p-4 pt-2">{renderTree()}</div>
      </div>

      <PageLayout
        title="DOCUMENTATION"
        icon={<FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />}
        leading={backButton}
        frame="split"
        nav={docsNav}
        mobileActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-4 w-4 mr-2" />
            Menu
          </Button>
        }
        className="flex-1"
      >
        {article}
      </PageLayout>
    </>
  );
};

export default DocsPage;