import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmailStudioDialog } from './EmailStudioDialog';

vi.mock('./EmailPreviewPane', () => ({
  EmailPreviewPane: () => <div>Email preview</div>,
}));

describe('EmailStudioDialog', () => {
  it('keeps context-specific navigation in the shared studio header', () => {
    render(
      <EmailStudioDialog
        open
        onOpenChange={vi.fn()}
        title="Welcome email"
        organizationId={4}
        content={{ subject: 'Welcome', preheader: '', bodyHtml: '<p>Hello</p>', bodyText: '' }}
        editor={<div>Email content editor</div>}
        headerActions={<button type="button">Templates</button>}
        mode="edit"
        onModeChange={vi.fn()}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onPublish={vi.fn()}
      />,
    );

    expect(screen.getByText('Email content editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Template settings/i })).not.toBeInTheDocument();
  });

  it('supports an operational email workflow through injected actions, preview, and footer', () => {
    render(
      <EmailStudioDialog
        open
        onOpenChange={vi.fn()}
        title="Compose email"
        subtitle="2 recipients"
        headerActions={<button type="button">Browse templates</button>}
        editor={<div>Operational email editor</div>}
        preview={<div>Operational delivery preview</div>}
        footer={<button type="button">Send to 2</button>}
        mode="edit"
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('2 recipients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse templates' })).toBeInTheDocument();
    expect(screen.getByText('Operational email editor')).toBeInTheDocument();
    expect(screen.getByText('Operational delivery preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });
});
