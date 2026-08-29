import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('TooltipContent', () => {
  it('portals compact content outside layout-constrained triggers', () => {
    const { container } = render(
      <TooltipProvider>
        <div data-testid="constrained-layout">
          <Tooltip open>
            <TooltipTrigger>Back</TooltipTrigger>
            <TooltipContent>Back to previous page</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>,
    );

    expect(screen.getByRole('tooltip')).toHaveTextContent('Back to previous page');
    const content = document.querySelector<HTMLElement>(
      '[data-radix-popper-content-wrapper] > div',
    );
    expect(content).not.toBeNull();
    expect(content).toHaveClass('z-[100]', 'w-max', 'max-w-[calc(100vw-2rem)]');
    expect(container).not.toContainElement(content);
    expect(document.body).toContainElement(content);
  });
});
