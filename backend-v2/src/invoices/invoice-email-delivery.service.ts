import { Inject, Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { SendInvoiceInput } from './invoice.inputs';
import {
  INVOICE_EMAIL_PROVIDER,
  INVOICE_PAYMENT_LINK_PROVIDER,
  INVOICE_PDF_RENDERER,
  InvoiceEmailProvider,
  InvoicePaymentLinkProvider,
  InvoicePdfRenderer,
} from './invoice-delivery.providers';
import {
  InvoiceEmailDeliveryStatus,
  InvoiceSendResult,
} from './invoice-email-delivery.types';
import {
  InvoiceEmailDeliveryRow,
  InvoiceEmailPreparation,
  InvoicesRepository,
} from './invoices.repository';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] as string);

@Injectable()
export class InvoiceEmailDeliveryService {
  constructor(
    private readonly invoices: InvoicesRepository,
    @Inject(INVOICE_EMAIL_PROVIDER) private readonly email: InvoiceEmailProvider,
    @Inject(INVOICE_PAYMENT_LINK_PROVIDER) private readonly paymentLinks: InvoicePaymentLinkProvider,
    @Inject(INVOICE_PDF_RENDERER) private readonly pdf: InvoicePdfRenderer,
  ) {}

  async send(
    organizationId: number,
    userId: number,
    invoiceId: number,
    input: SendInvoiceInput,
  ): Promise<InvoiceSendResult> {
    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
      throw itemizeGraphqlError('id is invalid', 'BAD_USER_INPUT', {
        field: 'id', reason: 'INVALID_INVOICE_ID',
      });
    }
    const options = this.options(input);
    const prepared = await this.invoices.prepareEmailDelivery(
      organizationId, userId, invoiceId, options.idempotencyKey, options,
    );
    const delivery = this.prepared(prepared);
    if (delivery.status === 'sent' || ['dead_letter', 'reconciliation_required'].includes(delivery.status)) {
      return this.result(delivery, true);
    }
    return this.attempt(organizationId, delivery.id, prepared.kind === 'replayed');
  }

  async runDue(limit = 25): Promise<{ attempted: number; sent: number }> {
    const ids = await this.invoices.dueEmailDeliveryIds(Math.max(1, Math.min(limit, 100)));
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
  ): Promise<InvoiceSendResult> {
    let claimed = await this.invoices.claimEmailDelivery(organizationId, deliveryId);
    if (!claimed) {
      const current = await this.invoices.findEmailDelivery(organizationId, deliveryId);
      if (!current) throw new Error('Invoice email delivery disappeared');
      return this.result(current, true);
    }

    let paymentUrl = claimed.payment_url;
    if (claimed.payload.includePaymentLink && !paymentUrl) {
      const invoice = claimed.payload.invoice;
      try {
        const link = await this.paymentLinks.getOrCreate({
          invoiceId: claimed.invoice_id,
          invoiceNumber: String(invoice.invoice_number),
          organizationId,
          amountDue: String(invoice.amount_due),
          currency: String(invoice.currency || 'USD'),
          customerName: invoice.customer_name ? String(invoice.customer_name) : null,
          customerEmail: claimed.recipient_email,
          existingSessionId: invoice.stripe_payment_intent_id
            ? String(invoice.stripe_payment_intent_id) : null,
          idempotencyKey: `invoice-payment:${organizationId}:${claimed.id}`,
        });
        if (link.kind === 'rejected') {
          return this.result(await this.invoices.failEmailDelivery(
            organizationId, deliveryId, link.message, false,
          ), replayed);
        }
        claimed = await this.invoices.recordPaymentLink(
          organizationId, deliveryId, link.sessionId, link.url,
        );
        paymentUrl = link.url;
      } catch (error) {
        return this.result(await this.invoices.failEmailDelivery(
          organizationId, deliveryId, this.error(error), true,
        ), replayed);
      }
    }

    let attachment: Buffer;
    try {
      attachment = await this.pdf.render({
        invoice: claimed.payload.invoice,
        settings: claimed.payload.settings,
      });
      if (!Buffer.isBuffer(attachment) || attachment.length === 0) {
        throw new Error('Invoice PDF renderer returned an empty attachment');
      }
    } catch (error) {
      return this.result(await this.invoices.failEmailDelivery(
        organizationId, deliveryId, this.error(error), false,
      ), replayed);
    }

    try {
      const provider = await this.email.send({
        to: claimed.recipient_email,
        cc: claimed.payload.ccEmails,
        subject: claimed.subject,
        html: this.html(claimed, paymentUrl),
        filename: `${String(claimed.payload.invoice.invoice_number)}.pdf`,
        pdf: attachment,
        idempotencyKey: `invoice-email:${organizationId}:${claimed.id}`,
      });
      if (provider.kind === 'rejected') {
        return this.result(await this.invoices.failEmailDelivery(
          organizationId, deliveryId, provider.message, false,
        ), replayed);
      }
      return this.result(await this.invoices.completeEmailDelivery(
        organizationId, deliveryId, provider.providerId,
      ), replayed);
    } catch (error) {
      return this.result(await this.invoices.failEmailDelivery(
        organizationId, deliveryId, this.error(error), true,
      ), replayed);
    }
  }

  private options(input: SendInvoiceInput) {
    const idempotencyKey = String(input.idempotencyKey ?? '').trim();
    if (!KEY.test(idempotencyKey)) {
      throw itemizeGraphqlError('idempotencyKey must be 1-128 safe ASCII characters', 'BAD_USER_INPUT', {
        field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY',
      });
    }
    const subject = String(input.subject ?? '').trim();
    if (!subject || subject.length > 255) {
      throw itemizeGraphqlError('subject is invalid', 'BAD_USER_INPUT', {
        field: 'subject', reason: 'INVALID_INVOICE_EMAIL_SUBJECT',
      });
    }
    const message = String(input.message ?? '').trim();
    if (!message || message.length > 50_000) {
      throw itemizeGraphqlError('message is invalid', 'BAD_USER_INPUT', {
        field: 'message', reason: 'INVALID_INVOICE_EMAIL_MESSAGE',
      });
    }
    const ccEmails = [...new Set((input.ccEmails ?? []).map((value) => String(value).trim().toLowerCase()))];
    if (ccEmails.length > 20 || ccEmails.some((value) => !EMAIL.test(value))) {
      throw itemizeGraphqlError('ccEmails is invalid', 'BAD_USER_INPUT', {
        field: 'ccEmails', reason: 'INVALID_INVOICE_CC_EMAILS',
      });
    }
    return {
      idempotencyKey, subject, message, ccEmails,
      includePaymentLink: Boolean(input.includePaymentLink),
      resend: Boolean(input.resend),
    };
  }

  private prepared(outcome: InvoiceEmailPreparation): InvoiceEmailDeliveryRow {
    if (outcome.kind === 'created' || outcome.kind === 'replayed') return outcome.delivery;
    if (outcome.kind === 'not-found') {
      throw itemizeGraphqlError('Invoice not found', 'NOT_FOUND', { reason: 'INVOICE_NOT_FOUND' });
    }
    if (outcome.kind === 'missing-email') {
      throw itemizeGraphqlError('Customer email is required to send invoice', 'BAD_USER_INPUT', {
        field: 'customerEmail', reason: 'INVOICE_CUSTOMER_EMAIL_REQUIRED',
      });
    }
    if (outcome.kind === 'idempotency-conflict') {
      throw itemizeGraphqlError(
        'idempotencyKey was already used for a different invoice send request',
        'CONFLICT',
        { field: 'idempotencyKey', reason: 'INVOICE_SEND_IDEMPOTENCY_CONFLICT' },
      );
    }
    if (outcome.kind === 'delivery-in-progress') {
      throw itemizeGraphqlError(
        'Invoice already has an unresolved delivery',
        'CONFLICT',
        { reason: 'INVOICE_DELIVERY_IN_PROGRESS' },
      );
    }
    throw itemizeGraphqlError('Invoice cannot be sent in its current status', 'CONFLICT', {
      reason: 'INVOICE_SEND_INVALID_STATE',
    });
  }

  private result(row: InvoiceEmailDeliveryRow, replayed: boolean): InvoiceSendResult {
    const status = row.status as InvoiceEmailDeliveryStatus;
    return {
      success: status === InvoiceEmailDeliveryStatus.SENT,
      emailSent: status === InvoiceEmailDeliveryStatus.SENT,
      replayed,
      deliveryId: Number(row.id),
      status,
    };
  }

  private html(delivery: InvoiceEmailDeliveryRow, paymentUrl: string | null): string {
    const message = escapeHtml(delivery.payload.message);
    const link = paymentUrl
      ? `<div style="text-align:center;margin:24px 0"><a href="${escapeHtml(paymentUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500">Pay Now</a></div>`
      : '';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>' +
      `<body style="font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:24px">` +
      `<div style="white-space:pre-wrap;line-height:1.6">${message}</div>${link}</div></body></html>`;
  }

  private error(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown provider failure';
  }
}
