import { describe, expect, it } from 'vitest';
import {
  formatNotificationAge,
  getNotificationDisplayBody,
  getNotificationDisplayTitle,
  getNotificationIconKind,
} from './notificationDisplay';

describe('notification display formatting', () => {
  const now = new Date('2026-08-27T20:00:00.000Z');

  it('uses approximate compact units for past timestamps', () => {
    expect(formatNotificationAge('2026-08-27T15:00:00.000Z', now)).toBe('~5h ago');
    expect(formatNotificationAge('2026-08-27T19:48:00.000Z', now)).toBe('~12m ago');
    expect(formatNotificationAge('2026-08-25T20:00:00.000Z', now)).toBe('~2d ago');
  });

  it('keeps future timestamps readable if clock skew occurs', () => {
    expect(formatNotificationAge('2026-08-27T23:00:00.000Z', now)).toBe('in ~3h');
  });

  it('adds exactly one exclamation mark to welcome notifications', () => {
    expect(getNotificationDisplayTitle({
      eventType: 'account.welcome',
      title: 'Welcome to Itemize',
    })).toBe('Welcome to Itemize!');
    expect(getNotificationDisplayTitle({
      eventType: 'account.welcome',
      title: 'Welcome to Itemize!',
    })).toBe('Welcome to Itemize!');
    expect(getNotificationDisplayTitle({
      eventType: 'invoice.paid',
      title: 'Invoice paid',
    })).toBe('Invoice paid');
  });

  it('keeps welcome subtext concise for existing and new notifications', () => {
    expect(getNotificationDisplayBody({
      eventType: 'account.welcome',
      body: 'Your workspace is ready. Add your first list, note, whiteboard, wireframe, or vault.',
    })).toBe('Workspace ready. Add your content.');
    expect(getNotificationDisplayBody({
      eventType: 'invoice.paid',
      body: 'Acme paid INV-100 in full for $100.00.',
    })).toBe('Acme paid INV-100 in full for $100.00.');
  });

  it.each([
    ['account.welcome', 'organization', 'itemize'],
    ['subscription.plan_changed', 'subscription', 'subscription'],
    ['invoice.paid', 'invoice', 'paid'],
    ['payment.refunded', 'invoice', 'refunded'],
    ['estimate.accepted', 'estimate', 'accepted'],
    ['estimate.declined', 'estimate', 'declined'],
    ['signature.signed', 'signature', 'signed'],
    ['signature.declined', 'signature', 'declined'],
    ['signature.viewed', 'signature', 'viewed'],
    ['workspace.note.viewed', 'note', 'viewed'],
    ['organization.ownership_transferred', 'organization', 'ownership-transfer'],
    ['organization.member_added', 'organization_member', 'organization-people'],
    ['organization.invitation_created', 'organization_invitation', 'organization-people'],
    ['organization.updated', 'organization', 'organization'],
    ['estimate.sent', 'estimate', 'estimate'],
    ['invoice.sent', 'invoice', 'billing'],
    ['communication.message_received', 'conversation', 'communication'],
    ['communication.delivery_failed', 'conversation', 'communication-failed'],
    ['unknown.event', null, 'default'],
  ] as const)(
    'maps %s with entity %s to the %s visual',
    (eventType, entityType, expected) => {
      expect(getNotificationIconKind({ eventType, entityType })).toBe(expected);
    },
  );
});
