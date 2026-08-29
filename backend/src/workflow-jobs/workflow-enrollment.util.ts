import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { renderEmailTemplateDocument } from '../email-templates/email-template-renderer';

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

export const wrapWorkflowEmail = (body: string, subject: string): string => {
  if (/<!doctype|<html/i.test(body)) return body;
  return renderEmailTemplateDocument({ subject, bodyHtml: body }).html;
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
