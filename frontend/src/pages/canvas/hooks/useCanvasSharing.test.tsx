import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note, Vault } from '@/types';
import {
  disableNoteSharingViaGraphql,
  enableNoteSharingViaGraphql,
} from '@/services/workspaceSharingMutationsGraphql';
import {
  enableVaultSharingViaGraphql,
  getVaultViaGraphql,
} from '@/services/workspaceVaultGraphql';
import { appendShareFragment } from '@/lib/vaultZkCrypto';
import {
  decryptZkeVaultItems,
  encryptVaultShareSnapshot,
  isVaultZke,
} from '@/lib/vaultZkSession';
import { useCanvasSharing } from './useCanvasSharing';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/workspaceSharingMutationsGraphql', () => ({
  disableListSharingViaGraphql: vi.fn(),
  disableNoteSharingViaGraphql: vi.fn(),
  disableWhiteboardSharingViaGraphql: vi.fn(),
  enableListSharingViaGraphql: vi.fn(),
  enableNoteSharingViaGraphql: vi.fn(),
  enableWhiteboardSharingViaGraphql: vi.fn(),
}));

vi.mock('@/services/workspaceWireframeMutationsGraphql', () => ({
  disableWorkspaceWireframeSharingViaGraphql: vi.fn(),
  enableWorkspaceWireframeSharingViaGraphql: vi.fn(),
}));

vi.mock('@/services/workspaceVaultGraphql', () => ({
  disableVaultSharingViaGraphql: vi.fn(),
  enableVaultSharingViaGraphql: vi.fn(),
  getVaultViaGraphql: vi.fn(),
}));

vi.mock('@/lib/vaultZkCrypto', () => ({
  appendShareFragment: vi.fn(),
}));

vi.mock('@/lib/vaultZkSession', () => ({
  decryptZkeVaultItems: vi.fn(),
  encryptVaultShareSnapshot: vi.fn(),
  isVaultZke: vi.fn(),
}));

const note: Note = {
  id: 7,
  user_id: 1,
  title: 'Release plan',
  content: 'Ship it safely',
  color_value: '#2563eb',
  position_x: 0,
  position_y: 0,
  width: 570,
  height: 350,
  z_index: 0,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
};

const vault = {
  id: 12,
  user_id: 1,
  title: 'Production credentials',
  color_value: '#2563eb',
  position_x: 0,
  position_y: 0,
  width: 570,
  height: 350,
  z_index: 0,
  is_locked: false,
  crypto_version: 1,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
} satisfies Vault;

const createStateSetters = () => ({
  setLists: vi.fn(),
  setNotes: vi.fn(),
  setWhiteboards: vi.fn(),
  setWireframes: vi.fn(),
  setVaults: vi.fn(),
});

describe('useCanvasSharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps local share state in sync after publishing and revoking', async () => {
    vi.mocked(enableNoteSharingViaGraphql).mockResolvedValue({
      shareToken: 'note-token',
      shareUrl: 'https://itemize.cloud/shared/note/note-token',
    });
    vi.mocked(disableNoteSharingViaGraphql).mockResolvedValue(undefined);
    const state = createStateSetters();
    const { result } = renderHook(() => (
      useCanvasSharing([], [note], [], [], [], state)
    ));

    await act(async () => {
      await result.current.shareHandlers.note.onShare(note.id);
    });

    const markShared = state.setNotes.mock.calls[0][0] as (notes: Note[]) => Note[];
    expect(markShared([note])).toEqual([
      expect.objectContaining({
        id: note.id,
        is_public: true,
        share_token: 'note-token',
        shared_at: expect.any(String),
      }),
    ]);

    await act(async () => {
      await result.current.shareHandlers.note.onUnshare(
        note.id,
        'sharing-attempt-1',
      );
    });

    expect(disableNoteSharingViaGraphql).toHaveBeenCalledWith(
      note.id,
      'sharing-attempt-1',
    );

    const markUnshared = state.setNotes.mock.calls[1][0] as (notes: Note[]) => Note[];
    expect(markUnshared([{ ...note, is_public: true, share_token: 'note-token' }])).toEqual([
      expect.objectContaining({
        id: note.id,
        is_public: false,
        share_token: undefined,
        shared_at: undefined,
      }),
    ]);
  });

  it('uses the latest vault state and preserves client-side encryption in its share URL', async () => {
    vi.mocked(isVaultZke).mockReturnValue(true);
    vi.mocked(getVaultViaGraphql).mockResolvedValue(vault);
    vi.mocked(decryptZkeVaultItems).mockResolvedValue([]);
    vi.mocked(encryptVaultShareSnapshot).mockResolvedValue({
      ciphertext: 'ciphertext',
      iv: 'iv',
      shareSecret: 'secret',
    });
    vi.mocked(enableVaultSharingViaGraphql).mockResolvedValue({
      shareToken: 'vault-token',
      shareUrl: 'https://itemize.cloud/shared/vault/vault-token',
    });
    vi.mocked(appendShareFragment).mockImplementation((url, secret) => `${url}#${secret}`);
    const state = createStateSetters();
    const { result, rerender } = renderHook(
      ({ vaults }: { vaults: Vault[] }) => useCanvasSharing([], [], [], [], vaults, state),
      { initialProps: { vaults: [] as Vault[] } },
    );

    rerender({ vaults: [vault] });

    let shareResult: { shareToken: string; shareUrl: string } | undefined;
    await act(async () => {
      shareResult = await result.current.shareHandlers.vault.onShare(vault.id);
    });

    expect(enableVaultSharingViaGraphql).toHaveBeenCalledWith(vault.id, {
      ciphertext: 'ciphertext',
      iv: 'iv',
    });
    expect(shareResult).toEqual({
      shareToken: 'vault-token',
      shareUrl: 'https://itemize.cloud/shared/vault/vault-token#secret',
    });
  });
});
