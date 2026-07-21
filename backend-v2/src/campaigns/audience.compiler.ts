export class AudienceValidationError extends Error {
  constructor(message: string, readonly field = 'filters') {
    super(message);
    this.name = 'AudienceValidationError';
  }
}

export const CONTACT_STATUSES = ['active', 'inactive', 'archived'] as const;

const FILTER_OPERATORS: Record<string, readonly string[]> = {
  status: ['equals', 'not_equals', 'in'],
  source: ['equals', 'contains', 'is_empty', 'is_not_empty'],
  email: ['contains', 'ends_with', 'is_empty', 'is_not_empty'],
  phone: ['contains', 'is_empty', 'is_not_empty'],
  tags: ['has_any', 'has_all', 'has_none'],
  created_at: ['after', 'before', 'between', 'last_n_days'],
  last_activity: ['last_n_days', 'no_activity_days'],
  email_engagement: ['opened_campaign', 'never_opened', 'clicked_link'],
  email_unsubscribed: ['equals'],
  assigned_to: ['equals', 'is_empty', 'is_not_empty'],
  custom_field: ['equals', 'contains', 'is_empty', 'is_not_empty'],
  deal_stage: ['in_stage', 'has_open_deal', 'won_deal', 'lost_deal'],
  booking: ['has_upcoming', 'completed', 'no_show'],
};

type Filter = { field: string; operator: string; value?: unknown; custom_field_key?: string };
export type SegmentDefinition = {
  segment_type: 'dynamic' | 'static'; filter_type: 'and' | 'or';
  filters: Filter[]; static_contact_ids: number[];
};
export type SegmentRow = {
  segment_type?: unknown; filter_type?: unknown; filters?: unknown; static_contact_ids?: unknown;
};
export type CampaignAudience = {
  segmentType: 'all' | 'tag' | 'status' | 'segment'; segmentId: number | null;
  segmentFilter: Record<string, unknown>; tagIds: number[]; excludedTagIds: number[];
  segment: SegmentRow | null;
};

const fail = (message: string, field: string): never => { throw new AudienceValidationError(message, field); };
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const positiveInteger = (value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): number => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 1 || Number(parsed) > max) {
    fail(`${field} must be an integer between 1 and ${max}`, field);
  }
  return Number(parsed);
};

const boundedString = (value: unknown, field: string, max = 500): string => {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    fail(`${field} must be a non-empty string no longer than ${max} characters`, field);
  }
  return value as string;
};

const integerArray = (value: unknown, field: string, maxItems = 50): number[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    fail(`${field} must contain between 1 and ${maxItems} IDs`, field);
  }
  const items = value as unknown[];
  const normalized = [...new Set(items.map((item: unknown) => positiveInteger(item, field)))];
  if (normalized.length !== items.length) fail(`${field} cannot contain duplicate IDs`, field);
  return normalized;
};

const isoDate = (value: unknown, field: string): string => {
  const normalized = boundedString(value, field, 64);
  if (Number.isNaN(Date.parse(normalized))) fail(`${field} must be a valid date`, field);
  return normalized;
};

