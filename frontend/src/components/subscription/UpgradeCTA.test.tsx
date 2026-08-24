import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { UpgradeCTA } from './UpgradeCTA';

describe('UpgradeCTA', () => {
  it('renders one semantic link without nesting a button', () => {
    const { container } = render(
      <MemoryRouter>
        <UpgradeCTA requiredPlan="starter" currentPlan="free" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /upgrade to solo/i })).toHaveAttribute('href', '/settings');
    expect(container.querySelector('a button')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});
