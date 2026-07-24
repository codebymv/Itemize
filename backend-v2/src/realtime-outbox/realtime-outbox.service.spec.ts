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

  it('accepts the bounded shared-whiteboard refetch projection', async () => {
    const whiteboardInput: EnqueueRealtimeEventInput = {
      eventKey: 'whiteboard:9:update:request-2:shared',
      aggregateType: 'whiteboard',
      aggregateId: 9,
      channel: 'shared_whiteboard',
      recipientKey: '621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
      eventName: 'whiteboardUpdated',
      eventType: 'whiteboardUpdated',
      payload: { id: 9, requires_refetch: true },
    };
    const query = jest.fn().mockResolvedValue({
      rows: [{
        ...row,
        event_key: whiteboardInput.eventKey,
        aggregate_type: 'whiteboard',
        aggregate_id: 9,
        channel: 'shared_whiteboard',
        recipient_key: whiteboardInput.recipientKey,
        event_name: 'whiteboardUpdated',
        event_type: 'whiteboardUpdated',
        payload: whiteboardInput.payload,
      }],
    });
    await expect(
      service.enqueue(
        { query } as unknown as PoolClient,
        whiteboardInput,
      ),
    ).resolves.toMatchObject({ inserted: true });
  });

  it('accepts shared and owner wireframe position events', async () => {
    const query = jest.fn().mockImplementation(
      (_sql: string, values: unknown[]) => Promise.resolve({
        rows: [{
          ...row,
          event_key: values[0],
          aggregate_type: values[1],
          aggregate_id: values[2],
          channel: values[3],
          recipient_key: values[4],
          event_name: values[5],
          event_type: values[6],
          payload: JSON.parse(String(values[7])),
        }],
      }),
    );
    const client = { query } as unknown as PoolClient;
    await expect(service.enqueue(client, {
      eventKey: 'wireframe:8:position:request-1:shared',
      aggregateType: 'wireframe',
      aggregateId: 8,
      channel: 'shared_wireframe',
      recipientKey: '621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
      eventName: 'wireframeUpdated',
      eventType: 'POSITION_UPDATE',
      payload: { id: 8, position_x: 10, position_y: 20 },
    })).resolves.toMatchObject({ inserted: true });
    await expect(service.enqueue(client, {
      eventKey: 'wireframe:8:position:request-1:owner',
      aggregateType: 'wireframe',
      aggregateId: 8,
      channel: 'user_wireframe',
      recipientKey: '7',
      eventName: 'userWireframeUpdated',
      eventType: 'POSITION_UPDATE',
      payload: { id: 8, position_x: 10, position_y: 20 },
    })).resolves.toMatchObject({ inserted: true });
  });

  it('accepts a wireframe sharing revocation capability event', async () => {
    const revocation: EnqueueRealtimeEventInput = {
      eventKey:
        'wireframe:8:sharing-revoked:e1ccf127-fbea-4c3f-a3d5-c6d6ee993e0c',
      aggregateType: 'wireframe',
      aggregateId: 8,
      channel: 'shared_revocation',
      recipientKey: '621ca66e-2b82-46a7-b2ba-e7343b6cbac2',
      eventName: 'sharedContentRevoked',
      eventType: 'sharing_revoked',
      payload: { kind: 'wireframe', reason: 'sharing_revoked' },
    };
    const query = jest.fn().mockResolvedValue({
      rows: [{
        ...row,
        event_key: revocation.eventKey,
        aggregate_type: revocation.aggregateType,
        aggregate_id: revocation.aggregateId,
        channel: revocation.channel,
        recipient_key: revocation.recipientKey,
        event_name: revocation.eventName,
        event_type: revocation.eventType,
        payload: revocation.payload,
      }],
    });

    await expect(service.enqueue(
      { query } as unknown as PoolClient,
      revocation,
    )).resolves.toMatchObject({ inserted: true });
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
