import { formatDistanceStrict } from 'date-fns';
import type { AppNotification } from '@/services/notificationsGraphql';

const COMPACT_TIME_UNITS: Record<string, string> = {
  second: 's',
  seconds: 's',
  minute: 'm',
  minutes: 'm',
  hour: 'h',
  hours: 'h',
  day: 'd',
  days: 'd',
  month: 'mo',
  months: 'mo',
  year: 'y',
  years: 'y',
};

export function formatNotificationAge(
  value: string | Date,
  now: Date = new Date(),
): string {
  const distance = formatDistanceStrict(new Date(value), now, { addSuffix: true });
  const compact = distance.replace(
    /\s+(second|seconds|minute|minutes|hour|hours|day|days|month|months|year|years)\b/,
    (_, unit: string) => COMPACT_TIME_UNITS[unit],
  );

  return compact.startsWith('in ')
    ? `in ~${compact.slice(3)}`
    : `~${compact}`;
}

export function getNotificationDisplayTitle(
  notification: Pick<AppNotification, 'eventType' | 'title'>,
): string {
  if (notification.eventType !== 'account.welcome') return notification.title;
  return `${notification.title.replace(/!+$/, '')}!`;
}

export function getNotificationDisplayBody(
  notification: Pick<AppNotification, 'eventType' | 'body'>,
): string {
  if (notification.eventType !== 'account.welcome') return notification.body;
  return 'Workspace ready. Add your content.';
}

export type NotificationIconKind =
  | 'itemize'
  | 'viewed'
  | 'subscription'
  | 'paid'
  | 'refunded'
  | 'accepted'
  | 'declined'
  | 'signed'
  | 'signature'
  | 'ownership-transfer'
  | 'organization-people'
  | 'organization'
  | 'estimate'
  | 'billing'
  | 'default';

export function getNotificationIconKind(
  notification: Pick<AppNotification, 'eventType' | 'entityType'>,
): NotificationIconKind {
  const { eventType, entityType } = notification;

  if (eventType === 'account.welcome') return 'itemize';
  if (eventType === 'subscription.plan_changed') return 'subscription';
  if (eventType === 'invoice.paid') return 'paid';
  if (eventType === 'payment.refunded') return 'refunded';
  if (eventType === 'estimate.accepted') return 'accepted';
  if (eventType === 'estimate.declined' || eventType === 'signature.declined') return 'declined';
  if (eventType === 'signature.signed') return 'signed';
  if (eventType.endsWith('.viewed')) return 'viewed';
  if (eventType === 'organization.ownership_transferred') return 'ownership-transfer';
  if (
    eventType.startsWith('organization.member_')
    || eventType.startsWith('organization.invitation_')
  ) return 'organization-people';
  if (eventType.startsWith('organization.')) return 'organization';
  if (entityType === 'signature') return 'signature';
  if (entityType === 'estimate') return 'estimate';
  if (entityType === 'invoice' || entityType === 'payment') return 'billing';
  return 'default';
}
