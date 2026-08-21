const {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} = require('../../services/branded-transactional-email');

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
});
