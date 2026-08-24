/**
 * Subscription webhook job primitives. The pinned values below —
 * including the SHA-256 of the rendered upgrade email — were captured
 * from the legacy worker (backend/src/jobs/subscription-webhook-jobs.js)
 * before its retirement, so notification content and retry cadence stay
 * byte-stable across the Express retirement.
 */
import * as crypto from 'crypto';
import {
  buildUpgradeNotificationEmail,
  escapeHtml,
  notificationBackoffMs,
  PLAN_DISPLAY_NAMES,
  redactNotificationError,
} from './subscription-webhook-jobs.service';

describe('subscription webhook job primitives', () => {
  const savedAssetOrigin = process.env.EMAIL_ASSET_ORIGIN;
  const savedProdUrl = process.env.PROD_URL;

  beforeEach(() => {
    delete process.env.EMAIL_ASSET_ORIGIN;
    delete process.env.PROD_URL;
  });

  afterAll(() => {
    if (savedAssetOrigin !== undefined) process.env.EMAIL_ASSET_ORIGIN = savedAssetOrigin;
    if (savedProdUrl !== undefined) process.env.PROD_URL = savedProdUrl;
  });

  it('computes the legacy exponential backoff curve', () => {
    expect(notificationBackoffMs(0, 60_000, 86_400_000)).toBe(60000);
    expect(notificationBackoffMs(1, 60_000, 86_400_000)).toBe(60000);
    expect(notificationBackoffMs(3, 60_000, 86_400_000)).toBe(240000);
    expect(notificationBackoffMs(12, 60_000, 86_400_000)).toBe(86400000);
  });

  it('redacts emails and provider secrets like the legacy worker', () => {
    expect(
      redactNotificationError(new Error('Delivery to owner@example.com failed')),
    ).toBe('Delivery to [redacted-email] failed');
    expect(
      redactNotificationError(
        new Error('Key re_abc123 and whsec_deadbeef were rejected'),
      ),
    ).toBe('Key [redacted-secret] and [redacted-secret] were rejected');
    expect(redactNotificationError(null)).toBe('Notification delivery failed');
    expect(redactNotificationError(new Error('x'.repeat(700)))).toHaveLength(500);
  });

  it('builds the byte-identical legacy upgrade email', () => {
    const payload = buildUpgradeNotificationEmail({
      stripe_event_id: 'evt_parity_1',
      organization_id: 7,
      organization_name: 'Acme <Studios> & "Sons"',
      owner_email: 'owner@example.test',
      owner_name: 'Owner',
      previous_plan: 'starter',
      new_plan: 'unlimited',
      notification_type: 'subscription_upgraded',
      notification_attempt_count: 1,
    });
    expect(payload.to).toBe('owner@example.test');
    expect(payload.subject).toBe('Your Itemize plan was updated');
    expect(payload.text).toBe(
      'Acme <Studios> & "Sons" has been upgraded from Solo to Studio.',
    );
    expect(payload.idempotencyKey).toBe('subscription-upgrade-evt_parity_1');
    expect(payload.tags).toEqual([
      { name: 'notification_type', value: 'subscription_upgraded' },
    ]);
    // SHA-256 of the html the legacy sendUpgradeNotification produced
    // for this exact job before retirement.
    expect(
      crypto.createHash('sha256').update(payload.html).digest('hex'),
    ).toBe('473a549a561b128f16373697700dc9bb4e4ca9f316a90f701c61f58ac92f4b7a');
    expect(payload.html).toHaveLength(2004);
  });

  it('refuses a job without an owner recipient like the legacy builder', () => {
    expect(() =>
      buildUpgradeNotificationEmail({
        stripe_event_id: 'evt_parity_2',
        organization_id: 7,
        owner_email: null,
        previous_plan: 'starter',
        new_plan: 'unlimited',
        notification_type: 'subscription_upgraded',
        notification_attempt_count: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow('Subscription notification has no owner recipient');
  });

  it('keeps the plan display names and HTML escaping aligned with legacy', () => {
    expect(PLAN_DISPLAY_NAMES).toEqual({
      free: 'Free',
      starter: 'Solo',
      unlimited: 'Studio',
      pro: 'Studio+',
    });
    expect(escapeHtml(`<b>&"'x`)).toBe('&lt;b&gt;&amp;&quot;&#039;x');
  });
});
