const axios = require('axios');
const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const ipaddr = require('ipaddr.js');

const DEFAULT_WEBHOOK_MAX_REQUEST_BYTES = 256 * 1024;
const DEFAULT_WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_WEBHOOK_HEADER_BYTES = 8 * 1024;
const MAX_WEBHOOK_RESPONSE_HEADER_BYTES = 16 * 1024;
const RETRYABLE_WEBHOOK_STATUSES = new Set([408, 425, 429]);
const WORKFLOW_WEBHOOK_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_WEBHOOK_HEADERS = new Set([
  'accept-encoding',
  'baggage',
  'connection',
  'content-length',
  'content-type',
  'expect',
  'forwarded',
  'host',
  'idempotency-key',
  'origin',
  'proxy-authorization',
  'proxy-connection',
  'referer',
  'sentry-trace',
  'te',
  'traceparent',
  'tracestate',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
  'user-agent',
  'x-correlation-id',
  'x-amzn-trace-id',
  'x-cloud-trace-context',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-request-id',
]);

class WorkflowWebhookDeliveryError extends Error {
  constructor(message, { cause, retryable = false } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowWebhookDeliveryError';
    this.retryable = retryable;
  }
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizedHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
}

function isPublicWebhookAddress(address) {
  try {
    return ipaddr.process(normalizedHostname(address)).range() === 'unicast';
  } catch {
    return false;
  }
}

function isPrivateWebhookHost(hostname) {
  const host = normalizedHostname(hostname);
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
  ) {
    return true;
  }
  return net.isIP(host) !== 0 && !isPublicWebhookAddress(host);
}

function parseWorkflowWebhookUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  const allowInsecure = process.env.NODE_ENV !== 'production'
    && process.env.ALLOW_INSECURE_WORKFLOW_WEBHOOKS === 'true';
  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) {
    throw new Error('Workflow webhook URL must use HTTPS');
  }
  if (url.username || url.password || isPrivateWebhookHost(url.hostname)) {
    throw new Error('Workflow webhook URL is not allowed');
  }
  return url;
}

function normalizeWorkflowWebhookHeaders(headers) {
  if (headers === null || headers === undefined) return {};
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    throw new Error('Workflow webhook headers must be an object');
  }

  const normalized = {};
  const entries = Object.entries(headers);
  let totalBytes = 0;
  if (entries.length > 20) throw new Error('Workflow webhook headers exceed the limit');
  for (const [name, value] of entries) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(name)) {
      throw new Error('Workflow webhook header name is invalid');
    }
    const lowerName = name.toLowerCase();
    if (
      BLOCKED_WEBHOOK_HEADERS.has(lowerName)
      || lowerName.startsWith('proxy-')
      || lowerName.startsWith('sec-')
      || lowerName.startsWith('x-forwarded-')
      || lowerName.startsWith('x-itemize-')
    ) {
      continue;
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error('Workflow webhook header value is invalid');
    }
    const normalizedValue = String(value).slice(0, 1000);
    totalBytes += Buffer.byteLength(name) + Buffer.byteLength(normalizedValue) + 4;
    if (totalBytes > MAX_WEBHOOK_HEADER_BYTES) {
      throw new Error('Workflow webhook headers exceed the byte limit');
    }
    normalized[name] = normalizedValue;
  }
  return normalized;
}

function normalizeAddressRecord(record) {
  const address = normalizedHostname(typeof record === 'string' ? record : record?.address);
  const family = Number(typeof record === 'string' ? net.isIP(address) : record?.family)
    || net.isIP(address);
  return { address, family };
}

async function resolveWorkflowWebhookAddresses(targetUrl, lookup = dns.lookup) {
  const hostname = normalizedHostname(targetUrl.hostname);
  let records;
  if (net.isIP(hostname)) {
    records = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      records = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new WorkflowWebhookDeliveryError(
        'Workflow webhook DNS resolution failed',
        { cause: error, retryable: true }
      );
    }
  }

  const unique = new Map();
  for (const record of Array.isArray(records) ? records : [records]) {
    const normalized = normalizeAddressRecord(record);
    if (!normalized.address || !normalized.family) continue;
    unique.set(`${normalized.family}:${normalized.address}`, normalized);
  }
  const addresses = [...unique.values()];
  if (addresses.length === 0) {
    throw new WorkflowWebhookDeliveryError(
      'Workflow webhook DNS resolution returned no addresses',
      { retryable: true }
    );
  }
  if (addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
    throw new WorkflowWebhookDeliveryError(
      'Workflow webhook destination resolved to a prohibited address'
    );
  }
  return addresses;
}

