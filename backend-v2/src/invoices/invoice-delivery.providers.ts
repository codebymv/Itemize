import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type InvoiceEmailMessage = {
  to: string;
  cc: string[];
  subject: string;
  html: string;
  filename: string;
  pdf: Buffer;
  idempotencyKey: string;
};

export type InvoiceProviderResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'rejected'; message: string };

export const INVOICE_EMAIL_PROVIDER = Symbol('INVOICE_EMAIL_PROVIDER');
export interface InvoiceEmailProvider {
  send(message: InvoiceEmailMessage): Promise<InvoiceProviderResult>;
}

@Injectable()
export class ResendInvoiceEmailProvider implements InvoiceEmailProvider {
  async send(message: InvoiceEmailMessage): Promise<InvoiceProviderResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return { kind: 'rejected', message: 'Email service is not configured' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev',
        to: [message.to],
        ...(message.cc.length > 0 ? { cc: message.cc } : {}),
        subject: message.subject,
        html: message.html,
        attachments: [{
          filename: message.filename,
          content: message.pdf.toString('base64'),
        }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string; message?: string; error?: { message?: string };
    };
    if (!response.ok) {
      return {
        kind: 'rejected',
        message: body.message || body.error?.message ||
          `Email provider rejected the request (${response.status})`,
      };
    }
    return { kind: 'sent', providerId: body.id ?? null };
  }
}

export type PaymentLinkRequest = {
  invoiceId: number;
  invoiceNumber: string;
  organizationId: number;
  amountDue: string;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  existingSessionId: string | null;
  idempotencyKey: string;
};

export type PaymentLinkResult =
  | { kind: 'ready'; sessionId: string; url: string }
  | { kind: 'rejected'; message: string };

export const INVOICE_PAYMENT_LINK_PROVIDER = Symbol('INVOICE_PAYMENT_LINK_PROVIDER');
export interface InvoicePaymentLinkProvider {
  getOrCreate(request: PaymentLinkRequest): Promise<PaymentLinkResult>;
}

@Injectable()
export class StripeInvoicePaymentLinkProvider implements InvoicePaymentLinkProvider {
  async getOrCreate(request: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) return { kind: 'rejected', message: 'Stripe is not configured' };
    const amount = Math.round(Number(request.amountDue) * 100);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return { kind: 'rejected', message: 'Invoice has no payable balance' };
    }
    if (request.existingSessionId) {
      const existing = await this.request(
        `/v1/checkout/sessions/${encodeURIComponent(request.existingSessionId)}`,
        secret,
      );
      const metadata = existing.body.metadata as Record<string, unknown> | undefined;
      if (
        existing.ok && existing.body.status === 'open' && existing.body.url &&
        Number(existing.body.amount_total) === amount &&
        String(existing.body.currency ?? '').toUpperCase() === request.currency.toUpperCase() &&
        String(metadata?.invoice_id ?? '') === String(request.invoiceId) &&
        String(metadata?.organization_id ?? '') === String(request.organizationId)
      ) {
        return {
          kind: 'ready', sessionId: request.existingSessionId,
          url: String(existing.body.url),
        };
      }
    }
    const origin = this.frontendOrigin();
    const form = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': request.currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': `Invoice ${request.invoiceNumber}`,
      'line_items[0][price_data][product_data][description]':
        request.customerName || 'Invoice Payment',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][quantity]': '1',
      success_url: `${origin}/invoices?payment=success&invoice=${request.invoiceId}`,
      cancel_url: `${origin}/invoices?payment=cancelled&invoice=${request.invoiceId}`,
      'metadata[invoice_id]': String(request.invoiceId),
      'metadata[invoice_number]': request.invoiceNumber,
      'metadata[organization_id]': String(request.organizationId),
    });
    if (request.customerEmail) form.set('customer_email', request.customerEmail);
    const created = await this.request('/v1/checkout/sessions', secret, form, request.idempotencyKey);
    if (!created.ok || !created.body.id || !created.body.url) {
      return {
        kind: 'rejected',
        message: String(created.body.error?.message || 'Stripe rejected payment-link creation'),
      };
    }
    return { kind: 'ready', sessionId: String(created.body.id), url: String(created.body.url) };
  }

  private async request(
    path: string,
    secret: string,
    form?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<{ ok: boolean; body: Record<string, any> }> {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: form ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(form ? { body: form.toString() } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: response.ok,
      body: await response.json().catch(() => ({})) as Record<string, any>,
    };
  }

  private frontendOrigin(): string {
    try {
      const url = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      return ['http:', 'https:'].includes(url.protocol) ? url.origin : 'http://localhost:5173';
    } catch {
      return 'http://localhost:5173';
    }
  }
}

export type InvoicePdfSnapshot = {
  invoice: Record<string, any>;
  settings: Record<string, any>;
};

export const INVOICE_PDF_RENDERER = Symbol('INVOICE_PDF_RENDERER');
export interface InvoicePdfRenderer {
  render(snapshot: InvoicePdfSnapshot): Promise<Buffer>;
}

@Injectable()
export class LegacyInvoicePdfRenderer implements InvoicePdfRenderer {
  async render(snapshot: InvoicePdfSnapshot): Promise<Buffer> {
    const candidates = [
      resolve(process.cwd(), 'backend/src/services/pdf.service.js'),
      resolve(process.cwd(), '../backend/src/services/pdf.service.js'),
      resolve(__dirname, '../../../backend/src/services/pdf.service.js'),
    ];
    const servicePath = candidates.find(existsSync);
    if (!servicePath) throw new Error('Invoice PDF renderer is unavailable');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const service = require(servicePath) as {
      isPDFAvailable(): boolean;
      generateInvoicePDF(invoice: Record<string, any>, settings: Record<string, any>): Promise<Buffer>;
    };
    if (!service.isPDFAvailable()) throw new Error('Invoice PDF renderer is unavailable');
    return service.generateInvoicePDF(snapshot.invoice, snapshot.settings);
  }
}
