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

  it('hands entity status to the shell command lane at md by default', () => {
    render(
      <EntityDetailHeader icon={<span>icon</span>} title="Invoice 1001" mobileStatus={<span>Paid</span>} />,
    );

    expect(screen.getByText('Paid').parentElement).toHaveClass('md:hidden');
  });

  it('defers the hand-off to xl for pages with a crowded command lane', () => {
    render(
      <EntityDetailHeader
        icon={<span>icon</span>}
        title="Client agreement"
        mobileStatus={<span>Sent</span>}
        statusHandoff="xl"
      />,
    );

    const wrapper = screen.getByText('Sent').parentElement;
    expect(wrapper).toHaveClass('xl:hidden');
    expect(wrapper).not.toHaveClass('md:hidden');
  });
});
