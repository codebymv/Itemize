import { describe, expect, it } from 'vitest';
import canonicalRegistry from '../../../workflow-registry.json';
import bundledRegistry from '../../workflow-registry.json';

describe('workflow registry packaging', () => {
  it('keeps the frontend bundle identical to the monorepo authority', () => {
    expect(bundledRegistry).toEqual(canonicalRegistry);
  });
});
