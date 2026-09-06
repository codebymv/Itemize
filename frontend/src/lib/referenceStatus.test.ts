import { describe, expect, it } from 'vitest';
import { compactAge, describeReference, indexReferences } from './referenceStatus';
import type { WorkspaceReference } from '@/types';

const now = new Date('2026-09-06T12:00:00.000Z').getTime();
const reference = (values: Partial<WorkspaceReference>): WorkspaceReference => ({
  entityType: 'invoice',
  entityId: 4,
  label: 'INV-0012',
  status: null,
  total: null,
  currency: null,
  sentAt: null,
  viewedAt: null,
  paidAt: null,
  acceptedAt: null,
  declinedAt: null,
  ...values,
});

describe('referenceStatus', () => {
  it('formats ages compactly', () => {
    expect(compactAge('2026-09-06T11:30:00.000Z', now)).toBe('now');
    expect(compactAge('2026-09-06T08:00:00.000Z', now)).toBe('4h');
    expect(compactAge('2026-09-04T12:00:00.000Z', now)).toBe('2d');
    expect(compactAge('2026-07-01T12:00:00.000Z', now)).toBe('2mo');
    expect(compactAge(null, now)).toBeNull();
    expect(compactAge('not a date', now)).toBeNull();
  });

  it('describes a money document by status plus the latest recipient event', () => {
    expect(describeReference(reference({ status: 'sent', sentAt: '2026-09-04T12:00:00.000Z', viewedAt: '2026-09-05T12:00:00.000Z' }), now))
      .toBe('sent · viewed 1d');
    expect(describeReference(reference({ status: 'paid', paidAt: '2026-09-06T11:00:00.000Z' }), now)).toBe('paid');
    expect(describeReference(reference({ entityType: 'estimate', status: 'sent', acceptedAt: '2026-09-06T09:00:00.000Z' }), now))
      .toBe('sent · accepted 3h');
    expect(describeReference(reference({ status: 'draft' }), now)).toBe('draft');
    expect(describeReference(reference({}), now)).toBeNull();
  });

  it('never describes a client', () => {
    expect(describeReference(reference({ entityType: 'contact', status: 'active' }), now)).toBeNull();
  });

  it('indexes references by entity key', () => {
    const index = indexReferences([reference({}), reference({ entityType: 'contact', entityId: 1 })]);
    expect(index.get('invoice:4')?.label).toBe('INV-0012');
    expect(index.get('contact:1')).toBeDefined();
    expect(indexReferences(undefined).size).toBe(0);
  });
});
