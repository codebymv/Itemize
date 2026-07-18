import type { Socket } from 'socket.io-client';

export const SHARED_CONTENT_REVOKED_EVENT = 'sharedContentRevoked';

export interface SharedContentRevoked {
  kind: 'list' | 'note' | 'whiteboard' | 'wireframe';
  reason: 'sharing_revoked';
  timestamp: string;
}

interface RealtimeError {
  code?: string;
  message?: string;
}

const SHARED_EVENTS = {
  list: {
    join: 'joinSharedList',
    joined: 'joinedSharedList',
  },
  note: {
    join: 'joinSharedNote',
    joined: 'joinedSharedNote',
  },
  whiteboard: {
    join: 'joinSharedWhiteboard',
    joined: 'joinedSharedWhiteboard',
  },
  wireframe: {
    join: 'joinSharedWireframe',
    joined: 'joinedSharedWireframe',
  },
} as const;

const MAX_QUEUED_UPDATES = 100;

type SharedKind = SharedContentRevoked['kind'];
type RevocationSocket = Pick<Socket, 'on' | 'off' | 'disconnect'>;
type RecoverySocket = Pick<Socket, 'on' | 'off' | 'emit' | 'disconnect'>;

interface SharedRealtimeRecoveryOptions {
  refetch: () => Promise<void>;
  onLiveChange: (isLive: boolean) => void;
  onUnavailable: () => void;
  onRecoveryError: (error: unknown) => void;
}

export interface SharedRealtimeRecovery {
  acceptUpdate: (applyUpdate: () => void) => void;
  unregister: () => void;
}

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

export function registerSharedRealtimeRecovery(
  socket: RecoverySocket,
  kind: SharedKind,
  capability: string,
  options: SharedRealtimeRecoveryOptions,
): SharedRealtimeRecovery {
  const events = SHARED_EVENTS[kind];
  let joinedOnce = false;
  let ready = false;
  let disposed = false;
  let connectionVersion = 0;
  let queuedUpdates: Array<() => void> = [];
  let queueOverflowed = false;

  const markOffline = () => {
    ready = false;
    options.onLiveChange(false);
  };

  const handleConnect = () => {
    connectionVersion += 1;
    markOffline();
    socket.emit(events.join, capability);
  };

  const handleDisconnect = () => {
    connectionVersion += 1;
    markOffline();
  };

  const handleJoined = async () => {
    if (disposed) return;

    if (!joinedOnce) {
      joinedOnce = true;
      ready = true;
      options.onLiveChange(true);
      const pending = queuedUpdates;
      queuedUpdates = [];
      pending.forEach(applyUpdate => applyUpdate());
      return;
    }

    const recoveryVersion = connectionVersion;
    try {
      do {
        queueOverflowed = false;
        await options.refetch();
      } while (queueOverflowed && !disposed && recoveryVersion === connectionVersion);

      if (disposed || recoveryVersion !== connectionVersion) return;
      ready = true;
      options.onLiveChange(true);
      const pending = queuedUpdates;
      queuedUpdates = [];
      pending.forEach(applyUpdate => applyUpdate());
    } catch (error) {
      if (disposed || recoveryVersion !== connectionVersion) return;
      queuedUpdates = [];
      markOffline();
      options.onRecoveryError(error);
    }
  };

  const handleRealtimeError = (error: RealtimeError) => {
    if (error?.code !== 'INVALID_CAPABILITY') return;
    connectionVersion += 1;
    queuedUpdates = [];
    markOffline();
    options.onUnavailable();
    socket.disconnect();
  };

  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on(events.joined, handleJoined);
  socket.on('realtimeError', handleRealtimeError);

  return {
    acceptUpdate(applyUpdate) {
      if (disposed) return;
      if (ready) {
        applyUpdate();
        return;
      }
      if (queuedUpdates.length >= MAX_QUEUED_UPDATES) {
        queuedUpdates = [];
        queueOverflowed = true;
      }
      queuedUpdates.push(applyUpdate);
    },
    unregister() {
      disposed = true;
      connectionVersion += 1;
      queuedUpdates = [];
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(events.joined, handleJoined);
      socket.off('realtimeError', handleRealtimeError);
    },
  };
}
