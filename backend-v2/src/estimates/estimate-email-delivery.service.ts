import { Inject, Injectable } from '@nestjs/common';
import { ActivationService } from '../activation/activation.service';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
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
  EstimateResponseEmailPayload,
  EstimatesRepository,
} from './estimates.repository';
import { estimateDeliveryToken } from './estimate-public.token';

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
    private readonly activation: ActivationService,
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
    return this.attempt(organizationId, delivery.id, prepared.kind === 'replayed', userId);
  }

  async runDue(limit = 25): Promise<{ attempted: number; sent: number }> {
    const ids = await this.estimates.dueEmailDeliveryIds(Math.max(1, Math.min(limit, 100)));
    let sent = 0;
    for (const delivery of ids) {
      const result = await this.attempt(delivery.organizationId, delivery.id, false, null);
      if (result.emailSent) sent += 1;
    }
    return { attempted: ids.length, sent };
  }

  private async attempt(
    organizationId: number,
    deliveryId: number,
    replayed: boolean,
    userId: number | null,
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
        html: this.html(claimed),
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
      if (claimed.delivery_type === 'estimate_sent') {
        await this.activation.recordArtifactSent({
          organizationId,
          userId,
          artifactType: 'estimate',
          artifactId: Number(claimed.estimate_id),
          source: 'estimate_email_delivered',
        });
      }
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

  private html(delivery: EstimateEmailDeliveryRow): string {
    return delivery.delivery_type === 'estimate_sent'
      ? this.estimateHtml(delivery, delivery.payload as EstimateEmailPayload)
      : this.responseHtml(delivery, delivery.payload as EstimateResponseEmailPayload);
  }

  private estimateHtml(
    delivery: EstimateEmailDeliveryRow,
    payload: EstimateEmailPayload,
  ): string {
    const customer = payload.customerName?.trim() || 'Valued Customer';
    const business = payload.businessName?.trim() || 'Itemize workspace';
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: payload.currency || 'USD',
    }).format(Number(payload.total));
    const publicUrl = `${this.frontendOrigin()}/estimate/${estimateDeliveryToken(
      Number(delivery.organization_id),
      Number(delivery.estimate_id),
      delivery.idempotency_key,
    )}`;
    const businessEmail = payload.businessEmail
      ? `<p style="margin:16px 0 0;color:#64748b;font-size:13px">${escapeHtml(payload.businessEmail)}</p>`
      : '';
    const bodyHtml =
      `<p style="margin:0 0 16px">Hi ${escapeHtml(customer)},</p>` +
      `<p style="margin:0 0 22px">${escapeHtml(business)} sent you an estimate to review.</p>` +
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">` +
      `<tr><td style="padding:16px 18px;color:#64748b;font-size:13px">Total</td><td align="right" style="padding:16px 18px;color:#0f172a;font-size:18px;font-weight:700">${escapeHtml(amount)}</td></tr>` +
      `<tr><td style="padding:0 18px 16px;color:#64748b;font-size:13px">Valid until</td><td align="right" style="padding:0 18px 16px;color:#334155;font-size:13px;font-weight:600">${escapeHtml(payload.validUntil)}</td></tr>` +
      `</table>${businessEmail}`;
    return brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `${business} sent you an estimate for ${amount}.`,
      heading: `A new estimate from ${business}`,
      bodyHtml,
      cta: { label: 'Review estimate', url: publicUrl },
      footerText: 'This private link provides access to your estimate. Please do not forward it.',
    });
  }

  private responseHtml(
    delivery: EstimateEmailDeliveryRow,
    payload: EstimateResponseEmailPayload,
  ): string {
    const accepted = delivery.delivery_type === 'estimate_accepted';
    const response = accepted ? 'accepted' : 'declined';
    const customer = payload.customerName?.trim() || 'Your customer';
    const recipient = payload.recipientName?.trim();
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: payload.currency || 'USD',
    }).format(Number(payload.total));
    const responseTime = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
    }).format(new Date(payload.respondedAt));
    const greeting = recipient
      ? `<p style="margin:0 0 16px">Hi ${escapeHtml(recipient)},</p>`
      : '';
    const bodyHtml = greeting
      + `<p style="margin:0 0 22px"><strong>${escapeHtml(customer)}</strong> ${response} your estimate.</p>`
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">`
      + `<tr><td style="padding:16px 18px;color:#64748b;font-size:13px">Status</td><td align="right" style="padding:16px 18px;color:#0f172a;font-size:15px;font-weight:700;text-transform:capitalize">${response}</td></tr>`
      + `<tr><td style="padding:0 18px 12px;color:#64748b;font-size:13px">Total</td><td align="right" style="padding:0 18px 12px;color:#0f172a;font-size:15px;font-weight:700">${escapeHtml(amount)}</td></tr>`
      + `<tr><td style="padding:0 18px 16px;color:#64748b;font-size:13px">Received</td><td align="right" style="padding:0 18px 16px;color:#334155;font-size:13px;font-weight:600">${escapeHtml(responseTime)}</td></tr>`
      + `</table>`;
    return brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `${customer} ${response} your estimate for ${amount}.`,
      heading: `Estimate ${response}`,
      bodyHtml,
      cta: {
        label: 'View estimate',
        url: `${this.frontendOrigin()}/estimates/${delivery.estimate_id}`,
      },
      footerText: `This response was recorded for ${payload.businessName || 'your workspace'}.`,
    });
  }

  private frontendOrigin(): string {
    const fallback = process.env.NODE_ENV === 'production'
      ? 'https://itemize.cloud'
      : 'http://localhost:5173';
    try {
      const configured = new URL(process.env.FRONTEND_URL ?? fallback);
      return ['http:', 'https:'].includes(configured.protocol)
        ? configured.origin
        : fallback;
    } catch {
      return fallback;
    }
  }

}