const normalizeFilter = (raw: unknown, index: number): Filter => {
  const path = `filters[${index}]`;
  const filter = record(raw);
  if (!filter) throw new AudienceValidationError(`${path} must be an object`, path);
  const field = String(filter.field ?? '');
  const operator = String(filter.operator ?? '');
  if (!Object.prototype.hasOwnProperty.call(FILTER_OPERATORS, field)) fail(`${path}.field is unsupported`, `${path}.field`);
  if (!FILTER_OPERATORS[field].includes(operator)) fail(`${path}.operator is unsupported for ${field}`, `${path}.operator`);
  let value = filter.value;
  let customFieldKey: string | undefined;
  if (field === 'status') {
    if (operator === 'in') {
      if (!Array.isArray(value) || value.length === 0 || value.length > CONTACT_STATUSES.length) {
        fail(`${path}.value must contain valid contact statuses`, `${path}.value`);
      }
      const statusValues = value as unknown[];
      const statuses = [...new Set(statusValues.map(String))];
      if (statuses.length !== statusValues.length || statuses.some((status) => !CONTACT_STATUSES.includes(status as typeof CONTACT_STATUSES[number]))) {
        fail(`${path}.value contains an invalid contact status`, `${path}.value`);
      }
      value = statuses;
    } else if (!CONTACT_STATUSES.includes(value as typeof CONTACT_STATUSES[number])) {
      fail(`${path}.value is not a valid contact status`, `${path}.value`);
    }
  } else if (field === 'tags') {
    value = integerArray(value, `${path}.value`);
  } else if (field === 'created_at') {
    if (operator === 'between') {
      const range = record(value);
      if (!range) throw new AudienceValidationError(`${path}.value must contain start and end dates`, `${path}.value`);
      const start = isoDate(range.start, `${path}.value.start`);
      const end = isoDate(range.end, `${path}.value.end`);
      if (Date.parse(start) > Date.parse(end)) fail(`${path} date range is inverted`, `${path}.value`);
      value = { start, end };
    } else if (operator === 'last_n_days') value = positiveInteger(value, `${path}.value`, 3650);
    else value = isoDate(value, `${path}.value`);
  } else if (field === 'last_activity') {
    value = positiveInteger(value, `${path}.value`, 3650);
  } else if (field === 'email_unsubscribed') {
    if (typeof value !== 'boolean') fail(`${path}.value must be boolean`, `${path}.value`);
  } else if (field === 'assigned_to' && operator === 'equals') {
    value = positiveInteger(value, `${path}.value`);
  } else if (field === 'deal_stage' && operator === 'in_stage') {
    value = boundedString(value, `${path}.value`, 100);
  } else if (field === 'custom_field') {
    customFieldKey = boundedString(filter.custom_field_key, `${path}.custom_field_key`, 100);
    if (!['is_empty', 'is_not_empty'].includes(operator)) value = boundedString(value, `${path}.value`);
  } else if (!['is_empty', 'is_not_empty'].includes(operator) &&
      !['email_engagement', 'booking'].includes(field) && !(field === 'deal_stage' && operator !== 'in_stage')) {
    value = boundedString(value, `${path}.value`);
  }
  return { field, operator, ...(value === undefined ? {} : { value }), ...(customFieldKey ? { custom_field_key: customFieldKey } : {}) };
};

export const normalizeSegmentDefinition = (segment: SegmentRow): SegmentDefinition => {
  const rawSegmentType = segment.segment_type ?? 'dynamic';
  if (rawSegmentType !== 'dynamic' && rawSegmentType !== 'static') fail('segment_type must be dynamic or static', 'segment_type');
  const segmentType = rawSegmentType as 'dynamic' | 'static';
  const rawFilterType = segment.filter_type ?? 'and';
  if (rawFilterType !== 'and' && rawFilterType !== 'or') fail('filter_type must be and or or', 'filter_type');
  const filterType = rawFilterType as 'and' | 'or';
  if (segmentType === 'static') {
    const ids = segment.static_contact_ids ?? [];
    return { segment_type: segmentType, filter_type: filterType, filters: [], static_contact_ids: Array.isArray(ids) && ids.length === 0 ? [] : integerArray(ids, 'static_contact_ids', 5000) };
  }
  const filters = segment.filters;
  if (!Array.isArray(filters) || filters.length === 0 || filters.length > 25) {
    fail('Dynamic segments require between 1 and 25 filters', 'filters');
  }
  return { segment_type: segmentType, filter_type: filterType, filters: (filters as unknown[]).map(normalizeFilter), static_contact_ids: [] };
};

