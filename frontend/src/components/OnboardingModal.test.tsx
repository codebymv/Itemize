import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingModal, type OnboardingContent } from './OnboardingModal';

const content: OnboardingContent = {
  title: 'Build your workspace',
  description: 'Choose what fits your work.',
  version: '3.0',
  completeLabel: 'Start exploring',
  steps: [
    {
      title: 'Choose what belongs on your canvas',
      description: 'Mix different content types or use only what you need.',
      tips: ['Lists', 'Notes'],
    },
  ],
};

describe('OnboardingModal', () => {
  it('persists an explicit Skip Tour choice', () => {
    const onClose = vi.fn();
    const onDismiss = vi.fn();

    render(
      <OnboardingModal
        isOpen
        onClose={onClose}
        onComplete={vi.fn()}
        onDismiss={onDismiss}
        content={content}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip Tour' }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the configured truthful completion label', () => {
    const onComplete = vi.fn();

    render(
      <OnboardingModal
        isOpen
        onClose={vi.fn()}
        onComplete={onComplete}
        onDismiss={vi.fn()}
        content={content}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start exploring' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
