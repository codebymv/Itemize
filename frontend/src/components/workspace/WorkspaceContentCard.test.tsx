import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceContentCard } from './WorkspaceContentCard';

describe('WorkspaceContentCard', () => {
  it('keeps every workspace content type on the same borderless surface', () => {
    render(<WorkspaceContentCard data-testid="content-card">Content</WorkspaceContentCard>);

    expect(screen.getByTestId('content-card')).toHaveClass('w-full', 'border-0', 'shadow-sm');
  });

  it('preserves type-specific layout classes', () => {
    render(
      <WorkspaceContentCard data-testid="content-card" className="h-full flex-col">
        Content
      </WorkspaceContentCard>,
    );

    expect(screen.getByTestId('content-card')).toHaveClass('border-0', 'h-full', 'flex-col');
  });
});
