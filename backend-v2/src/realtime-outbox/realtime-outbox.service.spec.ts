import { PoolClient } from 'pg';
import { RealtimeOutboxService } from './realtime-outbox.service';
import {
  EnqueueRealtimeEventInput,
  RealtimeOutboxRow,
} from './realtime-outbox.types';

const input: EnqueueRealtimeEventInput = {
  eventKey: 'list:42:update:request-1:user',
  aggregateType: 'list',
  aggregateId: 42,
  channel: 'user_canvas',
  recipientKey: '7',
  eventName: 'userListUpdated',
  eventType: 'LIST_UPDATE',
  payload: { id: 42, title: 'Release checklist' },
};

const row: RealtimeOutboxRow = {
  id: '1',
  event_key: input.eventKey,
  aggregate_type: input.aggregateType,
  aggregate_id: input.aggregateId,
  channel: input.channel,
  recipient_key: input.recipientKey,
  event_name: input.eventName,
  event_type: input.eventType,
  payload: input.payload,
  occurred_at: new Date('2026-07-18T12:00:00.000Z'),
};

describe('RealtimeOutboxService', () => {
  const service = new RealtimeOutboxService();

  it('inserts a transaction-bound event', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [row] });
    const result = await service.enqueue({ query } as unknown as PoolClient, input);

    expect(result).toEqual({ event: row, inserted: true });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'INSERT INTO realtime_event_outbox',
    );
  });

  it('returns an identical existing event for an idempotent replay', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...row, payload: { title: 'Release checklist', id: 42 } }],
      });

    await expect(
      service.enqueue({ query } as unknown as PoolClient, input),
    ).resolves.toEqual({
      event: { ...row, payload: { title: 'Release checklist', id: 42 } },
      inserted: false,
    });
  });

  it('rejects an event-key collision with different content', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...row, event_type: 'ITEM_ADDED' }] });

    await expect(
      service.enqueue({ query } as unknown as PoolClient, input),
    ).rejects.toMatchObject({ code: 'REALTIME_EVENT_KEY_CONFLICT' });
  });

  it('rejects unsupported channel/event combinations before querying', async () => {
    const query = jest.fn();
    await expect(
      service.enqueue({ query } as unknown as PoolClient, {
        ...input,
        channel: 'shared_note',
      }),
    ).rejects.toThrow('Unsupported realtime channel/event combination');
    expect(query).not.toHaveBeenCalled();
  });
});
