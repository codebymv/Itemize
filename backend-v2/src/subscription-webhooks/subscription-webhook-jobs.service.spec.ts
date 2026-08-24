import {
  buildUpgradeNotificationEmail,
  escapeHtml,
  notificationBackoffMs,
  PLAN_DISPLAY_NAMES,
  redactNotificationError,
} from './subscription-webhook-jobs.service';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyJobs = require('../../../backend/src/jobs/subscription-webhook-jobs');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('subscription webhook job primitives (cross-runtime parity)', () => {
  it('computes the identical backoff curve as the legacy worker', () => {
    for (let attempt = 0; attempt <= 12; attempt += 1) {
      expect(notificationBackoffMs(attempt, 60_000, 86_400_000)).toBe(
        legacyJobs.notificationBackoffMs(attempt, 60_000, 86_400_000),
      );
    }
  });

  it('redacts errors byte-for-byte like the legacy worker', () => {
    const samples = [
      new Error('Delivery to owner@example.com failed'),
      new Error('Key re_abc123 and whsec_deadbeef were rejected'),
      'plain string failure',
      null,
      new Error('x'.repeat(700)),
    ];
    for (const sample of samples) {
      expect(redactNotificationError(sample)).toBe(
        legacyJobs.redactNotificationError(sample),
      );
    }
  });

  it('builds the identical email payload as the legacy sendUpgradeNotification', async () => {
    const job = {
      stripe_event_id: 'evt_parity_1',
      organization_id: 7,
      organization_name: 'Acme <Studios> & "Sons"',
      owner_email: 'owner@example.test',
      owner_name: 'Owner',
      previous_plan: 'starter',
      new_plan: 'unlimited',
      notification_type: 'subscription_upgraded',
      notification_attempt_count: 1,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let legacyPayload: any = null;
    await legacyJobs.sendUpgradeNotification(job, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendEmail: async (payload: any) => {
        legacyPayload = payload;
        return { success: true, id: 'x' };
      },
    });
    const nestPayload = buildUpgradeNotificationEmail(job);
    expect(nestPayload.to).toBe(legacyPayload.to);
    expect(nestPayload.subject).toBe(legacyPayload.subject);
    expect(nestPayload.html).toBe(legacyPayload.html);
    expect(nestPayload.text).toBe(legacyPayload.text);
    expect(nestPayload.tags).toEqual(legacyPayload.tags);
    expect(nestPayload.idempotencyKey).toBe(legacyPayload.idempotencyKey);
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
