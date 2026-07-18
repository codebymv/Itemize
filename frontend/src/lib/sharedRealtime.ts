import type { Socket } from 'socket.io-client';

export const SHARED_CONTENT_REVOKED_EVENT = 'sharedContentRevoked';

export interface SharedContentRevoked {
  kind: 'list' | 'note' | 'whiteboard' | 'wireframe';
  reason: 'sharing_revoked';
  timestamp: string;
}

type RevocationSocket = Pick<Socket, 'on' | 'off' | 'disconnect'>;

export function registerSharedContentRevocation(
  socket: RevocationSocket,
  kind: SharedContentRevoked['kind'],
  onRevoked: () => void,
): () => void {
  const handleRevoked = (event: SharedContentRevoked) => {
    if (event?.kind !== kind) return;
    onRevoked();
    socket.disconnect();
  };

  socket.on(SHARED_CONTENT_REVOKED_EVENT, handleRevoked);
  return () => socket.off(SHARED_CONTENT_REVOKED_EVENT, handleRevoked);
}
