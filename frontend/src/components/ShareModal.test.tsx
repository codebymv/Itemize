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
      screen.getByText('Create a shareable link. The decryption key stays in the URL fragment.'),
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
});
