const {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} = require('../../services/branded-transactional-email');
const {
  processTemplate,
  wrapInBrandedTemplate,
} = require('../../services/email-template.service');

describe('legacy-service branded transactional renderer', () => {
  it('matches the Itemize transactional hierarchy and escapes metadata', () => {
    const html = brandedTransactionalEmail({
      assetOrigin: 'https://itemize.cloud',
      previewText: 'Ready',
      heading: 'Trial <ready>',
      bodyHtml: '<p>Trusted body</p>',
      cta: { label: 'Open <billing>', url: 'https://itemize.cloud/a&b' },
    });
    expect(html).toContain('https://itemize.cloud/cover.png');
    expect(html).toContain('height:4px;background:#2563eb');
    expect(html).toContain('Trial &lt;ready&gt;');
    expect(html).toContain('Open &lt;billing&gt;');
    expect(html).toContain('/a&amp;b');
  });

  it('keeps production assets on HTTPS', () => {
    expect(transactionalEmailAssetOrigin({ EMAIL_ASSET_ORIGIN: 'http://localhost:5173' }))
      .toBe('https://itemize.cloud');
  });

  it('routes retained transactional senders through the canonical shell', () => {
    const html = wrapInBrandedTemplate('<p>Invoice ready</p>', {
      subject: 'Your invoice',
      showUnsubscribe: false,
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('height:4px;background:#2563eb');
    expect(html).toContain('https://itemize.cloud/cover.png');
    expect(html).toContain('background:#f1f5f9');
    expect(html).toContain('<h1');
    expect(html).toContain('Your invoice');
    expect(html).toContain('Invoice ready');
    expect(html).not.toContain('{{unsubscribeUrl}}');
  });

  it('keeps the required unsubscribe action in editor-authored marketing mail', () => {
    const rendered = processTemplate(
      { subject: 'Hello {{userName}}', body_html: '<p>News</p>' },
      { name: 'Ada', email: 'ada@example.com' },
    );

    expect(rendered.subject).toBe('Hello Ada');
    expect(rendered.html).toContain('height:4px;background:#2563eb');
    expect(rendered.html).toContain('https://itemize.cloud/cover.png');
    expect(rendered.html).toContain('Unsubscribe');
    expect(rendered.html).toContain('https://itemize.cloud/unsubscribe');
  });
});
