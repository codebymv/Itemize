const DISALLOWED_TAGS = /<\/?(?:script|style|iframe|object|embed|link|meta|base|form|input|textarea|button)(?:\s[^>]*)?>/gi;
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /javascript:/gi;

export function sanitizeNoteHtml(value: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(DISALLOWED_TAGS, '')
    .replace(EVENT_HANDLER_ATTR, '')
    .replace(JAVASCRIPT_URL, '');
}
