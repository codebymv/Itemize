import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityDetailHeader } from './EntityDetailHeader';

describe('EntityDetailHeader', () => {
  it('exposes one semantic entity heading with status and metadata', () => {
    render(
      <EntityDetailHeader
        icon={<span>icon</span>}
        title="Client agreement"
        mobileStatus={<span>Draft</span>}
        descriptor="Reusable agreement"
        metadata={<span>2 roles</span>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Client agreement' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Reusable agreement')).toBeInTheDocument();
    expect(screen.getByText('2 roles')).toBeInTheDocument();
  });
});
