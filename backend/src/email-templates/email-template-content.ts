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
  'badge-blue', 'badge-green', 'badge-amber', 'badge-orange', 'badge-red',
  'badge-slate', 'email-divider',
]);

const CLASS_STYLES: Record<string, string> = {
  'button-primary': 'display:inline-block;background:#2563eb;color:#ffffff!important;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px 0',
  'button-secondary': 'display:inline-block;background:#e2e8f0;color:#334155!important;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px 0',
  'callout-info': 'background:#eff6ff;border-left:4px solid #2563eb;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0',
  'callout-warning': 'background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0',
  'callout-success': 'background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0',
  'callout-slate': 'background:#f1f5f9;border-left:4px solid #64748b;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0',
  'badge-blue': 'display:inline-block;background:#dbeafe;color:#1e40af;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700',
  'badge-green': 'display:inline-block;background:#dcfce7;color:#166534;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700',
  'badge-amber': 'display:inline-block;background:#fef3c7;color:#92400e;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700',
  'badge-orange': 'display:inline-block;background:#ffedd5;color:#9a3412;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700',
  'badge-red': 'display:inline-block;background:#fee2e2;color:#991b1b;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700',
  'badge-slate': 'display:inline-block;background:#e2e8f0;color:#475569;padding:3px 9px;border-radius:6px;font-size:12px;font-weight:700',
  'email-divider': 'border:0;border-top:1px solid #e2e8f0;margin:24px 0',
};

const TAG_STYLES: Record<string, string> = {
  p: 'margin:0 0 16px',
  h1: 'margin:0 0 18px;font-size:24px;line-height:1.3;color:#0f172a',
  h2: 'margin:24px 0 14px;font-size:20px;line-height:1.35;color:#0f172a',
  h3: 'margin:20px 0 12px;font-size:17px;line-height:1.4;color:#0f172a',
  ul: 'margin:0 0 16px;padding-left:24px',
  ol: 'margin:0 0 16px;padding-left:24px',
  li: 'margin:0 0 6px',
  blockquote: 'margin:18px 0;padding:4px 0 4px 16px;border-left:4px solid #cbd5e1;color:#475569',
  a: 'color:#2563eb;text-decoration:underline',
  hr: 'border:0;border-top:1px solid #e2e8f0;margin:24px 0',
};

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

const mergeStyles = (...values: Array<string | null | undefined>): string =>
  values.map((value) => value?.trim().replace(/;+$/, '')).filter(Boolean).join(';');

/**
 * Converts the editor's constrained semantic vocabulary into email-safe inline
 * styles. This is deliberately shared by preview, test, campaign, and workflow
 * delivery so the editor cannot advertise formatting that disappears on send.
 */
export const compileEmailTemplateBody = (value: string): string => {
  const sanitized = sanitizeEmailTemplateHtml(value);
  const document = new JSDOM(`<body>${sanitized}</body>`).window.document;
  const body = document.body;

  body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const classStyles = [...element.classList]
      .map((name) => CLASS_STYLES[name])
      .filter((style): style is string => Boolean(style));
    const style = mergeStyles(
      TAG_STYLES[element.tagName.toLowerCase()],
      element.getAttribute('style'),
      ...classStyles,
    );
    if (style) element.setAttribute('style', style);
    else element.removeAttribute('style');
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
