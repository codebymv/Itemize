import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { securityHeaders } from './security-headers.mjs';

test('CSP authorizes the exact shipped boot script without permitting inline handlers', () => {
  const boot = ' window.boot = true; ';
  const headers = securityHeaders(`<script>${boot}</script><script src="/assets/app.js"></script>`, true);
  const hash = createHash('sha256').update(boot).digest('base64');
  assert.ok(headers['Content-Security-Policy'].includes(`'sha256-${hash}'`));
  assert.ok(headers['Content-Security-Policy'].includes("script-src-attr 'none'"));
  assert.ok(!headers['Content-Security-Policy'].split(';')[1].includes('unsafe-inline'));
  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.notEqual(securityHeaders('<script>different()</script>', true)['Content-Security-Policy'], headers['Content-Security-Policy']);
});

test('local HTTP does not receive a persistent HTTPS requirement', () => {
  assert.equal(securityHeaders('', false)['Strict-Transport-Security'], undefined);
});
