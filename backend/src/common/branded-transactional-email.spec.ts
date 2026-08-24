import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from './branded-transactional-email';

describe('brandedTransactionalEmail', () => {
  it('renders Itemize image assets, a light email surface, and escaped CTA metadata', () => {
    const html = brandedTransactionalEmail({
      assetOrigin: 'https://itemize.cloud/',
      previewText: 'Estimate ready',
      heading: 'A new estimate from Studio',
      bodyHtml: '<p>Safe, pre-escaped content</p>',
      cta: { label: 'Review <estimate>', url: 'https://itemize.cloud/estimate/a&b' },
    });

    expect(html).toContain('https://itemize.cloud/cover.png');
    expect(html).not.toContain('icon.png');
    expect(html).not.toContain('textblack.png');
    expect(html).toContain('name="color-scheme" content="light only"');
    expect(html).toContain('Review &lt;estimate&gt;');
    expect(html).toContain('/estimate/a&amp;b');
    expect(html).not.toContain('EST-00001');
    expect(html).not.toContain('border-radius:999px');
    expect(html).not.toContain('bg-blue-600');
  });

  it('renders one unbadged response heading with the Itemize CTA', () => {
    const accepted = brandedTransactionalEmail({
      assetOrigin: 'https://itemize.cloud',
      previewText: 'Accepted',
      heading: 'Estimate accepted',
      bodyHtml: '<p>Accepted</p>',
      cta: { label: 'View estimate', url: 'https://itemize.cloud/estimates/2' },
    });
    expect(accepted.match(/Estimate accepted/g)).toHaveLength(2);
    expect(accepted).not.toContain('EST-00002');
    expect(accepted).not.toContain('border-radius:999px');
    expect(accepted).toContain('background:#2563eb;color:#ffffff!important');
    expect(accepted).toContain("font-family:'Raleway','Segoe UI',Roboto,Arial,sans-serif");
  });

  it('keeps actual email assets public even when the application runs locally', () => {
    expect(transactionalEmailAssetOrigin({
      FRONTEND_URL: 'http://localhost:5173',
    })).toBe('https://itemize.cloud');
    expect(transactionalEmailAssetOrigin({
      EMAIL_ASSET_ORIGIN: 'https://assets.itemize.cloud/email/path',
    })).toBe('https://assets.itemize.cloud');
    expect(transactionalEmailAssetOrigin({
      EMAIL_ASSET_ORIGIN: 'http://localhost:5173',
    })).toBe('https://itemize.cloud');
  });
});
