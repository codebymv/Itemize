import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2,
  Filter,
  Map,
  LayoutGrid,
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
import { toastMessages } from '@/constants/toastMessages';
import { useAuthState } from '@/contexts/AuthContext';
import {
  unshareList as apiUnshareList,
  unshareNote as apiUnshareNote,
  unshareWhiteboard as apiUnshareWhiteboard,
  unshareVault as apiUnshareVault,
} from '@/services/api';
import { List, Note, Whiteboard, Wireframe, Vault } from '@/types';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  HeaderActionLabel,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { ErrorState } from '@/components/ErrorState';
import { useWorkspaceContent } from './hooks/useWorkspaceContent';
import { useIsMobile } from '@/hooks/use-mobile';
import { getWorkspaceLanding } from '@/lib/workspaceNavigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  const isMobile = useIsMobile();
  const workspaceLanding = getWorkspaceLanding(isMobile);
  const WorkspaceLandingIcon = isMobile ? LayoutGrid : Map;
  const { toast } = useToast();
  const { token, currentUser } = useAuthState();

  // Route-aware onboarding (will show 'canvas' onboarding for Workspace group)
  const {
    showModal: showOnboarding,
    handleComplete: handleOnboardingComplete,
    handleDismiss: handleOnboardingDismiss,
    handleClose: handleOnboardingClose,
    featureKey: onboardingFeatureKey,
  } = useRouteOnboarding();

  // Filter state
  const [typeFilter, setTypeFilter] = useState<ContentType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'title'>('recent');

  const {
    lists,
    notes,
    whiteboards,
    wireframes,
    vaults,
    setLists,
    setNotes,
    setWhiteboards,
    setVaults,
    loading,
    error: contentError,
    refresh: fetchAllContent,
  } = useWorkspaceContent(currentUser?.uid);

  // Unshare confirmation dialog
  const [unshareDialogOpen, setUnshareDialogOpen] = useState(false);
  const [contentToUnshare, setContentToUnshare] = useState<SharedContent | null>(null);

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

  // Filter and sort content
  const filteredContent = useMemo(() => {
    let filtered = sharedContent;

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(c => c.type === typeFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query)
      );
    }

    // Sort
    if (sortBy === 'title') {
      filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    // Default is 'recent' which is already sorted by shared_at in sharedContent

    return filtered;
  }, [sharedContent, typeFilter, searchQuery, sortBy]);

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
      description: toastMessages.copiedToClipboard('share link'),
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
    if (!contentToUnshare) return;

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

  const headerFilterCount = Number(typeFilter !== 'all')
    + Number(sortBy !== 'recent');
  const headerQueryCount = headerFilterCount
    + Number(searchQuery.trim().length > 0);
  const typeHeaderFilter = (
      <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ContentType)}>
        <SelectTrigger className="h-11 w-[7.5rem] bg-muted/20">
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
  );
  const sortHeaderFilter = (
      <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'recent' | 'title')}>
        <SelectTrigger className="h-11 w-[7.5rem] bg-muted/20">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Most Recent</SelectItem>
          <SelectItem value="title">Title A-Z</SelectItem>
        </SelectContent>
      </Select>
  );
  const headerFilters = (
    <>
      {typeHeaderFilter}
      {sortHeaderFilter}
    </>
  );

  return (
    <PageLayout
      title="SHARED"
      icon={<Share2 className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: (
          <HeaderSearch
            label="Search shared content"
            placeholder="Search shared content..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        ),
        filters: (
          <div className="flex items-center gap-2">
            <HeaderFilters
              label="Filter shared content by type"
              activeCount={Number(typeFilter !== 'all')}
              preferExpanded
            >
              {typeHeaderFilter}
            </HeaderFilters>
            <HeaderFilters
              label="Sort shared content"
              activeCount={Number(sortBy !== 'recent')}
              preferExpanded="when-roomy"
            >
              {sortHeaderFilter}
            </HeaderFilters>
          </div>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter shared content"
            placeholder="Search shared content..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={headerQueryCount}
          >
            {headerFilters}
          </HeaderCombinedQuery>
        ),
        secondaryAction: (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-11 min-w-11 gap-2 px-3 font-light"
                onClick={() => navigate('/canvas')}
                aria-label="Open Canvas"
              >
                <Map className="h-4 w-4" />
                <HeaderActionLabel>Canvas</HeaderActionLabel>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Canvas</TooltipContent>
          </Tooltip>
        ),
      }}
    >
          {/* Content */}
          <Card>
            <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : contentError ? (
            <ErrorState
              title="Unable to load shared content"
              description={contentError}
              actionLabel="Try again"
              onAction={() => void fetchAllContent()}
            />
          ) : filteredContent.length === 0 ? (
            <EmptyState
              icon={Share2}
              kind={headerQueryCount > 0 ? 'results' : 'collection'}
              title={headerQueryCount > 0 ? 'No matching shared content' : 'No shared content yet'}
              description={headerQueryCount > 0 ? undefined : 'Shared workspace items will appear here.'}
              className="p-12"
              actionLabel={headerQueryCount > 0 ? 'Clear filters' : undefined}
              onAction={headerQueryCount > 0 ? () => {
                setSearchQuery('');
                setTypeFilter('all');
                setSortBy('recent');
              } : undefined}
              action={headerQueryCount === 0 ?
                <Button
                  onClick={() => navigate(workspaceLanding.path)}
                  className="bg-blue-600 interaction-button--primary text-white"
                >
                  <WorkspaceLandingIcon className="mr-2 h-4 w-4" />
                  Go to {workspaceLanding.title}
                </Button>
                : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
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
                          className="border-b"
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
                                aria-label="Copy share link"
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
                                  className="text-destructive focus:text-destructive"
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
            </div>
          )}
            </CardContent>
          </Card>

          {/* Unshare confirmation dialog */}
          <AlertDialog open={unshareDialogOpen} onOpenChange={setUnshareDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 font-raleway">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Disable Sharing?
                </AlertDialogTitle>
                <AlertDialogDescription className="font-raleway">
                  This will disable the public share link for "{contentToUnshare?.title}".
                  Anyone with the current link will no longer be able to access it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="font-raleway">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleUnshare}
                  className="interaction-button--destructive bg-red-600 text-white font-raleway"
                >
                  Disable Sharing
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
      {onboardingFeatureKey && ONBOARDING_CONTENT[onboardingFeatureKey] && (
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          onComplete={handleOnboardingComplete}
          onDismiss={handleOnboardingDismiss}
          content={ONBOARDING_CONTENT[onboardingFeatureKey]}
        />
      )}
    </PageLayout>
  );
}

export default SharedPage;
