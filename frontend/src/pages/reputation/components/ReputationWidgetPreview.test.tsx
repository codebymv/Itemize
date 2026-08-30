import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ReputationWidgetPreview } from './ReputationWidgetPreview';

const config = {
  widget_type: 'grid' as const,
  theme: 'auto' as const,
  primary_color: '#2563EB',
  background_color: '#FFFFFF',
  text_color: '#0F172A',
  border_radius: 12,
  show_rating_stars: true,
  show_reviewer_photo: true,
  show_review_date: true,
  show_platform_icon: true,
  max_reviews: 6,
};

describe('ReputationWidgetPreview', () => {
  it('renders a useful sample when the organization has no reviews', () => {
    render(<ReputationWidgetPreview config={config} />);

    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Maya Patel')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/out of 5 stars/)).not.toHaveLength(0);
  });

  it('switches device framing without changing widget content', async () => {
    const user = userEvent.setup();
    render(<ReputationWidgetPreview config={config} />);

    await act(async () => user.click(screen.getByRole('button', { name: 'Mobile widget preview' })));
    expect(screen.getByRole('button', { name: 'Mobile widget preview' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Maya Patel')).toBeInTheDocument();
  });
});
