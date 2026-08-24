import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { brandedTransactionalEmail } from '../common/branded-transactional-email';

export type JsonRecord = Record<string, unknown>;

export const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

export const replaceWorkflowVariables = (template: unknown, data: JsonRecord): string =>
  String(template ?? '').replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = data[key];
    return value === undefined ? match : String(value);
  });

export const workflowTemplateData = (contact: JsonRecord, context: unknown = {}): JsonRecord => ({
  first_name: contact.first_name || '',
  last_name: contact.last_name || '',
  full_name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'there',
  email: contact.email || '',
  phone: contact.phone || '',
  company: contact.company || '',
  job_title: contact.job_title || '',
  ...asRecord(contact.custom_fields),
  ...asRecord(context),
});

const workflowEmailClassStyles: Record<string, string> = {
  'button-primary': 'display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#4f46e5 100%);color:white!important;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:10px 0',
  'button-secondary': 'display:inline-block;background-color:#f1f5f9;color:#475569!important;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:10px 0',
  'callout-info': 'background-color:#eff6ff;border-left:4px solid #2563eb;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0',
  'callout-success': 'background-color:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0',
  'callout-warning': 'background-color:#fefce8;border-left:4px solid #eab308;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0',
  'callout-error': 'background-color:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0',
  'callout-slate': 'background-color:#f1f5f9;border-left:4px solid #64748b;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0',
  'badge-blue': 'display:inline-block;background-color:#dbeafe;color:#1e40af;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600',
  'badge-green': 'display:inline-block;background-color:#dcfce7;color:#166534;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600',
  'badge-yellow': 'display:inline-block;background-color:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600',
  'badge-red': 'display:inline-block;background-color:#fee2e2;color:#991b1b;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600',
  'badge-slate': 'display:inline-block;background-color:#e2e8f0;color:#475569;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600',
  'text-center': 'text-align:center', 'text-left': 'text-align:left', 'text-right': 'text-align:right',
  'text-muted': 'color:#64748b', 'text-small': 'font-size:13px', 'text-large': 'font-size:18px',
};

const inlineWorkflowEmailClasses = (body: string): string => {
  let result = body;
  for (const [className, style] of Object.entries(workflowEmailClassStyles)) {
    const expression = new RegExp(`class="([^"]*\\b${className}\\b[^"]*)"`, 'gi');
    result = result.replace(expression, (_match, classes: string) => `class="${classes}" style="${style}"`);
  }
  return result;
};

export const wrapWorkflowEmail = (body: string, subject: string): string => {
  if (/<!doctype|<html/i.test(body)) return body;
  const origin = String(process.env.PROD_URL || 'https://itemize.cloud').replace(/\/+$/, '');
  const content = inlineWorkflowEmailClasses(body);
  return brandedTransactionalEmail({
    assetOrigin: origin,
    previewText: subject,
    heading: subject,
    bodyHtml: content,
    footerText: 'Sent with Itemize.',
  });
};

export const normalizeWorkflowPhone = (value: unknown): string => {
  let phone = String(value ?? '').replace(/[^\d+]/g, '');
  if (!phone.startsWith('+')) {
    if (phone.startsWith('1') && phone.length === 11) phone = `+${phone}`;
    else if (phone.length === 10) phone = `+1${phone}`;
    else phone = `+${phone}`;
  }
  return phone;
};

export const validWorkflowPhone = (value: string): boolean => /^\+[1-9]\d{6,14}$/.test(value);

export const workflowWaitUntil = (configValue: unknown, now = Date.now()): Date | null => {
  const config = asRecord(configValue);
  const minutes = Number(config.delay_minutes ?? config.wait_minutes ?? 0);
  const hours = Number(config.delay_hours ?? config.wait_hours ?? 0);
  const days = Number(config.delay_days ?? config.wait_days ?? 0);
  if (![minutes, hours, days].every(Number.isFinite) || minutes < 0 || hours < 0 || days < 0) {
    throw new Error('Wait duration must contain non-negative finite numbers');
  }
  const totalMinutes = minutes + hours * 60 + days * 24 * 60;
  return totalMinutes > 0 ? new Date(now + totalMinutes * 60_000) : null;
};

