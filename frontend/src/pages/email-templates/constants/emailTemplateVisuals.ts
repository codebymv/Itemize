import { FilePlus2, Pencil } from 'lucide-react';
import { defineStatus, type StatusVisual } from '@/lib/statusVisuals';
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';

/**
 * An email template carries two independent states: where it sits in the
 * publish lifecycle, and whether the published version is available to
 * campaigns and automations. The editor shows one badge, so these resolve in
 * lifecycle order and fall through to the shared catalog visuals once a
 * version exists.
 */
export interface EmailTemplatePublicationState {
  exists: boolean;
  hasUnpublishedChanges: boolean;
  hasPublishedVersion: boolean;
  isActive: boolean;
  isDirty: boolean;
}

export const NEW_EMAIL_TEMPLATE_VISUAL = defineStatus('New', 'blue', FilePlus2);
export const DRAFT_EMAIL_TEMPLATE_VISUAL = defineStatus('Draft', 'blue', Pencil);

export function getEmailTemplatePublicationVisual({
  exists,
  hasUnpublishedChanges,
  hasPublishedVersion,
  isActive,
  isDirty,
}: EmailTemplatePublicationState): StatusVisual {
  if (hasUnpublishedChanges || (!exists && isDirty)) return DRAFT_EMAIL_TEMPLATE_VISUAL;
  if (hasPublishedVersion) return getCatalogStatusVisual(isActive);
  return NEW_EMAIL_TEMPLATE_VISUAL;
}

/** Availability of a template listed in the shared browser dialog. */
export function getEmailTemplateCatalogVisual(isActive: boolean): StatusVisual {
  return getCatalogStatusVisual(isActive);
}
