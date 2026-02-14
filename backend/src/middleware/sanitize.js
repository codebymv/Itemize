const DOMPurify = require('dompurify');

function sanitizeObject(obj) {
  for (const key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    } else if (typeof obj[key] === 'string') {
      obj[key] = sanitizeString(obj[key]);
    }
  }
}

function sanitizeString(str) {
  if (!str) return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');
}

module.exports = (req, res, next) => {
  if (req.body && Object.keys(req.body).length > 0) {
    sanitizeObject(req.body);
  }
  if (req.query && Object.keys(req.query).length > 0) {
    sanitizeObject(req.query);
  }
  if (req.params && Object.keys(req.params).length > 0) {
    sanitizeObject(req.params);
  }
  next();
};

module.exports.sanitizeString = sanitizeString;
module.exports.sanitizeHtml = (html) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['B', 'I', 'EM', 'STRONG', 'A', 'UL', 'OL', 'LI', 'P', 'BR', 'DIV', 'SPAN'],
  ALLOWED_ATTR: ['href', 'target', 'class', 'style'],
});