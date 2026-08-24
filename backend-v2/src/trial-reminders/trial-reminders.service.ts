/**
 * NestJS owner of the daily trial reminder job. The legacy
 * implementation (backend/src/jobs/trialReminderCron.js +
 * backend/src/services/trialEmailService.js) has been dead code since
 * inception: it required backend/src/db expecting a pg pool but that
 * module exports helper functions, so every finder query crashed into
 * its catch and returned zero organizations; even with a pool, its
 * JOIN used users.organization_id, a column that does not exist. This
 * port implements the intended behavior: organizations trialing with
 * trial_ends_at exactly three days out, without a prior
 * 'trial_reminder' email log, resolved to their owner through
 * organization_members (the canonical owner lookup used by the
 * subscription notification worker), with the reminder email content
 * transliterated from trialEmailService.sendTrialReminderEmail.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import {
  TrialReminderDeliveryClaim,
  TrialRemindersRepository,
} from './trial-reminders.repository';
import { integerEnvironmentValue } from '../common/runtime-config';

// Legacy branded-transactional-email escapeHtml: coerces any value.
const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] as string,
  );

export type TrialReminderEmail = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export type TrialReminderSendResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'rejected'; error: string; retryable: boolean };

export const TRIAL_REMINDER_EMAIL_PROVIDER = Symbol(
  'TRIAL_REMINDER_EMAIL_PROVIDER',
);

export interface TrialReminderEmailProvider {
  send(message: TrialReminderEmail): Promise<TrialReminderSendResult>;
}

@Injectable()
export class ResendTrialReminderEmailProvider
  implements TrialReminderEmailProvider
{
  async send(message: TrialReminderEmail): Promise<TrialReminderSendResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return {
        kind: 'rejected',
        error: 'Email service not configured',
        retryable: false,
      };
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || 'Itemize <noreply@itemize.cloud>',
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return {
        kind: 'rejected',
        error:
          body.message ||
          body.error?.message ||
          `Email provider rejected the request (${response.status})`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    return { kind: 'sent', providerId: body.id || null };
  }
}

export type TrialReminderRun = {
  found: number;
  sent: number;
  failed: number;
};

export function buildTrialReminderEmail(candidate: {
  organization_name: string | null;
  owner_email: string;
  owner_name: string | null;
  trial_ends_at: Date;
  plan: string | null;
  daysRemaining: number;
  addPaymentUrl: string;
  idempotencyKey: string;
}): TrialReminderEmail {
  const trialEndFormatted = new Date(candidate.trial_ends_at).toLocaleDateString(
    'en-US',
    {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
  );
  const planName = candidate.plan || 'trial';
  return {
    to: candidate.owner_email,
    subject: `Your Itemize trial ends in ${candidate.daysRemaining} days`,
    idempotencyKey: candidate.idempotencyKey,
    html: brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `Your Itemize trial ends in ${candidate.daysRemaining} days.`,
      heading: 'Your trial is ending soon',
      bodyHtml:
        `<p style="margin:0 0 16px">Hi ${escapeHtml(candidate.owner_name || 'there')},</p>` +
        `<p style="margin:0">Your ${escapeHtml(planName)} trial for ${escapeHtml(candidate.organization_name || 'your workspace')} ends in <strong>${escapeHtml(candidate.daysRemaining)} days</strong>.</p>` +
        `<div style="margin-top:20px;padding:14px 16px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e">Trial access ends on <strong>${escapeHtml(trialEndFormatted)}</strong>.</div>`,
      cta: { label: 'Add payment method', url: candidate.addPaymentUrl },
      footerText: 'Trial notification from Itemize.',
    }),
  };
}

@Injectable()
export class TrialRemindersService {
  private readonly logger = new Logger(TrialRemindersService.name);

  constructor(
    private readonly repository: TrialRemindersRepository,
    @Inject(TRIAL_REMINDER_EMAIL_PROVIDER)
    private readonly emailProvider: TrialReminderEmailProvider,
  ) {}

  private threeDayWindow(): { start: Date; end: Date } {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(0, 0, 0, 0);
    const threeDaysFromNowEnd = new Date(threeDaysFromNow);
    threeDaysFromNowEnd.setHours(23, 59, 59, 999);
    return { start: threeDaysFromNow, end: threeDaysFromNowEnd };
  }

  async sendTrialReminders(): Promise<TrialReminderRun> {
    const window = this.threeDayWindow();
    await this.repository.enqueueEligible(window.start, window.end);
    await this.repository.cancelIneligible();
    const batchSize = integerEnvironmentValue(
      process.env,
      'TRIAL_REMINDER_BATCH_SIZE',
      100,
      1,
      500,
    );
    const leaseSeconds = integerEnvironmentValue(
      process.env,
      'TRIAL_REMINDER_LEASE_SECONDS',
      300,
      30,
      3_600,
    );
    const maxAttempts = integerEnvironmentValue(
      process.env,
      'TRIAL_REMINDER_MAX_ATTEMPTS',
      5,
      1,
      20,
    );
    const dueIds = await this.repository.dueIds(batchSize);
    const summary: TrialReminderRun = {
      found: dueIds.length,
      sent: 0,
      failed: 0,
    };

    for (const id of dueIds) {
      const claim = await this.repository.claim(id, leaseSeconds);
      if (!claim) continue;
      try {
        if (!claim.recipient_email) {
          throw Object.assign(
            new Error('Trial reminder has no owner recipient'),
            { retryable: false },
          );
        }
        const message = this.message(claim);
        const result = await this.emailProvider.send(message);
        if (result.kind === 'rejected') {
          await this.repository.fail(
            claim,
            result.error,
            result.retryable,
            maxAttempts,
          );
          summary.failed += 1;
          continue;
        }
        if (await this.repository.complete(claim, result.providerId)) {
          summary.sent += 1;
        }
      } catch (error) {
        await this.repository.fail(
          claim,
          error,
          (error as { retryable?: boolean })?.retryable !== false,
          maxAttempts,
        );
        summary.failed += 1;
        this.logger.error(
          `Trial reminder delivery ${claim.id} failed: ${
            (error as Error).message
          }`,
        );
      }
    }
    return summary;
  }

  private message(claim: TrialReminderDeliveryClaim): TrialReminderEmail {
    return buildTrialReminderEmail({
      organization_name: claim.organization_name,
      owner_email: claim.recipient_email as string,
      owner_name: claim.recipient_name,
      trial_ends_at: claim.trial_ends_at,
      plan: claim.plan,
      daysRemaining: 3,
      addPaymentUrl: `${process.env.FRONTEND_URL || 'https://itemize.cloud'}/settings?tab=billing`,
      idempotencyKey: `trial-reminder:${claim.organization_id}:${new Date(
        claim.trial_ends_at,
      ).toISOString()}`,
    });
  }

}
