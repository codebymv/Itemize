import { z } from 'zod';

export const itemizeNotificationReceiptSchema = z.object({
  schemaVersion:z.literal(1),connectionId:z.string().uuid(),connectionGeneration:z.number().int().positive(),
  eventId:z.string().uuid(),handoffId:z.string().min(1).max(128),taskId:z.string().regex(/^[1-9][0-9]*$/),
  status:z.enum(['notified','not_needed']),recordedAt:z.string().datetime(),
}).strict();
