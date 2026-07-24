import { describe, expect, it } from 'vitest';
import {
  buildLandingPageDocument,
  type LandingPageDocument,
} from './landingPageDocument';
import type { PageSection, PageTheme } from '@/services/pagesApi';

const theme: PageTheme = {
  primaryColor: '#2563eb',
  secondaryColor: '#0f172a',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  fontFamily: 'Inter, sans-serif',
  headingFont: 'Inter, sans-serif',
  borderRadius: 10,
  spacing: 'normal',
};

const page = (
  sections: PageSection[],
  overrides: Partial<LandingPageDocument> = {},
): LandingPageDocument => ({
  name: 'Launch page',
  slug: 'launch',
  theme,
  organization_name: 'Example Org',
  sections,
  ...overrides,
});

const section = (
  section_type: PageSection['section_type'],
  content: PageSection['content'],
  section_order = 0,
): PageSection => ({
  id: section_order + 1,
  section_type,
  content,
  settings: {},
  section_order,
});

describe('buildLandingPageDocument', () => {
  it('renders sections in saved order with page theme and metadata', () => {
    const html = buildLandingPageDocument(
      page(
        [
          section(
            'cta',
            { heading: 'Second', button_text: 'Go', button_url: '/next' },
            2,
          ),
          section('hero', { heading: 'First', subheading: 'Welcome' }, 1),
        ],
        {
          seo_title: 'Search title',
          seo_description: 'Search description',
        },
      ),
      'https://itemize.cloud',
    );

    expect(html).toContain('<title>Search title</title>');
    expect(html).toContain('content="Search description"');
    expect(html).toContain('--primary:#2563eb');
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html).toContain('href="/next"');
  });

  it('sanitizes rich HTML and rejects executable URL schemes', () => {
    const html = buildLandingPageDocument(
      page([
        section('text', {
          body: '<img src=x onerror="alert(1)"><script>alert(2)</script><p>Safe</p>',
        }),
        section(
          'button',
          { text: '<Open>', url: 'javascript:alert(3)' },
          1,
        ),
      ]),
      'https://itemize.cloud',
    );

    expect(html).toContain('<p>Safe</p>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(2)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;Open&gt;');
  });

  it('keeps custom script inside the document without a closing-tag escape', () => {
    const html = buildLandingPageDocument(
      page([], {
        custom_head:
          '<script>window.top.attack()</script><meta name="robots" content="noindex">',
        custom_js:
          'window.preview = true;</script><script>window.top.attack()',
      }),
      'https://itemize.cloud',
    );

    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('<script>window.top.attack()</script>');
    expect(html).toContain(
      'window.preview = true;<\\/script><script>window.top.attack()',
    );
  });

  it('covers every landing-page section vocabulary without throwing', () => {
    const types: PageSection['section_type'][] = [
      'hero',
      'text',
      'image',
      'video',
      'form',
      'cta',
      'testimonials',
      'pricing',
      'faq',
      'features',
      'gallery',
      'countdown',
      'html',
      'divider',
      'social',
      'header',
      'footer',
      'columns',
      'spacer',
      'button',
      'logo_cloud',
      'stats',
      'team',
      'contact',
      'map',
    ];
    const html = buildLandingPageDocument(
      page(
        types.map((type, index) =>
          section(type, { heading: `Section ${index}`, items: [] }, index),
        ),
      ),
      'https://itemize.cloud',
    );

    expect(html.match(/class="lp-section"/g)).toHaveLength(types.length);
  });
});
