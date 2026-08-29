import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const purifier = createDOMPurify(
  new JSDOM('').window as unknown as Parameters<typeof createDOMPurify>[0],
);

const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'div', 'hr',
];

const ALLOWED_ATTRIBUTES = ['href', 'target', 'rel', 'class', 'style'];
const ALLOWED_CLASSES = new Set([
  'button-primary', 'button-secondary',
  'callout-info', 'callout-warning', 'callout-success', 'callout-slate',
  'badge-blue', 'badge-green', 'badge-orange', 'badge-red', 'email-divider',
]);

const allowedHref = (value: string): boolean => {
  if (value.startsWith('#')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
};

const safeTextAlign = (value: string): string | null => {
  const match = value.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right)\s*;?/i);
  return match ? `text-align: ${match[1].toLowerCase()}` : null;
};

export const sanitizeEmailTemplateHtml = (value: string): string => {
  const sanitized = purifier.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['id'],
  });
  const document = new JSDOM(`<body>${sanitized}</body>`).window.document;
  const body = document.body;

  body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const classes = [...element.classList].filter((name) => ALLOWED_CLASSES.has(name));
    if (classes.length > 0) element.className = classes.join(' ');
    else element.removeAttribute('class');

    const alignment = safeTextAlign(element.getAttribute('style') || '');
    if (alignment) element.setAttribute('style', alignment);
    else element.removeAttribute('style');
  });

  body.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href || !allowedHref(href.trim())) anchor.removeAttribute('href');
    else anchor.setAttribute('href', href.trim());
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.setAttribute('target', '_blank');
  });

  return body.innerHTML.trim();
};

export const escapeEmailVariableValue = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] as string);

export const renderEmailHtmlVariables = (
  template: string,
  data: Record<string, unknown>,
): string => sanitizeEmailTemplateHtml(template).replace(
  /\{\{\s*(\w+)\s*}}/g,
  (match, key: string) => Object.prototype.hasOwnProperty.call(data, key)
    ? escapeEmailVariableValue(data[key])
    : match,
);

export const renderEmailTextVariables = (
  template: string,
  data: Record<string, unknown>,
): string => template.replace(
  /\{\{\s*(\w+)\s*}}/g,
  (match, key: string) => Object.prototype.hasOwnProperty.call(data, key)
    ? String(data[key] ?? '')
    : match,
);
