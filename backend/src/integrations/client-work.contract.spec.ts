import { clientWorkEventSchema, handoffAppliedReceiptSchema } from './client-work.contract';
const fixtures = require('./client-work.contract.fixtures.json');

describe('client-work v1 wire contract', () => {
  it('accepts the synthetic handoff, completion and committed receipt in both products', () => {
    expect(clientWorkEventSchema.parse(fixtures.handoff)).toEqual(fixtures.handoff);
    expect(clientWorkEventSchema.parse(fixtures.taskCompleted)).toEqual(fixtures.taskCompleted);
    expect(handoffAppliedReceiptSchema.parse(fixtures.appliedReceipt)).toEqual(fixtures.appliedReceipt);
  });

  it.each([
    { schemaVersion: 2 }, { type: 'gleam.call.requested' }, { connectionGeneration: 0 },
    { entityVersion: 1.5 }, { eventId: 'not-an-event-id' }, { occurredAt: 'yesterday' },
    { organizationId: 'untrusted-tenant' }, { accessToken: 'must-not-be-exported' },
  ])('rejects unsupported or untrusted envelope fields: %j', (override) => {
    expect(clientWorkEventSchema.safeParse({ ...fixtures.handoff, ...override }).success).toBe(false);
  });

  it.each([
    { title: ' ' }, { summary: 'x'.repeat(4001) }, { priority: 'critical' },
    { itemizeContactId: 24 }, { itemizeContactId: '2147483648' },
    { consent: true }, { recordingUrl: 'https://example.invalid/recording' },
    { contactCandidate: { name: null, phone: '555-0100', email: null } },
  ])('rejects invalid or unapproved handoff fields: %j', (override) => {
    expect(clientWorkEventSchema.safeParse({ ...fixtures.handoff, data: { ...fixtures.handoff.data, ...override } }).success).toBe(false);
  });

  it('allows an unknown caller without manufacturing an identity', () => {
    expect(clientWorkEventSchema.safeParse({ ...fixtures.handoff, data: { ...fixtures.handoff.data, contactCandidate: null } }).success).toBe(true);
  });

  it.each(['pending', 'in_progress', 'cancelled'])('accepts %s and reopened task snapshots without a completion time', (status) => {
    expect(clientWorkEventSchema.safeParse({ ...fixtures.taskCompleted, data: { ...fixtures.taskCompleted.data, status, completedAt: null } }).success).toBe(true);
    expect(clientWorkEventSchema.safeParse({ ...fixtures.taskCompleted, data: { ...fixtures.taskCompleted.data, status } }).success).toBe(false);
  });

  it('rejects a completed task without evidence of completion time', () => {
    expect(clientWorkEventSchema.safeParse({ ...fixtures.taskCompleted, data: { ...fixtures.taskCompleted.data, completedAt: null } }).success).toBe(false);
  });

  it('does not accept enqueue acknowledgement as a committed application receipt', () => {
    expect(handoffAppliedReceiptSchema.safeParse({ ...fixtures.appliedReceipt, status: 'accepted' }).success).toBe(false);
    expect(handoffAppliedReceiptSchema.safeParse({ ...fixtures.appliedReceipt, result: { handoffId: 'synthetic-handoff-1' } }).success).toBe(false);
  });
});
