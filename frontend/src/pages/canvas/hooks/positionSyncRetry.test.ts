import { shouldRetryPositionSync } from './positionSyncRetry';

describe('shouldRetryPositionSync', () => {
  it('retries network failures and 429/5xx', () => {
    expect(shouldRetryPositionSync(new Error('network'))).toBe(true);
    expect(shouldRetryPositionSync({ response: { status: 429 } })).toBe(true);
    expect(shouldRetryPositionSync({ response: { status: 503 } })).toBe(true);
  });

  it('does not retry client errors other than 429', () => {
    expect(shouldRetryPositionSync({ response: { status: 400 } })).toBe(false);
    expect(shouldRetryPositionSync({ response: { status: 401 } })).toBe(false);
  });
});
