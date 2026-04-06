const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const purify = DOMPurify(window);

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const ALLOWED_ATTR = ['href', 'target', 'class', 'id', 'style'];

function sanitizeObject(obj, depth = 0) {
  if (depth > 10) {
    return;
  }
  for (const key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object') {
      sanitizeObject(obj[key], depth + 1);
    } else if (typeof obj[key] === 'string') {
      obj[key] = sanitizeString(obj[key]);
    }
  }
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  
  const sanitized = purify.sanitize(str, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  
  return sanitized
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
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
module.exports.sanitizeHtml = (html) => purify.sanitize(html, {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
});