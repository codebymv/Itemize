import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServiceMark } from './ServiceMark';

describe('ServiceMark', () => {
  it('renders a shared provider mark as decorative artwork', () => {
    const { container } = render(<ServiceMark service="gleam" />);

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('span')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('provides light and dark Resend variants', () => {
    const { container } = render(<ServiceMark service="resend" />);
    const images = container.querySelectorAll('img');

    expect(images).toHaveLength(2);
    expect(images[0]).toHaveClass('dark:hidden');
    expect(images[1]).toHaveClass('hidden', 'dark:block');
  });
});
