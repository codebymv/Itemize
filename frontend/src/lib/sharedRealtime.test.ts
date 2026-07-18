import {
  registerSharedContentRevocation,
  SHARED_CONTENT_REVOKED_EVENT,
  type SharedContentRevoked,
} from './sharedRealtime';

function createSocket() {
  const handlers = new Map<string, (event: SharedContentRevoked) => void>();
  return {
    handlers,
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: (payload: SharedContentRevoked) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string, handler: (payload: SharedContentRevoked) => void) => {
      if (handlers.get(event) === handler) handlers.delete(event);
    }),
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
    const handler = socket.handlers.get(SHARED_CONTENT_REVOKED_EVENT);

    handler?.({
      kind: 'whiteboard',
      reason: 'sharing_revoked',
      timestamp: '2026-07-18T00:00:00.000Z',
    });
    expect(onRevoked).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();

    handler?.({
      kind: 'note',
      reason: 'sharing_revoked',
      timestamp: '2026-07-18T00:00:00.000Z',
    });
    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);

    unregister();
    expect(socket.handlers.has(SHARED_CONTENT_REVOKED_EVENT)).toBe(false);
  });
});
