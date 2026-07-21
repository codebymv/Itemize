import { Inject, Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  CAMPAIGN_TEST_EMAIL_PROVIDER,
  CampaignTestEmailProvider,
} from './campaign-test-email.provider';
import {
  CampaignTestEmailDeliveryRow,
  CampaignTestEmailRepository,
} from './campaign-test-email.repository';
import {
  CampaignTestEmailDeliveryStatus,
  CampaignTestEmailResult,
} from './campaign-test-email.types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
export class CampaignTestEmailService {
  constructor(
    private readonly deliveries: CampaignTestEmailRepository,
    @Inject(CAMPAIGN_TEST_EMAIL_PROVIDER)
    private readonly provider: CampaignTestEmailProvider,
  ) {}

  async send(
    organizationId: number,
    userId: number,
    campaignId: number,
    testEmail: string,
    idempotencyKey: string,
  ): Promise<CampaignTestEmailResult> {
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
      throw itemizeGraphqlError('campaignId must be a positive integer', 'BAD_USER_INPUT', {
        field: 'campaignId', reason: 'INVALID_CAMPAIGN_ID',
      });
    }
    const email = String(testEmail ?? '').trim();
    if (!email || email.length > 254 || !EMAIL.test(email)) {
      throw itemizeGraphqlError('testEmail must be a valid email address', 'BAD_USER_INPUT', {
        field: 'testEmail', reason: 'INVALID_CAMPAIGN_TEST_EMAIL',
      });
    }
    const key = String(idempotencyKey ?? '').trim();
    if (!KEY.test(key)) {
      throw itemizeGraphqlError(
        'idempotencyKey must be 1-128 safe ASCII characters',
        'BAD_USER_INPUT',
        { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
      );
    }
    const prepared = await this.deliveries.prepare(
      organizationId, userId, campaignId, email, key,
    );
    if (prepared.kind === 'not_found') {
      throw itemizeGraphqlError('Campaign not found', 'NOT_FOUND', {
        reason: 'CAMPAIGN_NOT_FOUND',
      });
    }
    if (prepared.kind === 'key_conflict') {
      throw itemizeGraphqlError('idempotencyKey was already used for a different test email', 'CONFLICT', {
        field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    const delivery = prepared.delivery;
    if (['sent', 'dead_letter', 'reconciliation_required'].includes(delivery.status)) {
      return this.result(delivery, true);
    }
    return this.attempt(organizationId, delivery.id, prepared.kind === 'replayed');
  }

  async runDue(limit = 25): Promise<{ attempted: number; sent: number }> {
    const due = await this.deliveries.due(Math.max(1, Math.min(limit, 100)));
    let sent = 0;
    for (const delivery of due) {
      const result = await this.attempt(delivery.organizationId, delivery.id, false);
      if (result.success) sent += 1;
    }
    return { attempted: due.length, sent };
  }

  private async attempt(
    organizationId: number,
    deliveryId: number,
    replayed: boolean,
  ): Promise<CampaignTestEmailResult> {
    const claimed = await this.deliveries.claim(organizationId, deliveryId);
    if (!claimed) {
      const current = await this.deliveries.find(organizationId, deliveryId);
      if (!current) throw new Error('Campaign test email delivery disappeared');
      return this.result(current, true);
    }
    try {
      const providerResult = await this.provider.send({
        to: claimed.recipient_email,
        subject: claimed.subject,
        html: claimed.payload.html,
        text: claimed.payload.text,
        fromName: claimed.payload.fromName,
        fromEmail: claimed.payload.fromEmail,
        replyTo: claimed.payload.replyTo,
        idempotencyKey: `campaign-test-email:${claimed.organization_id}:${claimed.id}`,
      });
      if (providerResult.kind === 'rejected') {
        return this.result(await this.deliveries.fail(
          organizationId, deliveryId, providerResult.message, false,
        ), replayed);
      }
      return this.result(await this.deliveries.complete(
        organizationId, deliveryId, providerResult.providerId,
      ), replayed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider failure';
      return this.result(await this.deliveries.fail(
        organizationId, deliveryId, message, true,
      ), replayed);
    }
  }

  private result(row: CampaignTestEmailDeliveryRow, replayed: boolean): CampaignTestEmailResult {
    const status = row.status as CampaignTestEmailDeliveryStatus;
    const success = status === CampaignTestEmailDeliveryStatus.SENT;
    return {
      success,
      replayed,
      deliveryId: Number(row.id),
      status,
      emailId: row.provider_id,
      message: success
        ? `Test email sent to ${row.recipient_email}`
        : `Test email delivery is ${status}`,
    };
  }
}
