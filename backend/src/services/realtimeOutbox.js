const REALTIME_EVENT_CONTRACT = Object.freeze({
  user_canvas: new Set(['userListUpdated', 'userListDeleted']),
  shared_list: new Set(['listUpdated']),
  shared_note: new Set(['noteUpdated']),
  shared_whiteboard: new Set(['whiteboardUpdated']),
});
const SHARE_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID_PATTERN = /^[1-9]\d*$/;

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

function validateRealtimeEvent(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('Realtime event is required');
  }
  if (typeof event.eventKey !== 'string' || event.eventKey.length < 1 || event.eventKey.length > 255) {
    throw new Error('Realtime event key must be between 1 and 255 characters');
  }
  if (!['list', 'note', 'whiteboard'].includes(event.aggregateType)) {
    throw new Error('Unsupported realtime aggregate type');
  }
  if (!Number.isSafeInteger(Number(event.aggregateId)) || Number(event.aggregateId) < 1) {
    throw new Error('Realtime aggregate ID must be a positive integer');
  }
  if (!REALTIME_EVENT_CONTRACT[event.channel]?.has(event.eventName)) {
    throw new Error('Unsupported realtime channel/event combination');
  }
  if (typeof event.recipientKey !== 'string' || event.recipientKey.length < 1
    || event.recipientKey.length > 255) {
    throw new Error('Realtime recipient key must be between 1 and 255 characters');
  }
  if (event.channel === 'user_canvas' && !USER_ID_PATTERN.test(event.recipientKey)) {
    throw new Error('Realtime user recipient must be a positive integer');
  }
  if (event.channel !== 'user_canvas' && !SHARE_TOKEN_PATTERN.test(event.recipientKey)) {
    throw new Error('Realtime shared recipient must be a UUID capability');
  }
  if (
    (event.channel === 'shared_note' && event.aggregateType !== 'note')
    || (event.channel === 'shared_whiteboard' && event.aggregateType !== 'whiteboard')
    || (
      !['shared_note', 'shared_whiteboard'].includes(event.channel)
      && event.aggregateType !== 'list'
    )
  ) {
    throw new Error('Realtime channel does not match aggregate type');
  }
  if (typeof event.eventType !== 'string' || event.eventType.length < 1
    || event.eventType.length > 64) {
    throw new Error('Realtime event type must be between 1 and 64 characters');
  }
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    throw new Error('Realtime payload must be an object');
  }
}

function sameEvent(row, event) {
  return row.aggregate_type === event.aggregateType
    && Number(row.aggregate_id) === Number(event.aggregateId)
    && row.channel === event.channel
    && row.recipient_key === event.recipientKey
    && row.event_name === event.eventName
    && row.event_type === event.eventType
    && JSON.stringify(canonicalJson(row.payload)) === JSON.stringify(canonicalJson(event.payload));
}

async function enqueueRealtimeEvent(client, event) {
  validateRealtimeEvent(event);
  const inserted = await client.query(`
    INSERT INTO realtime_event_outbox (
      event_key, aggregate_type, aggregate_id, channel, recipient_key,
      event_name, event_type, payload, occurred_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9, CURRENT_TIMESTAMP))
    ON CONFLICT (event_key) DO NOTHING
    RETURNING *
  `, [
    event.eventKey,
    event.aggregateType,
    Number(event.aggregateId),
    event.channel,
    event.recipientKey,
    event.eventName,
    event.eventType,
    JSON.stringify(event.payload),
    event.occurredAt || null,
  ]);
  if (inserted.rows[0]) return { event: inserted.rows[0], inserted: true };

  const existing = await client.query(
    'SELECT * FROM realtime_event_outbox WHERE event_key = $1',
    [event.eventKey]
  );
  if (!existing.rows[0] || !sameEvent(existing.rows[0], event)) {
    const error = new Error('Realtime event key was reused for a different event');
    error.code = 'REALTIME_EVENT_KEY_CONFLICT';
    throw error;
  }
  return { event: existing.rows[0], inserted: false };
}

module.exports = {
  REALTIME_EVENT_CONTRACT,
  enqueueRealtimeEvent,
  validateRealtimeEvent,
};
