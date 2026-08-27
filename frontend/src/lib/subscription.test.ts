import { describe, expect, it } from 'vitest';
import { shouldStartSoloTrial } from './subscription';

describe('subscription actions', () => {
  it('starts the no-card Solo trial only for an eligible Free organization', () => {
    expect(shouldStartSoloTrial('free', 'starter', true)).toBe(true);
    expect(shouldStartSoloTrial('free', 'starter', false)).toBe(false);
    expect(shouldStartSoloTrial('starter', 'starter', true)).toBe(false);
    expect(shouldStartSoloTrial('free', 'unlimited', true)).toBe(false);
  });
});
