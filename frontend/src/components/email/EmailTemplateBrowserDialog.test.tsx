import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmailTemplateBrowserDialog } from './EmailTemplateBrowserDialog';

const templates = [
  { id: 1, name: 'Welcome', subject: 'Welcome to Itemize', category: 'onboarding' },
  { id: 2, name: 'Monthly update', subject: 'What is new this month', category: 'marketing' },
];

describe('EmailTemplateBrowserDialog', () => {
  it('searches and selects through the same library contract used by each email context', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <EmailTemplateBrowserDialog
        open
        onOpenChange={onOpenChange}
        items={templates}
        onSelect={onSelect}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Search email templates' }), 'monthly');
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Monthly update/ }));

    expect(onSelect).toHaveBeenCalledWith(templates[1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps preview and selection inside the reusable browser', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EmailTemplateBrowserDialog
        open
        onOpenChange={vi.fn()}
        items={templates}
        onSelect={onSelect}
        renderPreview={template => <div>Previewing {template.subject}</div>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Preview Welcome' }));
    expect(screen.getByText('Previewing Welcome to Itemize')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    expect(onSelect).toHaveBeenCalledWith(templates[0]);
  });
});
