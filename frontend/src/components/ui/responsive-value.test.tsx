import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ResponsiveMoneyValue,
  ResponsiveNumberValue,
} from './responsive-value';
import { pickFittingValue } from '@/lib/responsiveValue';

describe('responsive values', () => {
  it('selects the most detailed representation that fits', () => {
    expect(pickFittingValue(140, [120, 70, 50])).toBe(0);
    expect(pickFittingValue(90, [120, 70, 50])).toBe(1);
    expect(pickFittingValue(40, [120, 70, 50])).toBe(2);
  });

  it('defaults to the full value when layout measurements are unavailable', () => {
    const { container } = render(<ResponsiveNumberValue value={11_543} locale="en-US" />);
    const value = container.querySelector('[data-responsive-value]');

    expect(value).toHaveAttribute('data-responsive-value-mode', 'full');
    expect(value).toHaveAttribute('aria-label', '11,543');
    expect(value).toHaveAttribute('title', '11,543');
  });

  it('keeps an exact accessible money value while exposing compact candidates visually', () => {
    const { container } = render(
      <ResponsiveMoneyValue amount={11_543} currency="USD" locale="en-US" />,
    );
    const value = screen.getByLabelText('$11,543.00');

    expect(value).toHaveAttribute('title', '$11,543.00');
    expect(container.querySelector('[data-responsive-value-measure="1"]')).toHaveTextContent('$11.5K');
    expect(container.querySelector('[data-responsive-value-measure="2"]')).toHaveTextContent('$12K');
  });
});
