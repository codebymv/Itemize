import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ShellBackButton } from './ShellBackButton';

describe('ShellBackButton', () => {
  it('provides one 44px blue Back control with an accessible destination label', () => {
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <ShellBackButton label="Back to contacts" onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'Back to contacts' });
    const icon = button.querySelector('svg');
    expect(button).toHaveClass(
      'h-11',
      'w-11',
      'text-blue-600',
      'dark:text-blue-400',
      'hover:bg-accent',
      'hover:text-accent-foreground',
    );
    expect(button).not.toHaveClass('hover:bg-blue-50', 'dark:hover:bg-blue-950/40');
    expect(button).not.toHaveTextContent('Back to contacts');
    expect(icon).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