export const workflowConditionResult = (contactValue: unknown, conditionValue: unknown): boolean => {
  const contact = asRecord(contactValue);
  const condition = asRecord(conditionValue);
  if (Object.keys(condition).length === 0) return true;
  const field = String(condition.field ?? '');
  const operator = String(condition.operator ?? '');
  const expected = condition.value;
  const custom = asRecord(contact.custom_fields);
  let actual = contact[field] ?? custom[field];
  if (field === 'tags') actual = Array.isArray(contact.tags) ? contact.tags : [];
  switch (operator) {
    case 'equals': return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'contains': return actual !== undefined && actual !== null
      && (Array.isArray(actual) ? actual.includes(expected) : String(actual).includes(String(expected)));
    case 'not_contains': return actual === undefined || actual === null
      || (Array.isArray(actual) ? !actual.includes(expected) : !String(actual).includes(String(expected)));
    case 'is_empty': return !actual || (Array.isArray(actual) && actual.length === 0);
    case 'is_not_empty': return Boolean(actual) && (!Array.isArray(actual) || actual.length > 0);
    case 'greater_than': return Number(actual) > Number(expected);
    case 'less_than': return Number(actual) < Number(expected);
    default: throw new Error(`Unsupported condition operator: ${operator}`);
  }
};

const blockedHeaders = new Set([
  'accept-encoding', 'baggage', 'connection', 'content-length', 'content-type', 'expect', 'forwarded',
  'host', 'idempotency-key', 'origin', 'proxy-authorization', 'proxy-connection', 'referer', 'sentry-trace',
  'te', 'traceparent', 'tracestate', 'trailer', 'transfer-encoding', 'upgrade', 'via', 'user-agent',
  'x-correlation-id', 'x-amzn-trace-id', 'x-cloud-trace-context', 'x-forwarded-for', 'x-forwarded-host',
  'x-forwarded-proto', 'x-real-ip', 'x-request-id',
]);

const privateLiteral = (hostname: string): boolean => {
  if (!isIP(hostname)) return false;
  try { return ipaddr.process(hostname).range() !== 'unicast'; }
  catch { return true; }
};

export const workflowWebhookAddressIsPublic = (address: string): boolean =>
  isIP(address) !== 0 && !privateLiteral(address.toLowerCase().replace(/^\[|\]$/g, ''));

export const workflowWebhookUrl = (value: unknown): string => {
  let url: URL;
  try { url = new URL(String(value ?? '')); } catch { throw new Error('Invalid webhook URL'); }
  const insecure = process.env.NODE_ENV !== 'production'
    && process.env.ALLOW_INSECURE_WORKFLOW_WEBHOOKS === 'true';
  if (url.protocol !== 'https:' && !(insecure && url.protocol === 'http:')) {
    throw new Error('Workflow webhook URL must use HTTPS');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.username || url.password || host === 'localhost' || host.endsWith('.localhost')
    || host.endsWith('.local') || host.endsWith('.internal') || privateLiteral(host)) {
    throw new Error('Workflow webhook URL is not allowed');
  }
  return url.toString();
};

export const workflowWebhookHeaders = (value: unknown): Record<string, string> => {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Workflow webhook headers must be an object');
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error('Workflow webhook headers exceed the limit');
  const normalized: Record<string, string> = {};
  let bytes = 0;
  for (const [name, headerValue] of entries) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(name)) throw new Error('Workflow webhook header name is invalid');
    const lower = name.toLowerCase();
    if (blockedHeaders.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-')
      || lower.startsWith('x-forwarded-') || lower.startsWith('x-itemize-')) continue;
    if (!['string', 'number', 'boolean'].includes(typeof headerValue)) {
      throw new Error('Workflow webhook header value is invalid');
    }
    const normalizedValue = String(headerValue).slice(0, 1000);
    bytes += Buffer.byteLength(name) + Buffer.byteLength(normalizedValue) + 4;
    if (bytes > 8 * 1024) throw new Error('Workflow webhook headers exceed the byte limit');
    normalized[name] = normalizedValue;
  }
  return normalized;
};
