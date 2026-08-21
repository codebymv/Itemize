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
        autoGenerate={false}
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
});
