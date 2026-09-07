import { Archive, Eye, Pencil, Share2, type LucideIcon } from 'lucide-react';
import { defineStatus } from '@/lib/statusVisuals';
import {
  STAT_BADGE_CLASSES,
  STAT_ICON_BG_CLASSES,
  STAT_ICON_CLASSES,
} from '@/hooks/useStatStyles';

export type ContentStatus = 'draft' | 'published' | 'archived';

export type ContentStatusVisual = {
  label: string;
  icon: LucideIcon;
  theme: 'theme' | 'green' | 'red';
  badgeClass: string;
  iconBackgroundClass: string;
  iconClass: string;
};

export const CONTENT_STATUS_VISUALS: Record<ContentStatus, ContentStatusVisual> = {
  draft: {
    label: 'Draft',
    icon: Pencil,
    theme: 'theme',
    badgeClass: `border-transparent ${STAT_BADGE_CLASSES.theme}`,
    iconBackgroundClass: STAT_ICON_BG_CLASSES.theme,
    iconClass: STAT_ICON_CLASSES.theme,
  },
  published: {
    label: 'Published',
    icon: Eye,
    theme: 'green',
    badgeClass: `border-transparent ${STAT_BADGE_CLASSES.green}`,
    iconBackgroundClass: STAT_ICON_BG_CLASSES.green,
    iconClass: STAT_ICON_CLASSES.green,
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    theme: 'red',
    badgeClass: `border-transparent ${STAT_BADGE_CLASSES.red}`,
    iconBackgroundClass: STAT_ICON_BG_CLASSES.red,
    iconClass: STAT_ICON_CLASSES.red,
  },
};

export const SHARED_CONTENT_VISUAL = defineStatus('Shared', 'theme', Share2);

export function getContentStatusVisual(status: string): ContentStatusVisual {
  return CONTENT_STATUS_VISUALS[status as ContentStatus] ?? CONTENT_STATUS_VISUALS.draft;
}
