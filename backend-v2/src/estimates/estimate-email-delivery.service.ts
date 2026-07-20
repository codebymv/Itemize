import { Inject, Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  ESTIMATE_EMAIL_PROVIDER,
  EstimateEmailProvider,
} from './estimate-email.provider';
import {
  EstimateEmailDeliveryStatus,
  EstimateSendResult,
} from './estimate-email-delivery.types';
import {
  EstimateEmailDeliveryRow,
  EstimateEmailPayload,
  EstimateEmailPreparation,
  EstimatesRepository,
} from './estimates.repository';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] as string);

@Injectable()
export class EstimateEmailDeliveryService {
  constructor(
    private readonly estimates: EstimatesRepository,
    @Inject(ESTIMATE_EMAIL_PROVIDER)
    private readonly provider: EstimateEmailProvider,
  ) {}

  async send(
    organizationId: number,
    userId: number,
    estimateId: number,
    idempotencyKey: string,
  ): Promise<EstimateSendResult> {
    if (!Number.isSafeInteger(estimateId) || estimateId < 1) {
      throw itemizeGraphqlError('id is invalid', 'BAD_USER_INPUT', {
        field: 'id', reason: 'INVALID_ESTIMATE_ID',
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
    const prepared = await this.estimates.prepareEmailDelivery(
      organizationId, userId, estimateId, key,
    );
    const delivery = this.prepared(prepared);
    if (delivery.status === 'sent') return this.result(delivery, true);
    if (['dead_letter', 'reconciliation_required'].includes(delivery.status)) {
      return this.result(delivery, true);
    }
    return this.attempt(organizationId, delivery.id, prepared.kind === 'replayed');
  }

  async runDue(limit = 25): Promise<{ attempted: number; sent: number }> {
    const ids = await this.estimates.dueEmailDeliveryIds(Math.max(1, Math.min(limit, 100)));
    let sent = 0;
    for (const delivery of ids) {
      const result = await this.attempt(delivery.organizationId, delivery.id, false);
      if (result.emailSent) sent += 1;
    }
    return { attempted: ids.length, sent };
  }

  private async attempt(
    organizationId: number,
    deliveryId: number,
    replayed: boolean,
  ): Promise<EstimateSendResult> {
    const claimed = await this.estimates.claimEmailDelivery(organizationId, deliveryId);
    if (!claimed) {
      const current = await this.estimates.findEmailDelivery(organizationId, deliveryId);
      if (!current) throw new Error('Estimate email delivery disappeared');
      return this.result(current, true);
    }
    try {
      const providerResult = await this.provider.send({
        to: claimed.recipient_email,
        subject: claimed.subject,
        html: this.html(claimed.payload),
        idempotencyKey: `estimate-email:${claimed.organization_id}:${claimed.id}`,
      });
      if (providerResult.kind === 'rejected') {
        const failed = await this.estimates.failEmailDelivery(
          organizationId, deliveryId, providerResult.message, false,
        );
        return this.result(failed, replayed);
      }
      const completed = await this.estimates.completeEmailDelivery(
        organizationId, deliveryId, providerResult.providerId,
      );
      return this.result(completed, replayed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider failure';
      const ambiguous = await this.estimates.failEmailDelivery(
        organizationId, deliveryId, message, true,
      );
      return this.result(ambiguous, replayed);
    }
  }

  private prepared(outcome: EstimateEmailPreparation): EstimateEmailDeliveryRow {
    if (outcome.kind === 'created' || outcome.kind === 'replayed') return outcome.delivery;
    if (outcome.kind === 'not-found') {
      throw itemizeGraphqlError('Estimate not found', 'NOT_FOUND', {
        reason: 'ESTIMATE_NOT_FOUND',
      });
    }
    if (outcome.kind === 'missing-email') {
      throw itemizeGraphqlError('Customer email is required to send estimate', 'BAD_USER_INPUT', {
        field: 'customerEmail', reason: 'ESTIMATE_CUSTOMER_EMAIL_REQUIRED',
      });
    }
    throw itemizeGraphqlError('Estimate cannot be sent in its current status', 'CONFLICT', {
      reason: 'ESTIMATE_SEND_INVALID_STATE',
    });
  }

  private result(row: EstimateEmailDeliveryRow, replayed: boolean): EstimateSendResult {
    const status = row.status as EstimateEmailDeliveryStatus;
    return {
      success: status === EstimateEmailDeliveryStatus.SENT,
      emailSent: status === EstimateEmailDeliveryStatus.SENT,
      replayed,
      deliveryId: Number(row.id),
      status,
    };
  }

  private html(payload: EstimateEmailPayload): string {
    const customer = payload.customerName?.trim() || 'Valued Customer';
    const business = payload.businessName?.trim() || 'Our Company';
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: payload.currency || 'USD',
    }).format(Number(payload.total));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(payload.subject)}</title></head>` +
      `<body style="font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:24px">` +
      `<h1 style="font-size:24px">Estimate ${escapeHtml(payload.estimateNumber)}</h1>` +
      `<p>Dear ${escapeHtml(customer)},</p><p>Please find your estimate from ${escapeHtml(business)}.</p>` +
      `<p><strong>Total:</strong> ${escapeHtml(amount)}<br><strong>Valid until:</strong> ${escapeHtml(payload.validUntil)}</p>` +
      `<p>Best regards,<br>${escapeHtml(business)}</p>` +
      (payload.businessEmail ? `<p style="color:#6b7280">${escapeHtml(payload.businessEmail)}</p>` : '') +
      `</div></body></html>`;
  }
}