function createPinnedLookup(expectedHostname, addresses) {
  const expected = normalizedHostname(expectedHostname);
  return (hostname, options, callback) => {
    let lookupOptions = options;
    let done = callback;
    if (typeof options === 'function') {
      done = options;
      lookupOptions = {};
    } else if (typeof options === 'number') {
      lookupOptions = { family: options };
    }
    lookupOptions ||= {};

    if (normalizedHostname(hostname) !== expected) {
      const error = new Error('Workflow webhook attempted an unexpected DNS lookup');
      error.code = 'EACCES';
      done(error);
      return;
    }

    const family = Number(lookupOptions.family) || 0;
    const candidates = family
      ? addresses.filter(address => address.family === family)
      : addresses;
    if (candidates.length === 0) {
      const error = new Error('Workflow webhook address family is unavailable');
      error.code = 'EAI_ADDRFAMILY';
      done(error);
      return;
    }
    if (lookupOptions.all) {
      done(null, candidates.map(address => ({ ...address })));
      return;
    }
    done(null, candidates[0].address, candidates[0].family);
  };
}

function webhookStatusIsRetryable(status) {
  return RETRYABLE_WEBHOOK_STATUSES.has(status) || (status >= 500 && status <= 599);
}

function responseHeader(response, name) {
  if (typeof response?.headers?.get === 'function') return response.headers.get(name);
  return response?.headers?.[name] || response?.headers?.[name.toLowerCase()] || null;
}

async function deliverWorkflowWebhook({
  body,
  headers,
  idempotencyKey,
  method,
  url,
}, dependencies = {}) {
  const targetUrl = parseWorkflowWebhookUrl(url);
  const normalizedMethod = String(method || 'POST').toUpperCase();
  if (!WORKFLOW_WEBHOOK_METHODS.has(normalizedMethod)) {
    throw new WorkflowWebhookDeliveryError('Unsupported workflow webhook method');
  }
  const timeoutMs = boundedInteger(
    dependencies.timeoutMs,
    DEFAULT_WEBHOOK_TIMEOUT_MS,
    100,
    60_000
  );
  const maxRequestBytes = boundedInteger(
    dependencies.maxRequestBytes,
    DEFAULT_WEBHOOK_MAX_REQUEST_BYTES,
    1024,
    1024 * 1024
  );
  const maxResponseBytes = boundedInteger(
    dependencies.maxResponseBytes,
    DEFAULT_WEBHOOK_MAX_RESPONSE_BYTES,
    1024,
    1024 * 1024
  );
  const requestBody = Buffer.from(JSON.stringify(body || {}));
  if (requestBody.length > maxRequestBytes) {
    throw new WorkflowWebhookDeliveryError('Workflow webhook request exceeded the byte limit');
  }

  const addresses = await resolveWorkflowWebhookAddresses(targetUrl, dependencies.lookup);
  const Agent = targetUrl.protocol === 'http:' ? http.Agent : https.Agent;
  const agent = new Agent({
    keepAlive: false,
    lookup: createPinnedLookup(targetUrl.hostname, addresses),
    maxSockets: 1,
  });
  const httpClient = dependencies.httpClient || axios;

  try {
    const response = await httpClient.request({
      data: requestBody,
      decompress: false,
      headers: {
        ...normalizeWorkflowWebhookHeaders(headers),
        'Accept-Encoding': 'identity',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'User-Agent': 'Itemize-Workflow-Webhook/1.0',
        'X-Itemize-Delivery-Id': idempotencyKey,
      },
      httpsAgent: agent,
      httpAgent: agent,
      maxBodyLength: maxRequestBytes,
      maxContentLength: maxResponseBytes,
      maxHeaderSize: MAX_WEBHOOK_RESPONSE_HEADER_BYTES,
      maxRedirects: 0,
      method: normalizedMethod,
      proxy: false,
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      url: targetUrl.toString(),
      validateStatus: () => true,
    });
    const status = Number(response?.status);
    if (status < 200 || status > 299) {
      const retryable = webhookStatusIsRetryable(status);
      const description = status >= 300 && status <= 399
        ? 'redirect responses are not allowed'
        : `delivery failed with status ${status || 'unknown'}`;
      throw new WorkflowWebhookDeliveryError(
        `Workflow webhook ${description}`,
        { retryable }
      );
    }
    return {
      success: true,
      id: String(responseHeader(response, 'x-request-id') || '').slice(0, 255) || null,
    };
  } catch (error) {
    if (error instanceof WorkflowWebhookDeliveryError) throw error;
    if (
      error?.code === 'ERR_BAD_RESPONSE'
      && /maxContentLength|content length/i.test(error.message || '')
    ) {
      throw new WorkflowWebhookDeliveryError(
        'Workflow webhook response exceeded the byte limit',
        { cause: error }
      );
    }
    throw new WorkflowWebhookDeliveryError(
      'Workflow webhook request failed',
      { cause: error, retryable: true }
    );
  } finally {
    agent.destroy();
  }
}

module.exports = {
  DEFAULT_WEBHOOK_MAX_REQUEST_BYTES,
  DEFAULT_WEBHOOK_MAX_RESPONSE_BYTES,
  DEFAULT_WEBHOOK_TIMEOUT_MS,
  WorkflowWebhookDeliveryError,
  createPinnedLookup,
  deliverWorkflowWebhook,
  isPrivateWebhookHost,
  isPublicWebhookAddress,
  normalizeWorkflowWebhookHeaders,
  parseWorkflowWebhookUrl,
  resolveWorkflowWebhookAddresses,
  webhookStatusIsRetryable,
};
