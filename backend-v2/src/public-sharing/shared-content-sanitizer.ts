import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const purify = createDOMPurify(
  new JSDOM('').window as unknown as Parameters<typeof createDOMPurify>[0],
);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const sanitizeSharedContent = (content: unknown): unknown => {
  if (typeof content === 'string') {
    return purify.sanitize(content);
  }
  if (Array.isArray(content)) {
    return content.map(sanitizeSharedContent);
  }
  if (typeof content === 'object' && content !== null) {
    const sanitized: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(content)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      sanitized[key] = sanitizeSharedContent(value);
    }
    return sanitized;
  }
  return content;
};

export const sanitizeSharedText = (content: string | null): string | null =>
  content === null ? null : purify.sanitize(content);
