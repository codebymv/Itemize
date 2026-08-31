import { Bell } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppHeaderIconButton } from './app-header-icon-button';

describe('AppHeaderIconButton', () => {
  it('keeps app chrome actions on one shared hit area and input-aware interaction primitive', () => {
    render(
      <AppHeaderIconButton aria-label="Notifications">
        <Bell />
      </AppHeaderIconButton>,
    );

    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toHaveClass('h-11', 'w-11', 'shrink-0');
    expect(button).toHaveClass('interaction-button--neutral');
    expect(button).not.toHaveClass('hover:bg-accent', 'hover:text-accent-foreground');
  });
});
