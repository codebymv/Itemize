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
    // Mention pills are <span data-type="mention" data-entity data-id data-label>.
    // Data attributes are otherwise closed so nothing else rides along.
    ALLOWED_ATTR: ['class', 'style', 'data-type', 'data-entity', 'data-id', 'data-label'],
    ALLOW_DATA_ATTR: false,
  });
}
