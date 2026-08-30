import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Layout } from 'lucide-react';
import { PreviewPlaceholder } from './PreviewPlaceholder';

describe('PreviewPlaceholder', () => {
  it('separates incomplete previews from collection empty states', () => {
    render(
      <PreviewPlaceholder
        icon={Layout}
        title="No page content yet"
        description="Add a section to build this page."
      />
    );

    expect(screen.getByRole('heading', { name: 'No page content yet' }).parentElement)
      .toHaveAttribute('data-preview-placeholder');
    expect(screen.getByText('Add a section to build this page.')).toHaveClass('max-w-md');
  });
});
