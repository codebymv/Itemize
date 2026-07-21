import { lookup as dnsLookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import {
  asRecord,
  workflowWebhookAddressIsPublic,
  workflowWebhookHeaders,
  workflowWebhookUrl,
} from './workflow-enrollment.util';

export type WorkflowProviderResult = { providerId: string | null };

export class WorkflowDeliveryError extends Error {
  constructor(message: string, public readonly retryable = true, public readonly providerOutcomeUnknown = false) {
    super(message);
    this.name = 'WorkflowDeliveryError';
  }
}

export type WorkflowEmailMessage = {
  to: string; subject: string; html: string; text?: string; from?: string; replyTo?: string;
  tags: Array<{ name: string; value: string }>; idempotencyKey: string;
};
export interface WorkflowEmailProvider { send(message: WorkflowEmailMessage): Promise<WorkflowProviderResult>; }
export const WORKFLOW_EMAIL_PROVIDER = Symbol('WORKFLOW_EMAIL_PROVIDER');

@Injectable()
export class ResendWorkflowEmailProvider implements WorkflowEmailProvider {
  async send(message: WorkflowEmailMessage): Promise<WorkflowProviderResult> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new WorkflowDeliveryError('Email service is not configured');
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey },
        body: JSON.stringify({
          from: message.from || process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev',
          to: [message.to], subject: message.subject, html: message.html,
          ...(message.text ? { text: message.text } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          tags: message.tags,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WorkflowDeliveryError('Workflow email request failed');
    }
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: { message?: string } };
    if (!response.ok) {
      throw new WorkflowDeliveryError(body.message || body.error?.message
        || `Email provider rejected the request (${response.status})`);
    }
    return { providerId: body.id ?? null };
  }
}

export type WorkflowSmsMessage = { to: string; from?: string; message: string };
export interface WorkflowSmsProvider { send(message: WorkflowSmsMessage): Promise<WorkflowProviderResult>; }
export const WORKFLOW_SMS_PROVIDER = Symbol('WORKFLOW_SMS_PROVIDER');

@Injectable()
export class TwilioWorkflowSmsProvider implements WorkflowSmsProvider {
  async send(message: WorkflowSmsMessage): Promise<WorkflowProviderResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = message.from?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim();
    if (!sid || !token || !from) throw new WorkflowDeliveryError('SMS service is not configured');
    let response: Response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: message.to, From: from, Body: message.message }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new WorkflowDeliveryError('Workflow SMS provider outcome is unknown', false, true);
    }
    const body = await response.json().catch(() => ({})) as { sid?: string; message?: string };
    if (!response.ok) throw new WorkflowDeliveryError(body.message || `SMS provider rejected the request (${response.status})`);
    if (!body.sid) throw new WorkflowDeliveryError('Workflow SMS provider outcome is unknown', false, true);
    return { providerId: body.sid };
  }
}

export type WorkflowWebhookMessage = {
  url: string; method: string; headers: unknown; body: unknown; idempotencyKey: string;
  timeoutMs: number; maxRequestBytes: number; maxResponseBytes: number;
};
export interface WorkflowWebhookProvider { send(message: WorkflowWebhookMessage): Promise<WorkflowProviderResult>; }
export const WORKFLOW_WEBHOOK_PROVIDER = Symbol('WORKFLOW_WEBHOOK_PROVIDER');

type Address = { address: string; family: number };

export const workflowWebhookStatusRetryable = (status: number): boolean =>
  [408, 425, 429].includes(status) || (status >= 500 && status <= 599);

const resolveAddresses = async (url: URL): Promise<Address[]> => {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  let records: Address[];
  if (isIP(hostname)) records = [{ address: hostname, family: isIP(hostname) }];
  else {
    try { records = await dnsLookup(hostname, { all: true, verbatim: true }); }
    catch { throw new WorkflowDeliveryError('Workflow webhook DNS resolution failed'); }
  }
  const unique = [...new Map(records.map((record) => [`${record.family}:${record.address}`, record])).values()];
  if (unique.length === 0) throw new WorkflowDeliveryError('Workflow webhook DNS resolution returned no addresses');
  if (unique.some((record) => !workflowWebhookAddressIsPublic(record.address))) {
    throw new WorkflowDeliveryError('Workflow webhook destination resolved to a prohibited address', false);
  }
  return unique;
};

