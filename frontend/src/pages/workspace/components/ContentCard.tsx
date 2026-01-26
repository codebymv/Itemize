import React from 'react';
import {
  CheckSquare,
  StickyNote,
  Palette,
  GitBranch,
  KeyRound,
  MoreVertical,
  Trash2,
  ExternalLink,
  Share2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ContentType = 'all' | 'list' | 'note' | 'whiteboard' | 'wireframe' | 'vault';

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
  originalData: any;
}

interface ContentCardProps {
  content: UnifiedContent;
  onClick: () => void;
  onDelete: () => void;
  formatRelativeTime: (date: string) => string;
}

export function ContentCard({ content, onClick, onDelete, formatRelativeTime }: ContentCardProps) {
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

  const Icon = getTypeIcon(content.type);
  const color = content.color_value || '#3B82F6';

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all hover:border-blue-300 dark:hover:border-blue-700 group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${color}20` }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {getTypeLabel(content.type)}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onClick();
              }} className="group/menu">
                <ExternalLink className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                Open
              </DropdownMenuItem>
              {content.is_public && (
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  // Copy share link
                  const baseUrl = window.location.origin;
                  const shareUrl = `${baseUrl}/shared/${content.type}/${content.share_token}`;
                  navigator.clipboard.writeText(shareUrl);
                }} className="group/menu">
                  <Share2 className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                  Copy Link
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                className="text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 
          className="font-medium text-sm mb-2 line-clamp-2"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          {content.title}
        </h3>

        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {content.category}
          </Badge>
          {content.is_public && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300">
              Shared
            </Badge>
          )}
        </div>

        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
          {content.itemCount !== undefined && (
            <span>{content.itemCount} {content.itemCount === 1 ? 'item' : 'items'}</span>
          )}
          {content.itemCount === undefined && <span />}
          <span>{formatRelativeTime(content.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default ContentCard;