export const compileSegmentCondition = (
  segment: SegmentRow,
  options: { alias?: string; startIndex?: number } = {},
): { condition: string; params: unknown[]; definition: SegmentDefinition } => {
  const alias = options.alias ?? 'c';
  const startIndex = options.startIndex ?? 1;
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Unsafe SQL alias');
  const definition = normalizeSegmentDefinition(segment);
  const params: unknown[] = [];
  const add = (value: unknown) => { params.push(value); return `$${startIndex + params.length - 1}`; };
  if (definition.segment_type === 'static') {
    return { condition: `${alias}.id = ANY(${add(definition.static_contact_ids)}::int[])`, params, definition };
  }
  const conditions = definition.filters.map((filter) => {
    const { field, operator, value } = filter;
    if (field === 'status') {
      if (operator === 'equals') return `${alias}.status = ${add(value)}`;
      if (operator === 'not_equals') return `${alias}.status != ${add(value)}`;
      return `${alias}.status = ANY(${add(value)}::text[])`;
    }
    if (field === 'source') {
      if (operator === 'equals') return `${alias}.source = ${add(value)}`;
      if (operator === 'contains') return `${alias}.source ILIKE ${add(`%${String(value)}%`)}`;
      if (operator === 'is_empty') return `(${alias}.source IS NULL OR ${alias}.source = '')`;
      return `(${alias}.source IS NOT NULL AND ${alias}.source != '')`;
    }
    if (field === 'email' || field === 'phone') {
      if (operator === 'contains') return `${alias}.${field} ILIKE ${add(`%${String(value)}%`)}`;
      if (operator === 'ends_with') return `${alias}.${field} ILIKE ${add(`%${String(value)}`)}`;
      if (operator === 'is_empty') return `(${alias}.${field} IS NULL OR ${alias}.${field} = '')`;
      return `(${alias}.${field} IS NOT NULL AND ${alias}.${field} != '')`;
    }
    if (field === 'tags') {
      const ids = add(value);
      const base = `SELECT ct.contact_id FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ${alias}.id AND t.organization_id = ${alias}.organization_id AND t.id = ANY(${ids}::int[])`;
      if (operator === 'has_any') return `EXISTS (${base})`;
      if (operator === 'has_none') return `NOT EXISTS (${base})`;
      return `${alias}.id IN (${base} GROUP BY ct.contact_id HAVING COUNT(DISTINCT t.id) = cardinality(${ids}::int[]))`;
    }
    if (field === 'created_at') {
      if (operator === 'after') return `${alias}.created_at >= ${add(value)}::timestamptz`;
      if (operator === 'before') return `${alias}.created_at <= ${add(value)}::timestamptz`;
      if (operator === 'between') {
        const range = value as { start: string; end: string };
        return `${alias}.created_at BETWEEN ${add(range.start)}::timestamptz AND ${add(range.end)}::timestamptz`;
      }
      return `${alias}.created_at >= NOW() - (${add(value)}::int * INTERVAL '1 day')`;
    }
    if (field === 'last_activity') {
      const activity = `SELECT 1 FROM contact_activities ca WHERE ca.contact_id = ${alias}.id AND ca.organization_id = ${alias}.organization_id AND ca.created_at >= NOW() - (${add(value)}::int * INTERVAL '1 day')`;
      return operator === 'last_n_days' ? `EXISTS (${activity})` : `NOT EXISTS (${activity})`;
    }
    if (field === 'email_engagement') {
      const engagement = `SELECT 1 FROM campaign_recipients cr WHERE cr.contact_id = ${alias}.id AND cr.organization_id = ${alias}.organization_id`;
      if (operator === 'opened_campaign') return `EXISTS (${engagement} AND cr.status IN ('opened', 'clicked') AND cr.opened_at IS NOT NULL)`;
      if (operator === 'never_opened') return `NOT EXISTS (${engagement} AND cr.status IN ('opened', 'clicked') AND cr.opened_at IS NOT NULL)`;
      return `EXISTS (${engagement} AND cr.status = 'clicked' AND cr.clicked_at IS NOT NULL)`;
    }
    if (field === 'email_unsubscribed') return `COALESCE(${alias}.email_unsubscribed, FALSE) = ${add(value)}::boolean`;
    if (field === 'assigned_to') {
      if (operator === 'equals') return `${alias}.assigned_to = ${add(value)}::int`;
      return operator === 'is_empty' ? `${alias}.assigned_to IS NULL` : `${alias}.assigned_to IS NOT NULL`;
    }
    if (field === 'custom_field') {
      const extracted = `${alias}.custom_fields ->> ${add(filter.custom_field_key)}`;
      if (operator === 'equals') return `${extracted} = ${add(value)}`;
      if (operator === 'contains') return `${extracted} ILIKE ${add(`%${String(value)}%`)}`;
      if (operator === 'is_empty') return `(${extracted} IS NULL OR ${extracted} = '')`;
      return `(${extracted} IS NOT NULL AND ${extracted} != '')`;
    }
    if (field === 'deal_stage') {
      let suffix = '';
      if (operator === 'in_stage') suffix = `AND d.stage_id = ${add(value)}`;
      if (operator === 'has_open_deal' || operator === 'in_stage') suffix += ' AND d.won_at IS NULL AND d.lost_at IS NULL';
      if (operator === 'won_deal') suffix = 'AND d.won_at IS NOT NULL';
      if (operator === 'lost_deal') suffix = 'AND d.lost_at IS NOT NULL';
      return `EXISTS (SELECT 1 FROM deals d WHERE d.contact_id = ${alias}.id AND d.organization_id = ${alias}.organization_id ${suffix})`;
    }
    if (field === 'booking') {
      let suffix = '';
      if (operator === 'has_upcoming') suffix = "AND b.start_time > NOW() AND b.status IN ('confirmed', 'pending')";
      if (operator === 'completed') suffix = "AND b.status = 'completed'";
      if (operator === 'no_show') suffix = "AND b.status = 'no_show'";
      return `EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = ${alias}.id AND b.organization_id = ${alias}.organization_id ${suffix})`;
    }
    throw new Error(`Unhandled segment filter: ${field}`);
  });
  const joiner = definition.filter_type === 'or' ? ' OR ' : ' AND ';
  return { condition: `(${conditions.join(joiner)})`, params, definition };
};

