import { Injectable } from '@nestjs/common';
import { BillingPlanId, planDefinition } from '../billing/billing.constants';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AdminUserIdsInput, AdminUserSearchInput } from './admin-operations.inputs';
import { AdminOperationsRepository, AdminUserRow } from './admin-operations.repository';
import { AdminActivationFunnel, AdminJobQueueDetails, AdminJobQueueHealth, AdminOperationsSnapshot, AdminPlanUpdate, AdminProviderHealth, AdminSystemStats, AdminUser, AdminUserCount, AdminUserIds, AdminUserSearchResult } from './admin-operations.types';

const PLANS = new Set(['free', 'starter', 'unlimited', 'pro']);
const JOB_BUCKETS = new Set(['all', 'queued', 'processing', 'retrying', 'action_required']);
const FREE_LIMITS = {
  emails: 0,
  sms: 0,
  apiCalls: 0,
  contacts: 0,
  users: 0,
  workflows: 0,
  landingPages: 0,
  forms: 0,
  calendars: 0,
};

@Injectable()
export class AdminOperationsService {
  constructor(private readonly repository: AdminOperationsRepository) {}

  async userCount(): Promise<AdminUserCount> { return { count: await this.repository.userCount() }; }

  async search(input: AdminUserSearchInput = {}): Promise<AdminUserSearchResult> {
    const query = this.query(input.query);
    const plan = this.plan(input.plan, true);
    const page = input.page ?? 0;
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(page) || page < 0) this.bad('Page must be a non-negative integer', 'input.page');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) this.bad('Limit must be between 1 and 100', 'input.limit');
    const result = await this.repository.searchUsers({ query, plan, limit, offset: page * limit });
    return { users: result.rows.slice(0, limit).map(this.mapUser), total: result.total, hasMore: result.rows.length > limit };
  }

  async ids(input: AdminUserIdsInput = {}): Promise<AdminUserIds> {
    return { ids: await this.repository.userIds(this.query(input.query), this.plan(input.plan, true)) };
  }

  async byIds(ids: number[]): Promise<AdminUser[]> {
    if (ids.length > 100) this.bad('At most 100 user IDs may be requested', 'ids');
    const unique = [...new Set(ids)];
    if (unique.some((id) => !Number.isSafeInteger(id) || id < 1)) this.bad('User IDs must be positive integers', 'ids');
    return unique.length ? (await this.repository.usersByIds(unique)).map(this.mapUser) : [];
  }

  stats(): Promise<AdminSystemStats> { return this.repository.stats(); }

  async operationsSnapshot(): Promise<AdminOperationsSnapshot> {
    const snapshot = await this.repository.operationsSnapshot();
    const now = snapshot.asOf.getTime();
    const staleAfterMs = 15 * 60 * 1000;
    const queues: AdminJobQueueHealth[] = snapshot.queues.map((queue) => {
      const active = queue.queued + queue.processing + queue.retrying;
      const stale = queue.oldest_pending_at !== null
        && now - queue.oldest_pending_at.getTime() > staleAfterMs;
      const status = !queue.available || queue.action_required > 0
        ? 'action_required'
        : queue.retrying > 0 || stale
          ? 'degraded'
          : 'healthy';
      return {
        id: queue.id,
        name: queue.name,
        status,
        available: queue.available,
        queued: queue.queued,
        processing: queue.processing,
        retrying: queue.retrying,
        actionRequired: queue.action_required,
        active,
        oldestPendingAt: queue.oldest_pending_at,
      };
    });
    const providers = this.providers();
    const actionRequiredJobs = queues.reduce((total, queue) => total + queue.actionRequired, 0);
    const retryingJobs = queues.reduce((total, queue) => total + queue.retrying, 0);
    const activeJobs = queues.reduce((total, queue) => total + queue.active, 0);
    const status = queues.some((queue) => queue.status === 'action_required')
      || providers.some((provider) => provider.required && provider.status === 'incomplete')
      ? 'action_required'
      : queues.some((queue) => queue.status === 'degraded')
        ? 'degraded'
        : 'healthy';
    return {
      asOf: snapshot.asOf,
      status,
      activeJobs,
      retryingJobs,
      actionRequiredJobs,
      providers,
      queues,
    };
  }

  async jobQueueDetails(
    queueId: string,
    requestedBucket = 'all',
    requestedLimit = 25,
    requestedOffset = 0,
  ): Promise<AdminJobQueueDetails> {
    const normalizedQueueId = queueId.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(normalizedQueueId)) {
      this.bad('Queue ID is invalid', 'queueId');
    }
    const bucket = requestedBucket.trim().toLowerCase();
    if (!JOB_BUCKETS.has(bucket)) {
      this.bad('Bucket must be one of: all, queued, processing, retrying, action_required', 'bucket');
    }
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
      this.bad('Limit must be between 1 and 50', 'limit');
    }
    if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 10_000) {
      this.bad('Offset must be between 0 and 10000', 'offset');
    }
    const details = await this.repository.jobQueueDetails(
      normalizedQueueId,
      bucket,
      requestedLimit,
      requestedOffset,
    );
    if (!details) this.bad('Queue was not found', 'queueId');
    return {
      queueId: details.queueId,
      name: details.name,
      bucket,
      available: details.available,
      total: details.total,
      hasMore: requestedOffset + details.items.length < details.total,
      kindCounts: details.kindCounts,
      items: details.items.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: item.created_at,
        attemptCount: item.attempt_count,
        nextAttemptAt: item.next_attempt_at,
        leaseExpiresAt: item.lease_expires_at,
        kind: item.kind,
        reference: item.reference,
        lastError: this.redactOperationalError(item.last_error),
      })),
    };
  }

  async activationFunnel(days = 30): Promise<AdminActivationFunnel> {
    if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
      this.bad('Days must be between 1 and 365', 'days');
    }
    const row = await this.repository.activationFunnel(days);
    const created = Number(row.organizations_created);
    const verified = Number(row.organizations_verified);
    const workspace = Number(row.organizations_workspace_activated);
    const trials = Number(row.organizations_trial_started);
    const contacts = Number(row.organizations_contact_created);
    const artifacts = Number(row.organizations_artifact_created);
    const sent = Number(row.organizations_sent);
    const advanced = Number(row.organizations_advanced);
    const returned = Number(row.organizations_returned);
    const checkouts = Number(row.organizations_checkout_started);
    const subscriptions = Number(row.organizations_subscription_activated);
    const trialsSent = Number(row.trial_organizations_sent);
    const trialToPaid = Number(row.organizations_trial_to_paid);
    return {
      asOf: row.as_of,
      cohortStartedAt: row.cohort_started_at,
      cohortDays: days,
      organizationsCreated: created,
      organizationsVerified: verified,
      organizationsWorkspaceActivated: workspace,
      organizationsTrialStarted: trials,
      organizationsContactCreated: contacts,
      organizationsArtifactCreated: artifacts,
      organizationsSent: sent,
      organizationsAdvanced: advanced,
      organizationsReturned: returned,
      organizationsCheckoutStarted: checkouts,
      organizationsSubscriptionActivated: subscriptions,
      trialOrganizationsSent: trialsSent,
      organizationsTrialToPaid: trialToPaid,
      sendRate: this.rate(sent, created),
      verificationRate: this.rate(verified, created),
      workspaceActivationRate: this.rate(workspace, verified),
      trialStartRate: this.rate(trials, verified),
      contactCreationRate: this.rate(contacts, verified),
      artifactCreationRate: this.rate(artifacts, verified),
      artifactToSendRate: this.rate(sent, artifacts),
      checkoutStartRate: this.rate(checkouts, verified),
      subscriptionActivationRate: this.rate(subscriptions, checkouts),
      advanceRate: this.rate(advanced, sent),
      returnRate: this.rate(returned, sent),
      trialToPaidRate: this.rate(trialToPaid, trialsSent),
      medianHoursToWorkspace: this.optionalNumber(row.median_hours_to_workspace),
      medianHoursToTrial: this.optionalNumber(row.median_hours_to_trial),
      medianHoursToContact: this.optionalNumber(row.median_hours_to_contact),
      medianHoursToArtifact: this.optionalNumber(row.median_hours_to_artifact),
      medianHoursToSend: this.optionalNumber(row.median_hours_to_send),
      medianHoursToAdvance: this.optionalNumber(row.median_hours_to_advance),
      medianHoursToCheckout: this.optionalNumber(row.median_hours_to_checkout),
      medianHoursToSubscription: this.optionalNumber(row.median_hours_to_subscription),
    };
  }

  async updateOwnPlan(userId: number, requestedPlan: string): Promise<AdminPlanUpdate> {
    const plan = this.plan(requestedPlan, false)!;
    const definition = plan === 'free'
      ? undefined
      : planDefinition(plan as BillingPlanId);
    if (plan !== 'free' && !definition) this.bad(`Plan "${plan}" is unavailable`, 'plan');
    const result = await this.repository.updateOwnPlan(userId, plan, {
      status: plan === 'free' ? 'none' : 'active',
      limits: definition
        ? {
            emails: definition.limits.emails,
            sms: definition.limits.sms,
            apiCalls: definition.limits.apiCalls,
            contacts: definition.limits.contacts,
            users: definition.limits.users,
            workflows: definition.limits.workflows,
            landingPages: definition.limits.landingPages,
            forms: definition.limits.forms,
            calendars: definition.limits.calendars,
          }
        : FREE_LIMITS,
    });
    if (result === 'no_organization') this.bad('No organization associated with user', 'plan');
    if (result === 'plan_not_found') this.bad(`Plan "${plan}" is unavailable`, 'plan');
    return { message: `Plan updated to ${plan}`, plan };
  }

  private readonly mapUser = (row: AdminUserRow): AdminUser => ({
    id: row.id, email: row.email, name: row.name, role: row.role || 'USER',
    plan: row.plan || 'free', createdAt: row.created_at,
  });

  private providers(): AdminProviderHealth[] {
    const configured = (
      id: string,
      name: string,
      required: boolean,
      ready: boolean,
      configuredDetail: string,
      missingDetail: string,
    ): AdminProviderHealth => ({
      id,
      name,
      required,
      status: ready ? 'configured' : 'incomplete',
      detail: ready ? configuredDetail : missingDetail,
    });
    const malwareRequired = process.env.SIGNATURE_MALWARE_SCAN_REQUIRED === 'true';
    const malwareHost = Boolean(process.env.SIGNATURE_CLAMAV_HOST?.trim());
    const geminiEnabled = process.env.MARKETING_CHAT_AI_ENABLED !== 'false';
    return [
      {
        id: 'database', name: 'PostgreSQL', required: true,
        status: 'operational', detail: 'Operations query completed successfully',
      },
      configured(
        'resend', 'Resend', true, Boolean(process.env.RESEND_API_KEY?.trim()),
        'Email credentials are configured', 'Email credentials are missing',
      ),
      configured(
        'stripe', 'Stripe', true,
        Boolean(process.env.STRIPE_SECRET_KEY?.trim())
          && Boolean((process.env.STRIPE_INVOICE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET)?.trim()),
        'API and webhook credentials are configured', 'API or webhook credentials are missing',
      ),
      configured(
        's3', 'Amazon S3', true,
        Boolean(process.env.AWS_ACCESS_KEY_ID?.trim())
          && Boolean(process.env.AWS_SECRET_ACCESS_KEY?.trim()),
        'Object storage credentials are configured', 'Object storage credentials are missing',
      ),
      configured(
        'twilio', 'Twilio', false,
        Boolean(process.env.TWILIO_ACCOUNT_SID?.trim())
          && Boolean(process.env.TWILIO_AUTH_TOKEN?.trim())
          && Boolean(process.env.TWILIO_PHONE_NUMBER?.trim()),
        'SMS credentials and sender are configured', 'SMS is not fully configured',
      ),
      malwareHost
        ? { id: 'clamav', name: 'ClamAV', required: malwareRequired, status: 'configured', detail: 'Malware scanner endpoint is configured' }
        : { id: 'clamav', name: 'ClamAV', required: malwareRequired, status: malwareRequired ? 'incomplete' : 'disabled', detail: malwareRequired ? 'Required scanner endpoint is missing' : 'Malware scanning is optional and disabled' },
      process.env.GEMINI_API_KEY?.trim()
        ? { id: 'gemini', name: 'Gemini', required: false, status: 'configured', detail: 'AI credentials are configured' }
        : { id: 'gemini', name: 'Gemini', required: false, status: geminiEnabled ? 'incomplete' : 'disabled', detail: geminiEnabled ? 'AI credentials are missing' : 'Marketing AI is disabled' },
      {
        id: 'gleam', name: 'Gleam', required: false,
        status: 'disabled', detail: 'Gleam integration is not implemented',
      },
    ];
  }

  private query(value?: string): string | undefined {
    const query = value?.trim();
    if (!query) return undefined;
    if (query.length > 255) this.bad('Query must be at most 255 characters', 'input.query');
    return query;
  }

  private plan(value: string | undefined, allowAll: boolean): string | undefined {
    if (value === undefined || (allowAll && value.toLowerCase() === 'all')) return undefined;
    const plan = value.trim().toLowerCase();
    if (!PLANS.has(plan)) this.bad(`Plan must be one of: ${[...PLANS].join(', ')}`, 'plan');
    return plan;
  }

  private bad(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }

  private rate(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
  }

  private optionalNumber(value: number | null): number | null {
    if (value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
  }

  private redactOperationalError(value: string | null): string | null {
    if (!value) return null;
    return value
      .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, '[redacted-authorization]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
      .replace(/https?:\/\/\S+/gi, '[redacted-url]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
      .replace(/\b(?:re|sk|pk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
      .slice(0, 280);
  }
}
