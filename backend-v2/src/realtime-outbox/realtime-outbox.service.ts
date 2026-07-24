import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  EnqueueRealtimeEventInput,
  EnqueueRealtimeEventResult,
  RealtimeEventName,
  RealtimeOutboxRow,
} from './realtime-outbox.types';

const CHANNEL_EVENTS: Record<string, ReadonlySet<RealtimeEventName>> = {
  user_canvas: new Set(['userListUpdated', 'userListDeleted']),
  shared_list: new Set(['listUpdated']),
  shared_note: new Set(['noteUpdated']),
  shared_whiteboard: new Set(['whiteboardUpdated']),
  shared_wireframe: new Set(['wireframeUpdated']),
  user_wireframe: new Set(['userWireframeUpdated']),
  shared_revocation: new Set(['sharedContentRevoked']),
};
const SHARE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID_PATTERN = /^[1-9]\d*$/;

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalJson((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

@Injectable()
export class RealtimeOutboxService {
  async enqueue(
    client: PoolClient,
    input: EnqueueRealtimeEventInput,
  ): Promise<EnqueueRealtimeEventResult> {
    this.validate(input);
    const inserted = await client.query<RealtimeOutboxRow>(
      `INSERT INTO realtime_event_outbox (
         event_key, aggregate_type, aggregate_id, channel, recipient_key,
         event_name, event_type, payload, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9, CURRENT_TIMESTAMP))
       ON CONFLICT (event_key) DO NOTHING
       RETURNING *`,
      [
        input.eventKey,
        input.aggregateType,
        input.aggregateId,
        input.channel,
        input.recipientKey,
        input.eventName,
        input.eventType,
        JSON.stringify(input.payload),
        input.occurredAt ?? null,
      ],
    );
    if (inserted.rows[0]) {
      return { event: inserted.rows[0], inserted: true };
    }

    const existing = await client.query<RealtimeOutboxRow>(
      'SELECT * FROM realtime_event_outbox WHERE event_key = $1',
      [input.eventKey],
    );
    if (!existing.rows[0] || !this.sameEvent(existing.rows[0], input)) {
      const error = new Error(
        'Realtime event key was reused for a different event',
      );
      Object.assign(error, { code: 'REALTIME_EVENT_KEY_CONFLICT' });
      throw error;
    }
    return { event: existing.rows[0], inserted: false };
  }

  private sameEvent(
    row: RealtimeOutboxRow,
    input: EnqueueRealtimeEventInput,
  ): boolean {
    return (
      row.aggregate_type === input.aggregateType &&
      Number(row.aggregate_id) === input.aggregateId &&
      row.channel === input.channel &&
      row.recipient_key === input.recipientKey &&
      row.event_name === input.eventName &&
      row.event_type === input.eventType &&
      JSON.stringify(canonicalJson(row.payload)) ===
        JSON.stringify(canonicalJson(input.payload))
    );
  }

  private validate(input: EnqueueRealtimeEventInput): void {
    if (
      typeof input.eventKey !== 'string' ||
      input.eventKey.length < 1 ||
      input.eventKey.length > 255
    ) {
      throw new Error(
        'Realtime event key must be between 1 and 255 characters',
      );
    }
    if (!['list', 'note', 'whiteboard', 'wireframe'].includes(input.aggregateType)) {
      throw new Error('Unsupported realtime aggregate type');
    }
    if (!Number.isSafeInteger(input.aggregateId) || input.aggregateId < 1) {
      throw new Error('Realtime aggregate ID must be a positive integer');
    }
    if (!CHANNEL_EVENTS[input.channel]?.has(input.eventName)) {
      throw new Error('Unsupported realtime channel/event combination');
    }
    if (
      typeof input.recipientKey !== 'string' ||
      input.recipientKey.length < 1 ||
      input.recipientKey.length > 255
    ) {
      throw new Error(
        'Realtime recipient key must be between 1 and 255 characters',
      );
    }
    if (
      ['user_canvas', 'user_wireframe'].includes(input.channel) &&
      !USER_ID_PATTERN.test(input.recipientKey)
    ) {
      throw new Error('Realtime user recipient must be a positive integer');
    }
    if (
      !['user_canvas', 'user_wireframe'].includes(input.channel) &&
      !SHARE_TOKEN_PATTERN.test(input.recipientKey)
    ) {
      throw new Error('Realtime shared recipient must be a UUID capability');
    }
    if (
      (input.channel === 'shared_note' && input.aggregateType !== 'note') ||
      (
        input.channel === 'shared_whiteboard' &&
        input.aggregateType !== 'whiteboard'
      ) ||
      (
        ['shared_wireframe', 'user_wireframe'].includes(input.channel) &&
        input.aggregateType !== 'wireframe'
      ) ||
      (
        input.channel === 'shared_revocation' &&
        input.aggregateType !== 'wireframe'
      ) ||
      (
        ![
          'shared_note',
          'shared_whiteboard',
          'shared_wireframe',
          'shared_revocation',
          'user_wireframe',
        ].includes(input.channel) &&
        input.aggregateType !== 'list'
      )
    ) {
      throw new Error('Realtime channel does not match aggregate type');
    }
    if (
      typeof input.eventType !== 'string' ||
      input.eventType.length < 1 ||
      input.eventType.length > 64
    ) {
      throw new Error(
        'Realtime event type must be between 1 and 64 characters',
      );
    }
    if (
      !input.payload ||
      typeof input.payload !== 'object' ||
      Array.isArray(input.payload)
    ) {
      throw new Error('Realtime payload must be an object');
    }
  }
}
