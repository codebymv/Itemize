import { render, screen } from '@testing-library/react';

import { LandingPagePreviewFrame } from './LandingPagePreviewFrame';

describe('LandingPagePreviewFrame', () => {
  it('renders the page through the shared landing-page document pipeline', () => {
    render(
      <LandingPagePreviewFrame
        title="Welcome page preview"
        page={{
          name: 'Welcome page',
          slug: 'welcome',
          organization_name: 'Itemize',
          theme: {
            primaryColor: '#2563eb',
            secondaryColor: '#0f172a',
            backgroundColor: '#ffffff',
            textColor: '#0f172a',
            fontFamily: 'Inter',
            headingFont: 'Inter',
            borderRadius: 8,
            spacing: 'normal',
          },
          sections: [{
            section_type: 'hero',
            section_order: 0,
            content: { heading: 'Welcome aboard' },
            settings: {},
          }],
        }}
      />,
    );

    expect(screen.getByTitle('Welcome page preview')).toHaveAttribute('srcdoc', expect.stringContaining('Welcome aboard'));
  });

  it('shows a useful empty state instead of a blank frame when the page has no sections', () => {
    render(
      <LandingPagePreviewFrame
        title="Empty page preview"
        page={{
          name: 'New page',
          slug: 'new-page',
          organization_name: 'Itemize',
          theme: {
            primaryColor: '#2563eb',
            secondaryColor: '#0f172a',
            backgroundColor: '#ffffff',
            textColor: '#0f172a',
            fontFamily: 'Inter',
            headingFont: 'Inter',
            borderRadius: 8,
            spacing: 'normal',
          },
          sections: [],
        }}
      />,
    );

    expect(screen.getByText('No page content yet')).toBeInTheDocument();
    expect(screen.queryByTitle('Empty page preview')).not.toBeInTheDocument();
  });
});
