import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppScreenshot from './AppScreenshot';

describe('AppScreenshot', () => {
  it('uses a PNG directly instead of inferring a nonexistent WebP source', () => {
    const { container } = render(
      <AppScreenshot label="Workspaces" src="/screenshots/workspaces.png" />,
    );

    expect(screen.getByRole('img', { name: 'Workspaces' })).toHaveAttribute(
      'src',
      '/screenshots/workspaces.png',
    );
    expect(container.querySelector('source')).not.toBeInTheDocument();
  });

  it('retains the explicit PNG fallback for a WebP source', () => {
    const { container } = render(
      <AppScreenshot label="Dashboard" src="/screenshots/dashboard.webp" />,
    );

    expect(container.querySelector('source')).toHaveAttribute(
      'srcset',
      '/screenshots/dashboard.webp',
    );
    expect(screen.getByRole('img', { name: 'Dashboard' })).toHaveAttribute(
      'src',
      '/screenshots/dashboard.png',
    );
  });
});
