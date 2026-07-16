import { describe, it, expect } from 'vitest';
import { env } from './env';

describe('Environment Validation', () => {
  it('accepts the Vitest runtime mode during application initialization', () => {
    expect(env).toBeDefined();
    expect(env.MODE).toBe('test');
    expect(env.VITE_CONTACT_READS_GRAPHQL).toBe('false');
  });
});
