import DOMPurify from 'dompurify';

const NOTE_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'span', 'div',
];

export function sanitizeNoteHtml(value: string): string {
  if (typeof value !== 'string' || !value) {
    return value || '';
  }
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: NOTE_TAGS,
    ALLOWED_ATTR: ['class', 'style'],
  });
}
