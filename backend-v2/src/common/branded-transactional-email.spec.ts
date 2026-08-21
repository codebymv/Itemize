import { brandedTransactionalEmail } from './branded-transactional-email';

describe('brandedTransactionalEmail', () => {
  it('renders Itemize image assets, a light email surface, and escaped CTA metadata', () => {
    const html = brandedTransactionalEmail({
      assetOrigin: 'https://itemize.cloud/',
      previewText: 'Estimate ready',
      eyebrow: 'Estimate · EST-00001',
      heading: 'A new estimate from Studio',
      bodyHtml: '<p>Safe, pre-escaped content</p>',
      cta: { label: 'Review <estimate>', url: 'https://itemize.cloud/estimate/a&b' },
    });

    expect(html).toContain('https://itemize.cloud/icon.png');
    expect(html).toContain('https://itemize.cloud/textblack.png');
    expect(html).toContain('name="color-scheme" content="light only"');
    expect(html).toContain('Review &lt;estimate&gt;');
    expect(html).toContain('/estimate/a&amp;b');
    expect(html).not.toContain('bg-blue-600');
  });
});
