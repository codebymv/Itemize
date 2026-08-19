import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Menu,
  X,
  FileText,
  Folder,
  ArrowLeft,
  Search,
  ChevronRight,
  ChevronDown,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  docsService,
  DocStructure,
  GUIDES_FOLDER_PATH,
  groupHelpStructure,
  parentPaths,
  findItemByPath,
} from '../services/docsService';
import { HelpLanding } from './help/HelpLanding';

const formatName = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const DocsPage: React.FC = () => {
  const { '*': docPath } = useParams<{ '*': string }>();
  const navigate = useNavigate();
  const [markdownContent, setMarkdownContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [docStructure, setDocStructure] = useState<DocStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set([GUIDES_FOLDER_PATH]),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isLanding = !docPath || docPath === '/';
  const searching = searchQuery.trim().length > 0;

  const sidebarBg = 'bg-card';
  const textColor = 'text-foreground';
  const mutedTextColor = 'text-muted-foreground';
  const borderColor = 'border-border';
  const hoverBg = 'hover:bg-accent';
  const activeBg = 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300';

  const filterDocStructure = (items: DocStructure[], query: string): DocStructure[] => {
    if (!query.trim()) return items;
    const searchLower = query.toLowerCase();

    const filterItems = (nodes: DocStructure[]): DocStructure[] => {
      const filtered: DocStructure[] = [];
      for (const item of nodes) {
        const nameMatches = formatName(item.name).toLowerCase().includes(searchLower);
        const pathMatches = item.path.toLowerCase().includes(searchLower);
        if (item.children) {
          const filteredChildren = filterItems(item.children);
          if (nameMatches || pathMatches || filteredChildren.length > 0) {
            filtered.push({
              ...item,
              children: filteredChildren.length > 0 ? filteredChildren : item.children,
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

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, []);

  const renderDocTree = (items: DocStructure[], level = 0) => {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const isFolder = item.type === 'folder';
      const isExpanded = searching || expandedFolders.has(item.path);
      const isActive = docPath === item.path;

      if (isFolder) {
        return (
          <div key={item.path}>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => toggleFolder(item.path)}
              className={`flex w-full items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 ${textColor} ${hoverBg}`}
              style={{ paddingLeft: `${level * 16 + 12}px`, fontFamily: '"Raleway", sans-serif' }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
              )}
              <Folder className="h-4 w-4 mr-2 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate font-medium text-left">{formatName(item.name)}</span>
            </button>
            {isExpanded && item.children && (
              <div className="mt-0.5">{renderDocTree(item.children, level + 1)}</div>
            )}
          </div>
        );
      }

      return (
        <div key={item.path}>
          <Link
            to={`/help/${item.path}`}
            className={`flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
              isActive ? `${activeBg} shadow-sm` : `${textColor} ${hoverBg}`
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px`, fontFamily: '"Raleway", sans-serif' }}
            onClick={() => setIsSidebarOpen(false)}
          >
            <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="truncate font-medium">{formatName(item.name)}</span>
          </Link>
        </div>
      );
    });
  };

  useEffect(() => {
    if (!docPath) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const path of parentPaths(docPath)) next.add(path);
      return next;
    });
  }, [docPath]);

  useEffect(() => {
    const fetchDocStructure = async () => {
      try {
        const structure = await docsService.getDocStructure();
        const structureData = Array.isArray(structure) ? structure : [];
        setDocStructure(groupHelpStructure(structureData));
      } catch {
        setDocStructure([]);
      }
    };

    const fetchDocContent = async () => {
      if (isLanding) {
        setMarkdownContent('');
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        setError(null);
        const structure = await docsService.getDocStructure();
        const grouped = groupHelpStructure(Array.isArray(structure) ? structure : []);
        const isFolder = findItemByPath(grouped, docPath)?.type === 'folder';
        const content = isFolder
          ? docsService.generateFolderContent(docPath, grouped)
          : await docsService.getDocContent(docPath);
        setMarkdownContent(content);
      } catch {
        setError('Failed to load help content. Please try again later.');
        setMarkdownContent('');
      } finally {
        setLoading(false);
      }
    };

    fetchDocStructure();
    fetchDocContent();
  }, [docPath, isLanding]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
      items.reduce((sum, node) => sum + 1 + (node.children ? countItems(node.children) : 0), 0);
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
          placeholder="Search help... (Press /)"
          className={`w-full pl-10 pr-4 py-2 rounded-lg border ${borderColor} bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-foreground transition-colors"
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
      <div className="space-y-0.5">{renderDocTree(filteredDocs)}</div>
    );

  const docsNav = (
    <nav className={`hidden md:flex flex-col w-72 lg:w-80 shrink-0 max-h-[calc(100vh-12rem)] overflow-hidden ${sidebarBg} border ${borderColor} rounded-lg`}>
      <div className="p-4 border-b border-border">{renderSearchField(true)}</div>
      <div className="flex-1 overflow-y-auto p-4 pt-2">{renderTree()}</div>
    </nav>
  );

  const article = isLanding ? (
    <HelpLanding />
  ) : error ? (
    <ErrorState title="Help" description={error} />
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
        title="Help"
        icon={<HelpCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />}
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
