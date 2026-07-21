import { Inject, Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { CampaignsService } from '../campaigns/campaigns.service';
import {
  CAMPAIGN_TEST_EMAIL_PROVIDER,
  CampaignTestEmailProvider,
} from './campaign-test-email.provider';
import { CampaignSendRepository } from './campaign-send.repository';
import { CampaignSendResult } from './campaign-send.types';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const substitute = (value: string | null, data: Record<string, string>): string | null => {
  if (value === null) return null;
  let result = value;
  for (const [key, replacement] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), () => replacement);
  }
  return result;
};

@Injectable()
export class CampaignSendService {
  constructor(
    private readonly deliveries: CampaignSendRepository,
    private readonly campaigns: CampaignsService,
    @Inject(CAMPAIGN_TEST_EMAIL_PROVIDER)
    private readonly provider: CampaignTestEmailProvider,
  ) {}

  async send(
    organizationId: number,
    userId: number,
    campaignId: number,
    idempotencyKey: string,
  ): Promise<CampaignSendResult> {
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
      throw itemizeGraphqlError('campaignId must be a positive integer', 'BAD_USER_INPUT', {
        field: 'campaignId', reason: 'INVALID_CAMPAIGN_ID',
      });
    }
    const key = String(idempotencyKey ?? '').trim();
    if (!KEY.test(key)) {
      throw itemizeGraphqlError('idempotencyKey must be 1-128 safe ASCII characters', 'BAD_USER_INPUT', {
        field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY',
      });
    }
    const prepared = await this.deliveries.prepare(organizationId, userId, campaignId, key);
    if (prepared.kind === 'not_found') {
      throw itemizeGraphqlError('Campaign not found', 'NOT_FOUND', { reason: 'CAMPAIGN_NOT_FOUND' });
    }
    if (prepared.kind === 'invalid_status') {
      throw itemizeGraphqlError('Campaign cannot be sent in its current state', 'BAD_USER_INPUT', {
        field: 'status', reason: 'INVALID_CAMPAIGN_STATE', actualStatus: prepared.status,
      });
    }
    if (prepared.kind === 'no_recipients') {
      throw itemizeGraphqlError('No eligible recipients found', 'BAD_USER_INPUT', {
        reason: 'CAMPAIGN_HAS_NO_RECIPIENTS',
      });
    }
    if (prepared.kind === 'subscription_unavailable') {
      throw itemizeGraphqlError('Email usage entitlement is unavailable', 'FORBIDDEN', {
        reason: 'EMAIL_ENTITLEMENT_UNAVAILABLE',
      });
    }
    if (prepared.kind === 'usage_exceeded') {
      throw itemizeGraphqlError('Monthly email limit would be exceeded', 'FORBIDDEN', {
        reason: 'EMAIL_USAGE_LIMIT_EXCEEDED', limit: prepared.limit,
        current: prepared.current, requested: prepared.requested,
      });
    }
    if (prepared.kind === 'key_conflict') {
      throw itemizeGraphqlError('idempotencyKey was already used for another campaign', 'CONFLICT', {
        field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    return {
      campaign: await this.campaigns.detail(organizationId, campaignId),
      recipientCount: prepared.recipientCount,
      deliveryJobId: prepared.jobId,
      replayed: prepared.kind === 'replayed',
      message: prepared.kind === 'replayed'
        ? 'Campaign send was already accepted'
        : 'Campaign is now sending',
    };
  }

  async runDue(limit = 100): Promise<{ attempted: number; sent: number }> {
    const due = await this.deliveries.due(Math.max(1, Math.min(limit, 500)));
    let sent = 0;
    for (const recipient of due) {
      const claimed = await this.deliveries.claim(recipient.organizationId, recipient.id);
      if (!claimed) continue;
      const data = {
        first_name: claimed.first_name ?? '',
        last_name: claimed.last_name ?? '',
        email: claimed.email,
        full_name: [claimed.first_name, claimed.last_name].filter(Boolean).join(' '),
      };
      try {
        const result = await this.provider.send({
          to: claimed.email,
          subject: substitute(claimed.payload.subject, data) ?? claimed.payload.subject,
          html: substitute(claimed.payload.html, data) ?? '',
          text: substitute(claimed.payload.text, data),
          fromName: claimed.payload.fromName,
          fromEmail: claimed.payload.fromEmail,
          replyTo: claimed.payload.replyTo,
          idempotencyKey: `campaign-recipient-email:${claimed.organization_id}:${claimed.id}`,
        });
        if (result.kind === 'rejected') {
          await this.deliveries.fail(
            claimed.organization_id, claimed.id, result.message, false,
          );
        } else {
          await this.deliveries.complete(
            claimed.organization_id, claimed.id, result.providerId,
          );
          sent += 1;
        }
      } catch (error) {
        await this.deliveries.fail(
          claimed.organization_id,
          claimed.id,
          error instanceof Error ? error.message : 'Unknown provider failure',
          true,
        );
      }
    }
    return { attempted: due.length, sent };
  }
}
