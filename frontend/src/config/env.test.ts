import { describe, it, expect } from 'vitest';
import { env } from './env';

describe.skip('Environment Validation', () => {
  it('is tested in application initialization', () => {
    expect(env).toBeDefined();
  });
});
