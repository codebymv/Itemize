export type RealtimeAggregateType = 'list' | 'note' | 'whiteboard';
export type RealtimeChannel =
  | 'user_canvas'
  | 'shared_list'
  | 'shared_note'
  | 'shared_whiteboard';
export type RealtimeEventName =
  | 'userListUpdated'
  | 'userListDeleted'
  | 'listUpdated'
  | 'noteUpdated'
  | 'whiteboardUpdated';

export interface EnqueueRealtimeEventInput {
  eventKey: string;
  aggregateType: RealtimeAggregateType;
  aggregateId: number;
  channel: RealtimeChannel;
  recipientKey: string;
  eventName: RealtimeEventName;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

export interface RealtimeOutboxRow {
  id: string;
  event_key: string;
  aggregate_type: RealtimeAggregateType;
  aggregate_id: number;
  channel: RealtimeChannel;
  recipient_key: string;
  event_name: RealtimeEventName;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

export interface EnqueueRealtimeEventResult {
  event: RealtimeOutboxRow;
  inserted: boolean;
}
