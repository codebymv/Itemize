import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  LayoutGrid,
  List as ListIcon,
  Search,
  Filter,
  Map,
  CheckSquare,
  StickyNote,
  Palette,
  GitBranch,
  KeyRound,
  MoreVertical,
  Trash2,
  Share2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCanvasLists,
  getNotes,
  getWhiteboards,
  getWireframes,
  getVaults,
  deleteList as apiDeleteList,
  deleteNote as apiDeleteNote,
  deleteWhiteboard as apiDeleteWhiteboard,
  deleteWireframe as apiDeleteWireframe,
  deleteVault as apiDeleteVault,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault, Category } from '@/types';
import { useDatabaseCategories } from '@/hooks/useDatabaseCategories';
import { ContentCard } from './components/ContentCard';
import { ContentModal } from './components/ContentModal';

// Content type definitions
type ContentType = 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';
type SortOption = 'updated' | 'created' | 'title';
type ViewMode = 'grid' | 'list';

interface UnifiedContent {
  id: number | string;
  type: ContentType;
  title: string;
  category: string;
  color_value?: string;
  itemCount?: number;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_token?: string;
  originalData: List | Note | Whiteboard | Wireframe | Vault;
}

export function ContentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();
  const { token } = useAuth();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [typeFilter, setTypeFilter] = useState<ContentType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  // Data states
  const [lists, setLists] = useState<List[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [wireframes, setWireframes] = useState<Wireframe[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);

  // Modal state
  const [selectedContent, setSelectedContent] = useState<UnifiedContent | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Categories
  const { categories: dbCategories } = useDatabaseCategories();

  // Fetch all content
  const fetchAllContent = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const [listsRes, notesRes, whiteboardsRes, wireframesRes, vaultsRes] = await Promise.all([
        fetchCanvasLists(token).catch(() => []),
        getNotes(token).catch(() => ({ notes: [] })),
        getWhiteboards(token).catch(() => ({ whiteboards: [] })),
        getWireframes(token).catch(() => ({ wireframes: [] })),
        getVaults(token).catch(() => ({ vaults: [] })),
      ]);

      setLists(listsRes || []);
      setNotes(notesRes?.notes || []);
      setWhiteboards(whiteboardsRes?.whiteboards || []);
      setWireframes(wireframesRes?.wireframes || []);
      setVaults(vaultsRes?.vaults || []);
    } catch (error) {
      console.error('Error fetching content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load content',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchAllContent();
  }, [fetchAllContent]);

  // Unify all content into a single array
  const unifiedContent = useMemo((): UnifiedContent[] => {
    const content: UnifiedContent[] = [];

    lists.forEach(list => {
      content.push({
        id: list.id,
        type: 'list',
        title: list.title || 'Untitled List',
        category: list.type || 'General',
        color_value: list.color_value,
        itemCount: list.items?.length || 0,
        created_at: list.created_at || new Date().toISOString(),
        updated_at: list.updated_at || new Date().toISOString(),
        is_public: list.is_public,
        share_token: list.share_token,
        originalData: list,
      });
    });

    notes.forEach(note => {
      content.push({
        id: note.id,
        type: 'note',
        title: note.title || 'Untitled Note',
        category: note.category || 'General',
        color_value: note.color_value,
        created_at: note.created_at || new Date().toISOString(),
        updated_at: note.updated_at || new Date().toISOString(),
        is_public: note.is_public,
        share_token: note.share_token,
        originalData: note,
      });
    });

    whiteboards.forEach(wb => {
      content.push({
        id: wb.id,
        type: 'whiteboard',
        title: wb.title || 'Untitled Whiteboard',
        category: wb.category || 'General',
        color_value: wb.color_value,
        created_at: wb.created_at || new Date().toISOString(),
        updated_at: wb.updated_at || new Date().toISOString(),
        is_public: wb.is_public,
        share_token: wb.share_token,
        originalData: wb,
      });
    });

    wireframes.forEach(wf => {
      content.push({
        id: wf.id,
        type: 'wireframe',
        title: wf.title || 'Untitled Wireframe',
        category: wf.category || 'General',
        color_value: wf.color_value,
        created_at: wf.created_at || new Date().toISOString(),
        updated_at: wf.updated_at || new Date().toISOString(),
        is_public: wf.is_public,
        share_token: wf.share_token,
        originalData: wf,
      });
    });

    vaults.forEach(vault => {
      content.push({
        id: vault.id,
        type: 'vault',
        title: vault.title || 'Untitled Vault',
        category: vault.category || 'General',
        color_value: vault.color_value,
        itemCount: vault.item_count || 0,
        created_at: vault.created_at || new Date().toISOString(),
        updated_at: vault.updated_at || new Date().toISOString(),
        is_public: vault.is_public,
        share_token: vault.share_token,
        originalData: vault,
      });
    });

    return content;
  }, [lists, notes, whiteboards, wireframes, vaults]);

  // Filter and sort content
  const filteredContent = useMemo(() => {
    let filtered = [...unifiedContent];

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(c => c.type === typeFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(c => c.category === categoryFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.title.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [unifiedContent, typeFilter, categoryFilter, searchQuery, sortBy]);

  // Get unique categories
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    unifiedContent.forEach(c => cats.add(c.category));
    return Array.from(cats).sort();
  }, [unifiedContent]);

  // Handle delete
  const handleDelete = async (content: UnifiedContent) => {
    if (!token) return;

    try {
      switch (content.type) {
        case 'list':
          await apiDeleteList(content.id as string, token);
          setLists(prev => prev.filter(l => l.id !== content.id));
          break;
        case 'note':
          await apiDeleteNote(content.id as number, token);
          setNotes(prev => prev.filter(n => n.id !== content.id));
          break;
        case 'whiteboard':
          await apiDeleteWhiteboard(content.id as number, token);
          setWhiteboards(prev => prev.filter(w => w.id !== content.id));
          break;
        case 'wireframe':
          await apiDeleteWireframe(content.id as number, token);
          setWireframes(prev => prev.filter(w => w.id !== content.id));
          break;
        case 'vault':
          await apiDeleteVault(content.id as number, token);
          setVaults(prev => prev.filter(v => v.id !== content.id));
          break;
      }

      toast({
        title: 'Deleted',
        description: `${content.title} has been deleted`,
      });
    } catch (error) {
      console.error('Error deleting content:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete content',
        variant: 'destructive',
      });
    }
  };

  // Handle content click - open modal
  const handleContentClick = (content: UnifiedContent) => {
    setSelectedContent(content);
    setShowModal(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setShowModal(false);
    setSelectedContent(null);
    // Refresh content after modal closes
    fetchAllContent();
  };

  // Set header content
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2">
          <LayoutGrid className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1
            className="text-xl font-semibold italic truncate"
            style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            CONTENTS
          </h1>
        </div>
        <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
          {/* View toggle */}
          <div className="hidden sm:flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 px-3 rounded-r-none"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 px-3 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Type filter */}
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ContentType)}>
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50 hidden sm:flex">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="list">Lists</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="whiteboard">Whiteboards</SelectItem>
              <SelectItem value="wireframe">Wireframes</SelectItem>
              <SelectItem value="vault">Vaults</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative hidden md:block w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            />
          </div>

          {/* Go to Canvas button */}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
            onClick={() => navigate('/workspace')}
          >
            <Map className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Go to Canvas</span>
          </Button>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [theme, navigate, setHeaderContent, viewMode, typeFilter, searchQuery]);

  // Get content type icon
  const getTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'list': return CheckSquare;
      case 'note': return StickyNote;
      case 'whiteboard': return Palette;
      case 'wireframe': return GitBranch;
      case 'vault': return KeyRound;
      default: return CheckSquare;
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Mobile filters */}
      <div className="sm:hidden flex flex-col gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ContentType)}>
            <SelectTrigger className="flex-1">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="list">Lists</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="whiteboard">Whiteboards</SelectItem>
              <SelectItem value="wireframe">Wireframes</SelectItem>
              <SelectItem value="vault">Vaults</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 px-3 rounded-r-none"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-9 px-3 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Last Updated</SelectItem>
              <SelectItem value="created">Date Created</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredContent.length} {filteredContent.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'h-32' : 'h-16'} />
          ))}
        </div>
      ) : filteredContent.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <LayoutGrid className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No content found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || typeFilter !== 'all' || categoryFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Get started by creating content on your canvas'}
            </p>
            <Button
              onClick={() => navigate('/workspace')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Map className="h-4 w-4 mr-2" />
              Go to Canvas
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredContent.map(content => (
            <ContentCard
              key={`${content.type}-${content.id}`}
              content={content}
              onClick={() => handleContentClick(content)}
              onDelete={() => handleDelete(content)}
              formatRelativeTime={formatRelativeTime}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Title</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">Category</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Updated</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContent.map(content => {
                  const Icon = getTypeIcon(content.type);
                  return (
                    <tr 
                      key={`${content.type}-${content.id}`}
                      className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => handleContentClick(content)}
                    >
                      <td className="p-3">
                        <Icon 
                          className="h-5 w-5" 
                          style={{ color: content.color_value || '#3B82F6' }} 
                        />
                      </td>
                      <td className="p-3">
                        <span className="font-medium">{content.title}</span>
                        {content.itemCount !== undefined && (
                          <span className="text-muted-foreground text-sm ml-2">
                            ({content.itemCount} items)
                          </span>
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Badge variant="secondary">{content.category}</Badge>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {formatRelativeTime(content.updated_at)}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleContentClick(content);
                            }}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(content);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Content Modal */}
      {showModal && selectedContent && (
        <ContentModal
          content={selectedContent}
          onClose={handleModalClose}
          categories={dbCategories}
        />
      )}
    </div>
  );
}

export default ContentsPage;
