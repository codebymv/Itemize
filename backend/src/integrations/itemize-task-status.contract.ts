import { z } from 'zod';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const itemizeTaskStateSchema = z.object({
  version: z.number().int().positive().max(2147483647),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  completedAt: z.string().datetime().nullable(),
}).strict().refine(value => (value.status === 'completed') === (value.completedAt !== null));

/** Current state, not an event feed: missed intermediate edits require no replay. Null is a deletion tombstone. */
export const itemizeTaskSnapshotSchema = z.object({
  schemaVersion: z.literal(1), connectionId: z.string().uuid(),
  connectionGeneration: z.number().int().positive().max(2147483647),
  eventId: z.string().uuid(), handoffId: identifier, callId: identifier,
  taskId: z.string().regex(/^[1-9][0-9]*$/).refine(value => Number(value) <= 2147483647),
  task: itemizeTaskStateSchema.nullable(),
}).strict();
export type ItemizeTaskSnapshot = z.infer<typeof itemizeTaskSnapshotSchema>;
