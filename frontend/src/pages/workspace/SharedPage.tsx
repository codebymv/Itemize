import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Share2,
  Filter,
  Map,
  CheckSquare,
  StickyNote,
  Palette,
  GitBranch,
  KeyRound,
  MoreVertical,
  ExternalLink,
  Copy,
  Link2Off,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCanvasLists,
  getNotes,
  getWhiteboards,
  getWireframes,
  getVaults,
  unshareList as apiUnshareList,
  unshareNote as apiUnshareNote,
  unshareWhiteboard as apiUnshareWhiteboard,
  unshareVault as apiUnshareVault,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault } from '@/types';

// Content type definitions
type ContentType = 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';

interface SharedContent {
  id: number | string;
  type: ContentType;
  title: string;
  category: string;
  color_value?: string;
  shared_at: string;
  share_token: string;
  share_url: string;
  originalData: List | Note | Whiteboard | Wireframe | Vault;
}

export function SharedPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();
  const { token } = useAuth();

  // Filter state
  const [typeFilter, setTypeFilter] = useState<ContentType>('all');

  // Data states
  const [lists, setLists] = useState<List[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [wireframes, setWireframes] = useState<Wireframe[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);

  // Unshare confirmation dialog
  const [unshareDialogOpen, setUnshareDialogOpen] = useState(false);
  const [contentToUnshare, setContentToUnshare] = useState<SharedContent | null>(null);

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
        description: 'Failed to load shared content',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchAllContent();
  }, [fetchAllContent]);

  // Build the base URL for share links
  const baseUrl = useMemo(() => {
    return window.location.origin;
  }, []);

  // Get share URL path based on type
  const getSharePath = (type: ContentType): string => {
    switch (type) {
      case 'list': return 'shared/list';
      case 'note': return 'shared/note';
      case 'whiteboard': return 'shared/whiteboard';
      case 'wireframe': return 'shared/wireframe';
      case 'vault': return 'shared/vault';
      default: return 'shared';
    }
  };

  // Unify all shared content into a single array
  const sharedContent = useMemo((): SharedContent[] => {
    const content: SharedContent[] = [];

    lists.filter(l => l.is_public && l.share_token).forEach(list => {
      content.push({
        id: list.id,
        type: 'list',
        title: list.title || 'Untitled List',
        category: list.type || 'General',
        color_value: list.color_value,
        shared_at: list.updated_at || list.created_at || new Date().toISOString(),
        share_token: list.share_token!,
        share_url: `${baseUrl}/${getSharePath('list')}/${list.share_token}`,
        originalData: list,
      });
    });

    notes.filter(n => n.is_public && n.share_token).forEach(note => {
      content.push({
        id: note.id,
        type: 'note',
        title: note.title || 'Untitled Note',
        category: note.category || 'General',
        color_value: note.color_value,
        shared_at: note.updated_at || note.created_at || new Date().toISOString(),
        share_token: note.share_token!,
        share_url: `${baseUrl}/${getSharePath('note')}/${note.share_token}`,
        originalData: note,
      });
    });

    whiteboards.filter(wb => wb.is_public && wb.share_token).forEach(wb => {
      content.push({
        id: wb.id,
        type: 'whiteboard',
        title: wb.title || 'Untitled Whiteboard',
        category: wb.category || 'General',
        color_value: wb.color_value,
        shared_at: wb.updated_at || wb.created_at || new Date().toISOString(),
        share_token: wb.share_token!,
        share_url: `${baseUrl}/${getSharePath('whiteboard')}/${wb.share_token}`,
        originalData: wb,
      });
    });

    wireframes.filter(wf => wf.is_public && wf.share_token).forEach(wf => {
      content.push({
        id: wf.id,
        type: 'wireframe',
        title: wf.title || 'Untitled Wireframe',
        category: wf.category || 'General',
        color_value: wf.color_value,
        shared_at: wf.updated_at || wf.created_at || new Date().toISOString(),
        share_token: wf.share_token!,
        share_url: `${baseUrl}/${getSharePath('wireframe')}/${wf.share_token}`,
        originalData: wf,
      });
    });

    vaults.filter(v => v.is_public && v.share_token).forEach(vault => {
      content.push({
        id: vault.id,
        type: 'vault',
        title: vault.title || 'Untitled Vault',
        category: vault.category || 'General',
        color_value: vault.color_value,
        shared_at: vault.updated_at || vault.created_at || new Date().toISOString(),
        share_token: vault.share_token!,
        share_url: `${baseUrl}/${getSharePath('vault')}/${vault.share_token}`,
        originalData: vault,
      });
    });

    // Sort by shared date (most recent first)
    content.sort((a, b) => new Date(b.shared_at).getTime() - new Date(a.shared_at).getTime());

    return content;
  }, [lists, notes, whiteboards, wireframes, vaults, baseUrl]);

  // Filter content
  const filteredContent = useMemo(() => {
    if (typeFilter === 'all') return sharedContent;
    return sharedContent.filter(c => c.type === typeFilter);
  }, [sharedContent, typeFilter]);

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

  // Get type label
  const getTypeLabel = (type: ContentType) => {
    switch (type) {
      case 'list': return 'List';
      case 'note': return 'Note';
      case 'whiteboard': return 'Whiteboard';
      case 'wireframe': return 'Wireframe';
      case 'vault': return 'Vault';
      default: return 'Item';
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

  // Copy share link to clipboard
  const handleCopyLink = (content: SharedContent) => {
    navigator.clipboard.writeText(content.share_url);
    toast({
      title: 'Link Copied',
      description: 'Share link has been copied to clipboard',
    });
  };

  // Open share link in new tab
  const handleViewShared = (content: SharedContent) => {
    window.open(content.share_url, '_blank');
  };

  // Handle unshare confirmation
  const handleUnshareClick = (content: SharedContent) => {
    setContentToUnshare(content);
    setUnshareDialogOpen(true);
  };

  // Handle unshare
  const handleUnshare = async () => {
    if (!contentToUnshare || !token) return;

    try {
      switch (contentToUnshare.type) {
        case 'list':
          await apiUnshareList(contentToUnshare.id as string, token);
          setLists(prev => prev.map(l => 
            l.id === contentToUnshare.id 
              ? { ...l, is_public: false, share_token: undefined } 
              : l
          ));
          break;
        case 'note':
          await apiUnshareNote(contentToUnshare.id as number, token);
          setNotes(prev => prev.map(n => 
            n.id === contentToUnshare.id 
              ? { ...n, is_public: false, share_token: undefined } 
              : n
          ));
          break;
        case 'whiteboard':
          await apiUnshareWhiteboard(contentToUnshare.id as number, token);
          setWhiteboards(prev => prev.map(w => 
            w.id === contentToUnshare.id 
              ? { ...w, is_public: false, share_token: undefined } 
              : w
          ));
          break;
        case 'vault':
          await apiUnshareVault(contentToUnshare.id as number, token);
          setVaults(prev => prev.map(v => 
            v.id === contentToUnshare.id 
              ? { ...v, is_public: false, share_token: undefined } 
              : v
          ));
          break;
        // Add wireframe unshare when API is available
      }

      toast({
        title: 'Sharing Disabled',
        description: `${contentToUnshare.title} is no longer shared`,
      });
    } catch (error) {
      console.error('Error disabling sharing:', error);
      toast({
        title: 'Error',
        description: 'Failed to disable sharing',
        variant: 'destructive',
      });
    } finally {
      setUnshareDialogOpen(false);
      setContentToUnshare(null);
    }
  };

  // Set header content
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2">
          <Share2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1
            className="text-xl font-semibold italic truncate"
            style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            WORKSPACE | Shared
          </h1>
        </div>
        <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
          {/* Type filter */}
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ContentType)}>
            <SelectTrigger className="w-[130px] h-9 bg-muted/20 border-border/50">
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
  }, [theme, navigate, setHeaderContent, typeFilter]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Summary */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="text-sm text-muted-foreground">
            {filteredContent.length} {filteredContent.length === 1 ? 'item' : 'items'} shared
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredContent.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Share2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No shared content</h3>
            <p className="text-muted-foreground mb-4">
              {typeFilter !== 'all'
                ? 'No content of this type has been shared yet'
                : 'Share lists, notes, whiteboards, or vaults to see them here'}
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
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Title</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">Category</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Shared</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden lg:table-cell">Share Link</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContent.map(content => {
                  const Icon = getTypeIcon(content.type);
                  return (
                    <tr 
                      key={`${content.type}-${content.id}`}
                      className="border-b hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Icon 
                            className="h-5 w-5" 
                            style={{ color: content.color_value || '#3B82F6' }} 
                          />
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {getTypeLabel(content.type)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-medium">{content.title}</span>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <Badge variant="secondary">{content.category}</Badge>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {formatRelativeTime(content.shared_at)}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[200px]">
                            {content.share_url}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 flex-shrink-0"
                            onClick={() => handleCopyLink(content)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewShared(content)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Shared Page
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyLink(content)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => handleUnshareClick(content)}
                            >
                              <Link2Off className="h-4 w-4 mr-2" />
                              Disable Sharing
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

      {/* Unshare confirmation dialog */}
      <AlertDialog open={unshareDialogOpen} onOpenChange={setUnshareDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Disable Sharing?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
              This will disable the public share link for "{contentToUnshare?.title}". 
              Anyone with the current link will no longer be able to access it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ fontFamily: '"Raleway", sans-serif' }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnshare}
              className="bg-red-600 hover:bg-red-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              Disable Sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SharedPage;
