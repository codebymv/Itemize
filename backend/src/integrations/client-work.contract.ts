// Canonical v1 contract: keep byte-identical with Itemize's copy until packaged.
// Parsing validates shape only. Receivers must authorize the grant and transaction.
import { z } from 'zod';

const sourceId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const itemizeId = z.string().regex(/^[1-9][0-9]{0,9}$/)
  .refine((value) => Number(value) <= 2147483647, 'Must fit an Itemize database ID');
const timestamp = z.string().datetime({ offset: true });
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const envelope = {
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  connectionId: z.string().uuid(),
  connectionGeneration: version,
  entityVersion: version,
  occurredAt: timestamp,
  correlationId: sourceId,
};

const handoffRequested = z.object({
  ...envelope,
  type: z.literal('gleam.handoff.requested'),
  data: z.object({
    handoffId: sourceId,
    callId: sourceId,
    title: z.string().trim().min(1).max(255),
    summary: z.string().trim().min(1).max(4000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    requestedAt: timestamp,
    // The receiver validates this reference against its organization and mapping.
    itemizeContactId: itemizeId.nullable(),
    contactCandidate: z.object({
      name: z.string().trim().min(1).max(255).nullable(),
      phone: z.string().regex(/^\+[1-9][0-9]{1,14}$/).nullable(),
      email: z.string().email().max(254).nullable(),
    }).strict().nullable(),
  }).strict(),
}).strict();

const taskUpdated = z.object({
  ...envelope,
  type: z.literal('itemize.task.updated'),
  data: z.object({
    taskId: itemizeId,
    handoffId: sourceId,
    callId: sourceId,
    itemizeContactId: itemizeId.nullable(),
    title: z.string().trim().min(1).max(255),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    assignedUserId: itemizeId.nullable(),
    dueAt: timestamp.nullable(),
    completedAt: timestamp.nullable(),
  }).strict(),
}).strict().refine(
  ({ data }) => (data.status === 'completed') === (data.completedAt !== null),
  { message: 'Only completed tasks have a completion timestamp', path: ['data', 'completedAt'] },
);

export const clientWorkEventSchema = z.union([handoffRequested, taskUpdated]);
export type ClientWorkEvent = z.infer<typeof clientWorkEventSchema>;

// This receipt is emitted only after handoff application commits, never on enqueue.
export const handoffAppliedReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('applied'),
  eventId: z.string().uuid(),
  connectionId: z.string().uuid(),
  connectionGeneration: version,
  appliedAt: timestamp,
  result: z.object({
    handoffId: sourceId,
    taskId: itemizeId,
    itemizeContactId: itemizeId.nullable(),
  }).strict(),
}).strict();
export type HandoffAppliedReceipt = z.infer<typeof handoffAppliedReceiptSchema>;
