import type { EmailCampaign } from '@/services/campaignsApi';

export type CampaignScheduleFields = {
  date: string;
  time: string;
};

export const isCampaignEditable = (status: EmailCampaign['status']): boolean =>
  status === 'draft' || status === 'scheduled';

export const clampRate = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

export const percentOf = (value: number, total: number): number =>
  total > 0 ? clampRate((value / total) * 100) : 0;

export const getCampaignPreviewHtml = (
  campaign: Pick<EmailCampaign, 'content_html' | 'template_html'>,
  selectedTemplateHtml?: string | null,
): string => selectedTemplateHtml || campaign.content_html || campaign.template_html || '';

export const scheduleFieldsFor = (
  value: string | null | undefined,
  timezone: string,
): CampaignScheduleFields => {
  if (!value) return { date: '', time: '09:00' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '09:00' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value || '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
};

export const recipientDisplayName = (recipient: {
  first_name?: string;
  last_name?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  email: string;
}): string => {
  const name = [
    recipient.contact_first_name || recipient.first_name,
    recipient.contact_last_name || recipient.last_name,
  ].filter(Boolean).join(' ').trim();
  return name || recipient.email;
};
