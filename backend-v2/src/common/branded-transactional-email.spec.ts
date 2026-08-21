import { brandedTransactionalEmail } from './branded-transactional-email';

describe('brandedTransactionalEmail', () => {
  it('renders Itemize image assets, a light email surface, and escaped CTA metadata', () => {
    const html = brandedTransactionalEmail({
      assetOrigin: 'https://itemize.cloud/',
      previewText: 'Estimate ready',
      eyebrow: 'Estimate',
      reference: 'EST-00001',
      heading: 'A new estimate from Studio',
      bodyHtml: '<p>Safe, pre-escaped content</p>',
      cta: { label: 'Review <estimate>', url: 'https://itemize.cloud/estimate/a&b' },
    });

    expect(html).toContain('https://itemize.cloud/icon.png');
    expect(html).toContain('https://itemize.cloud/textblack.png');
    expect(html).toContain('name="color-scheme" content="light only"');
    expect(html).toContain('Review &lt;estimate&gt;');
    expect(html).toContain('/estimate/a&amp;b');
    expect(html).toContain('background:#2563eb;color:#ffffff;border-radius:999px');
    expect(html.indexOf('Estimate')).toBeLessThan(html.indexOf('EST-00001'));
    expect(html.indexOf('EST-00001')).toBeLessThan(html.indexOf('<h1'));
    expect(html).not.toContain('bg-blue-600');
  });
});
