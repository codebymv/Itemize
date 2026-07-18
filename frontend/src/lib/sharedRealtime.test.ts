import {
  registerSharedRealtimeRecovery,
  registerSharedContentRevocation,
  SHARED_CONTENT_REVOKED_EVENT,
  type SharedContentRevoked,
} from './sharedRealtime';

function createSocket() {
  const handlers = new Map<string, (...args: never[]) => unknown>();
  return {
    handlers,
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: never[]) => unknown) => {
      handlers.set(event, handler as (...args: never[]) => unknown);
    }),
    off: vi.fn((event: string, handler: (...args: never[]) => unknown) => {
      if (handlers.get(event) === handler) handlers.delete(event);
    }),
    async trigger(event: string, payload?: unknown) {
      return handlers.get(event)?.(payload as never);
    },
  };
}

describe('shared realtime revocation', () => {
  it('removes revoked content and disconnects its socket', () => {
    const socket = createSocket();
    const onRevoked = vi.fn();
    const unregister = registerSharedContentRevocation(
      socket as never,
      'note',
      onRevoked,
    );
    socket.trigger(SHARED_CONTENT_REVOKED_EVENT, {
      kind: 'whiteboard',
      reason: 'sharing_revoked',
      timestamp: '2026-07-18T00:00:00.000Z',
    });
    expect(onRevoked).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();

    socket.trigger(SHARED_CONTENT_REVOKED_EVENT, {
      kind: 'note',
      reason: 'sharing_revoked',
      timestamp: '2026-07-18T00:00:00.000Z',
    });
    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);

    unregister();
    expect(socket.handlers.has(SHARED_CONTENT_REVOKED_EVENT)).toBe(false);
  });

  it('reauthorizes, refetches, and queues updates before recovering a reconnect', async () => {
    const socket = createSocket();
    let resolveRefetch: (() => void) | undefined;
    const refetch = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefetch = resolve;
    }));
    const onLiveChange = vi.fn();
    const applyUpdate = vi.fn();
    const recovery = registerSharedRealtimeRecovery(
      socket as never,
      'note',
      'share-capability',
      {
        refetch,
        onLiveChange,
        onUnavailable: vi.fn(),
        onRecoveryError: vi.fn(),
      },
    );

    await socket.trigger('connect');
    expect(socket.emit).toHaveBeenLastCalledWith('joinSharedNote', 'share-capability');
    recovery.acceptUpdate(applyUpdate);
    expect(applyUpdate).not.toHaveBeenCalled();

    await socket.trigger('joinedSharedNote');
    expect(refetch).not.toHaveBeenCalled();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(onLiveChange).toHaveBeenLastCalledWith(true);

    await socket.trigger('disconnect');
    await socket.trigger('connect');
    recovery.acceptUpdate(applyUpdate);
    expect(applyUpdate).toHaveBeenCalledTimes(1);

    const recoveryJoin = socket.trigger('joinedSharedNote');
    await Promise.resolve();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(onLiveChange).toHaveBeenLastCalledWith(false);

    resolveRefetch?.();
    await recoveryJoin;
    expect(applyUpdate).toHaveBeenCalledTimes(2);
    expect(onLiveChange).toHaveBeenLastCalledWith(true);
  });

  it('clears stale content when reconnect admission discovers a revoked capability', async () => {
    const socket = createSocket();
    const onUnavailable = vi.fn();
    const recovery = registerSharedRealtimeRecovery(
      socket as never,
      'whiteboard',
      'revoked-capability',
      {
        refetch: vi.fn().mockResolvedValue(undefined),
        onLiveChange: vi.fn(),
        onUnavailable,
        onRecoveryError: vi.fn(),
      },
    );
    const applyUpdate = vi.fn();

    await socket.trigger('connect');
    recovery.acceptUpdate(applyUpdate);
    await socket.trigger('realtimeError', {
      code: 'INVALID_CAPABILITY',
      message: 'Invalid or inactive share link',
    });

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('keeps stale static content but reports a failed reconnect refetch', async () => {
    const socket = createSocket();
    const recoveryError = new Error('network unavailable');
    const onRecoveryError = vi.fn();
    const recovery = registerSharedRealtimeRecovery(
      socket as never,
      'list',
      'share-capability',
      {
        refetch: vi.fn().mockRejectedValue(recoveryError),
        onLiveChange: vi.fn(),
        onUnavailable: vi.fn(),
        onRecoveryError,
      },
    );
    const applyUpdate = vi.fn();

    await socket.trigger('connect');
    await socket.trigger('joinedSharedList');
    await socket.trigger('disconnect');
    await socket.trigger('connect');
    recovery.acceptUpdate(applyUpdate);
    await socket.trigger('joinedSharedList');

    expect(onRecoveryError).toHaveBeenCalledWith(recoveryError);
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});
