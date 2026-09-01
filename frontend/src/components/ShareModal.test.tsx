import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareModal } from './ShareModal';

describe('ShareModal', () => {
  it('requires an explicit confirmation before publishing a workspace item', async () => {
    const onShare = vi.fn().mockResolvedValue({
      shareToken: 'share-token',
      shareUrl: 'https://itemize.cloud/shared/note/share-token',
    });

    render(
      <ShareModal
        open
        onOpenChange={vi.fn()}
        itemType="note"
        itemId={1}
        itemTitle="Release readiness note"
        onShare={onShare}
        onUnshare={vi.fn()}
      />,
    );

    expect(onShare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(onShare).toHaveBeenCalledWith(1));
    expect(
      await screen.findByDisplayValue(
        'https://itemize.cloud/shared/note/share-token',
      ),
    ).toBeInTheDocument();
  });

  it('keeps vault link guidance in a tooltip instead of persistent copy', async () => {
    render(
      <ShareModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        itemId={2}
        itemTitle="Release vault"
        onShare={vi.fn()}
        onUnshare={vi.fn()}
        existingShareData={{
          shareToken: 'vault-token',
          shareUrl: 'https://itemize.cloud/shared/vault/vault-token#secret',
        }}
      />,
    );

    expect(
      screen.getByText('Create an encrypted share link.'),
    ).toHaveClass('sr-only');

    const help = screen.getByRole('button', { name: 'About vault share links' });
    expect(help).toBeInTheDocument();

    fireEvent.focus(help);
    await waitFor(() => {
      const tooltipId = help.getAttribute('aria-describedby');
      expect(tooltipId).toBeTruthy();
      expect(document.getElementById(tooltipId!)).toHaveTextContent(
        /Anyone with the full URL, including the #fragment/,
      );
    });
  });

  it('uses the concise hierarchy and labels shared note controls accessibly', async () => {
    render(
      <ShareModal
        open
        onOpenChange={vi.fn()}
        itemType="note"
        itemId={3}
        itemTitle="Product positioning"
        onShare={vi.fn()}
        onUnshare={vi.fn()}
        existingShareData={{
          shareToken: 'note-token',
          shareUrl: 'https://itemize.cloud/shared/note/note-token',
        }}
      />,
    );

    expect(screen.getByText('Create a shareable link for your note')).toHaveClass('sr-only');
    expect(document.querySelector('p.text-xs')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About note share links' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Note share link' })).toHaveAttribute('readonly');
  });

  it('keeps one caller-owned mutation ID across an ambiguous revoke retry', async () => {
    const onUnshare = vi.fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(undefined);

    render(
      <ShareModal
        open
        onOpenChange={vi.fn()}
        itemType="note"
        itemId={4}
        itemTitle="Retry-safe note"
        onShare={vi.fn()}
        onUnshare={onUnshare}
        existingShareData={{
          shareToken: 'note-token',
          shareUrl: 'https://itemize.cloud/shared/note/note-token',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Sharing' }));
    await waitFor(() => expect(onUnshare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Revoke Sharing' }),
    ).not.toHaveAttribute('aria-busy'));

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Sharing' }));
    await waitFor(() => expect(onUnshare).toHaveBeenCalledTimes(2));

    expect(onUnshare.mock.calls[0][0]).toBe(4);
    expect(onUnshare.mock.calls[1][0]).toBe(4);
    expect(onUnshare.mock.calls[0][1]).toBe(onUnshare.mock.calls[1][1]);
  });
});
