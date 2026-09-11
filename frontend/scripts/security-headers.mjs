import { createHash } from 'node:crypto';

export function securityHeaders(html, production = process.env.NODE_ENV === 'production') {
  // Hash only scripts shipped in the built shell. No unsafe-inline scripts or
  // event handlers; changing the boot script automatically changes its hash.
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, body]) => !/\bsrc\s*=/i.test(attributes) && body.trim())
    .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} https://accounts.google.com/gsi/client https://js.stripe.com`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.itemize.cloud wss://api.itemize.cloud https://accounts.google.com https://api.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
    // Editors can preview user-provided HTTPS embeds and generated PDF blobs.
    "frame-src 'self' https: blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    ...(production ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