export const compileCampaignAudience = (
  audience: CampaignAudience,
  options: { alias?: string; startIndex?: number } = {},
): { condition: string; params: unknown[] } => {
  const alias = options.alias ?? 'c';
  const startIndex = options.startIndex ?? 1;
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Unsafe SQL alias');
  const params: unknown[] = [];
  const conditions: string[] = [];
  const add = (value: unknown) => { params.push(value); return `$${startIndex + params.length - 1}`; };
  if (audience.segmentType === 'tag') {
    conditions.push(`EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ${alias}.id AND t.organization_id = ${alias}.organization_id AND t.id = ANY(${add(audience.tagIds)}::int[]))`);
  } else if (audience.segmentType === 'status') {
    conditions.push(`${alias}.status = ${add(audience.segmentFilter.status)}`);
  } else if (audience.segmentType === 'segment') {
    if (!audience.segment) throw new AudienceValidationError('Saved segment was not loaded', 'segmentId');
    const compiled = compileSegmentCondition(audience.segment, { alias, startIndex: startIndex + params.length });
    conditions.push(compiled.condition);
    params.push(...compiled.params);
  }
  if (audience.excludedTagIds.length > 0) {
    conditions.push(`NOT EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ${alias}.id AND t.organization_id = ${alias}.organization_id AND t.id = ANY(${add(audience.excludedTagIds)}::int[]))`);
  }
  return { condition: conditions.length ? conditions.map((condition) => `(${condition})`).join(' AND ') : 'TRUE', params };
};
