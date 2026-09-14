/** Subscription delivery content, identity, redaction and retry contracts. */
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

  it('preserves upgrade content and identity in the shared responsive email', () => {
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
    expect(payload.html).toContain('Subscription updated');
    expect(payload.html).toContain(
      'Acme &lt;Studios&gt; &amp; &quot;Sons&quot; has been upgraded from <strong>Solo</strong> to <strong>Studio</strong>.',
    );
    expect(payload.html).not.toContain('Acme <Studios>');
    expect(payload.html).toContain('https://itemize.cloud/cover.png');
    expect(payload.html).toContain('Billing notification from Itemize.');
    expect(payload.html).toContain('table-layout:fixed');
    expect(payload.html).toContain('overflow-wrap:anywhere');
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