const pinnedLookup = (expected: string, addresses: Address[]) => (
  hostname: string, options: any, callback: (...args: any[]) => void,
): void => {
  if (hostname.toLowerCase() !== expected.toLowerCase()) {
    callback(Object.assign(new Error('Workflow webhook attempted an unexpected DNS lookup'), { code: 'EACCES' }));
    return;
  }
  const candidates = options?.family ? addresses.filter((address) => address.family === Number(options.family)) : addresses;
  if (candidates.length === 0) {
    callback(Object.assign(new Error('Workflow webhook address family is unavailable'), { code: 'EAI_ADDRFAMILY' }));
    return;
  }
  if (options?.all) callback(null, candidates);
  else callback(null, candidates[0].address, candidates[0].family);
};

@Injectable()
export class ControlledWorkflowWebhookProvider implements WorkflowWebhookProvider {
  async send(message: WorkflowWebhookMessage): Promise<WorkflowProviderResult> {
    let url: URL;
    let headers: Record<string, string>;
    try {
      url = new URL(workflowWebhookUrl(message.url));
      headers = workflowWebhookHeaders(message.headers);
    } catch (error) {
      throw new WorkflowDeliveryError(error instanceof Error ? error.message : 'Invalid workflow webhook policy', false);
    }
    const method = String(message.method || 'POST').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      throw new WorkflowDeliveryError('Unsupported workflow webhook method', false);
    }
    const body = Buffer.from(JSON.stringify(asRecord(message.body)));
    if (body.length > message.maxRequestBytes) {
      throw new WorkflowDeliveryError('Workflow webhook request exceeded the byte limit', false);
    }
    const addresses = await resolveAddresses(url);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const transport = url.protocol === 'http:' ? http : https;
    const agent = new transport.Agent({ keepAlive: false, maxSockets: 1,
      lookup: pinnedLookup(hostname, addresses) as any });
    try {
      return await new Promise<WorkflowProviderResult>((resolve, reject) => {
        let settled = false;
        const fail = (error: Error): void => { if (!settled) { settled = true; reject(error); } };
        const request = transport.request({
          protocol: url.protocol, hostname, port: url.port || undefined,
          path: `${url.pathname}${url.search}`, method, agent, maxHeaderSize: 16 * 1024,
          headers: {
            ...headers, 'Accept-Encoding': 'identity',
            'Content-Type': 'application/json', 'Content-Length': String(body.length),
            'Idempotency-Key': message.idempotencyKey, 'User-Agent': 'Itemize-Workflow-Webhook/1.0',
            'X-Itemize-Delivery-Id': message.idempotencyKey,
          },
        }, (response) => {
          let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > message.maxResponseBytes) {
              response.destroy();
              fail(new WorkflowDeliveryError('Workflow webhook response exceeded the byte limit', false));
            }
          });
          response.on('error', () => fail(new WorkflowDeliveryError('Workflow webhook request failed')));
          response.on('end', () => {
            if (settled) return;
            const status = Number(response.statusCode);
            if (status < 200 || status > 299) {
              const redirect = status >= 300 && status <= 399;
              const retryable = workflowWebhookStatusRetryable(status);
              fail(new WorkflowDeliveryError(redirect
                ? 'Workflow webhook redirect responses are not allowed'
                : `Workflow webhook delivery failed with status ${status || 'unknown'}`, retryable));
              return;
            }
            settled = true;
            const requestId = response.headers['x-request-id'];
            resolve({ providerId: String(Array.isArray(requestId) ? requestId[0] : requestId || '').slice(0, 255) || null });
          });
        });
        request.setTimeout(message.timeoutMs, () => request.destroy(new Error('timeout')));
        request.on('error', () => fail(new WorkflowDeliveryError('Workflow webhook request failed')));
        request.end(body);
      });
    } finally {
      agent.destroy();
    }
  }
}
