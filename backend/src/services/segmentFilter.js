class SegmentValidationError extends Error {
    constructor(message, field = 'filters') {
        super(message);
        this.name = 'SegmentValidationError';
        this.field = field;
    }
}

const FILTER_OPERATORS = Object.freeze({
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
});

const CONTACT_STATUSES = Object.freeze(['active', 'inactive', 'archived']);
const EMPTY_OPERATORS = new Set(['is_empty', 'is_not_empty']);

const fail = (message, field) => {
    throw new SegmentValidationError(message, field);
};

const positiveInteger = (value, field, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
        fail(`${field} must be an integer between 1 and ${max}`, field);
    }
    return parsed;
};

const boundedString = (value, field, max = 500) => {
    if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
        fail(`${field} must be a non-empty string no longer than ${max} characters`, field);
    }
    return value;
};

const integerArray = (value, field, maxItems = 50) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
        fail(`${field} must contain between 1 and ${maxItems} IDs`, field);
    }
    const normalized = [...new Set(value.map(item => positiveInteger(item, field)))];
    if (normalized.length !== value.length) fail(`${field} cannot contain duplicate IDs`, field);
    return normalized;
};

const isoDate = (value, field) => {
    const normalized = boundedString(value, field, 64);
    if (Number.isNaN(Date.parse(normalized))) fail(`${field} must be a valid date`, field);
    return normalized;
};

function normalizeFilter(filter, index) {
    const fieldPath = `filters[${index}]`;
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        fail(`${fieldPath} must be an object`, fieldPath);
    }

    const field = filter.field;
    const operator = filter.operator;
    if (!Object.prototype.hasOwnProperty.call(FILTER_OPERATORS, field)) {
        fail(`${fieldPath}.field is unsupported`, `${fieldPath}.field`);
    }
    if (!FILTER_OPERATORS[field].includes(operator)) {
        fail(`${fieldPath}.operator is unsupported for ${field}`, `${fieldPath}.operator`);
    }

    let value = filter.value;
    let customFieldKey;

    if (field === 'status') {
        if (operator === 'in') {
            if (!Array.isArray(value) || value.length === 0 || value.length > CONTACT_STATUSES.length) {
                fail(`${fieldPath}.value must contain valid contact statuses`, `${fieldPath}.value`);
            }
            value = [...new Set(value)];
            if (value.some(status => !CONTACT_STATUSES.includes(status))) {
                fail(`${fieldPath}.value contains an invalid contact status`, `${fieldPath}.value`);
            }
        } else if (!CONTACT_STATUSES.includes(value)) {
            fail(`${fieldPath}.value is not a valid contact status`, `${fieldPath}.value`);
        }
    } else if (field === 'tags') {
        value = integerArray(value, `${fieldPath}.value`);
    } else if (field === 'created_at') {
        if (operator === 'between') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                fail(`${fieldPath}.value must contain start and end dates`, `${fieldPath}.value`);
            }
            const start = isoDate(value.start, `${fieldPath}.value.start`);
            const end = isoDate(value.end, `${fieldPath}.value.end`);
            if (Date.parse(start) > Date.parse(end)) fail(`${fieldPath} date range is inverted`, `${fieldPath}.value`);
            value = { start, end };
        } else if (operator === 'last_n_days') {
            value = positiveInteger(value, `${fieldPath}.value`, 3650);
        } else {
            value = isoDate(value, `${fieldPath}.value`);
        }
    } else if (field === 'last_activity') {
        value = positiveInteger(value, `${fieldPath}.value`, 3650);
    } else if (field === 'email_unsubscribed') {
        if (typeof value !== 'boolean') fail(`${fieldPath}.value must be boolean`, `${fieldPath}.value`);
    } else if (field === 'assigned_to' && operator === 'equals') {
        value = positiveInteger(value, `${fieldPath}.value`);
    } else if (field === 'deal_stage' && operator === 'in_stage') {
        value = boundedString(value, `${fieldPath}.value`, 100);
    } else if (field === 'custom_field') {
        customFieldKey = boundedString(filter.custom_field_key, `${fieldPath}.custom_field_key`, 100);
        if (!EMPTY_OPERATORS.has(operator)) value = boundedString(value, `${fieldPath}.value`);
    } else if (!EMPTY_OPERATORS.has(operator)
        && !['email_engagement', 'booking'].includes(field)
        && !(field === 'deal_stage' && operator !== 'in_stage')) {
        value = boundedString(value, `${fieldPath}.value`);
    }

    return {
        field,
        operator,
        ...(value !== undefined ? { value } : {}),
        ...(customFieldKey ? { custom_field_key: customFieldKey } : {}),
    };
}

function normalizeSegmentDefinition(input = {}, existing = {}) {
    const segmentType = input.segment_type ?? existing.segment_type ?? 'dynamic';
    if (!['dynamic', 'static'].includes(segmentType)) fail('segment_type must be dynamic or static', 'segment_type');

    const filterType = input.filter_type ?? existing.filter_type ?? 'and';
    if (!['and', 'or'].includes(filterType)) fail('filter_type must be and or or', 'filter_type');

    if (segmentType === 'static') {
        const rawIds = input.static_contact_ids ?? existing.static_contact_ids ?? [];
        const staticContactIds = rawIds.length === 0 ? [] : integerArray(rawIds, 'static_contact_ids', 5000);
        return { segment_type: segmentType, filter_type: filterType, filters: [], static_contact_ids: staticContactIds };
    }

    const rawFilters = input.filters ?? existing.filters;
    if (!Array.isArray(rawFilters) || rawFilters.length === 0 || rawFilters.length > 25) {
        fail('Dynamic segments require between 1 and 25 filters', 'filters');
    }

    return {
        segment_type: segmentType,
        filter_type: filterType,
        filters: rawFilters.map(normalizeFilter),
        static_contact_ids: [],
    };
}

async function validateSegmentReferences(client, organizationId, definition) {
    const ensureOwnedIds = async (query, ids, field) => {
        if (ids.length === 0) return;
        const result = await client.query(query, [organizationId, ids]);
        if (Number(result.rows[0].total) !== ids.length) fail(`${field} contains IDs outside the organization`, field);
    };

    await ensureOwnedIds(
        'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id = $1 AND id = ANY($2::int[])',
        definition.static_contact_ids,
        'static_contact_ids'
    );

    const tagIds = [...new Set(definition.filters.filter(filter => filter.field === 'tags').flatMap(filter => filter.value))];
    await ensureOwnedIds(
        'SELECT COUNT(*)::int AS total FROM tags WHERE organization_id = $1 AND id = ANY($2::int[])',
        tagIds,
        'filters.tags'
    );

    const assignedUserIds = [...new Set(definition.filters
        .filter(filter => filter.field === 'assigned_to' && filter.operator === 'equals')
        .map(filter => filter.value))];
    await ensureOwnedIds(
        'SELECT COUNT(*)::int AS total FROM organization_members WHERE organization_id = $1 AND user_id = ANY($2::int[])',
        assignedUserIds,
        'filters.assigned_to'
    );

    const stageIds = [...new Set(definition.filters
        .filter(filter => filter.field === 'deal_stage' && filter.operator === 'in_stage')
        .map(filter => filter.value))];
    if (stageIds.length > 0) {
        const result = await client.query(
            `SELECT ps.stage_key
             FROM pipeline_stages ps
             JOIN pipelines p ON p.id = ps.pipeline_id
             WHERE p.organization_id = $1`,
            [organizationId]
        );
        const ownedStages = new Set(result.rows.map(row => String(row.stage_key)));
        if (stageIds.some(stageId => !ownedStages.has(String(stageId)))) {
            fail('filters.deal_stage contains a stage outside the organization', 'filters.deal_stage');
        }
    }
}

function compileSegmentCondition(segment, { alias = 'c', startIndex = 1 } = {}) {
    if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Unsafe SQL alias');
    const definition = normalizeSegmentDefinition(segment);
    const params = [];
    const add = value => {
        params.push(value);
        return `$${startIndex + params.length - 1}`;
    };

    if (definition.segment_type === 'static') {
        return { condition: `${alias}.id = ANY(${add(definition.static_contact_ids)}::int[])`, params, definition };
    }

    const conditions = definition.filters.map(filter => {
        const { field, operator, value } = filter;
        if (field === 'status') {
            if (operator === 'equals') return `${alias}.status = ${add(value)}`;
            if (operator === 'not_equals') return `${alias}.status != ${add(value)}`;
            return `${alias}.status = ANY(${add(value)}::text[])`;
        }
        if (field === 'source') {
            if (operator === 'equals') return `${alias}.source = ${add(value)}`;
            if (operator === 'contains') return `${alias}.source ILIKE ${add(`%${value}%`)}`;
            if (operator === 'is_empty') return `(${alias}.source IS NULL OR ${alias}.source = '')`;
            return `(${alias}.source IS NOT NULL AND ${alias}.source != '')`;
        }
        if (field === 'email' || field === 'phone') {
            if (operator === 'contains') return `${alias}.${field} ILIKE ${add(`%${value}%`)}`;
            if (operator === 'ends_with') return `${alias}.${field} ILIKE ${add(`%${value}`)}`;
            if (operator === 'is_empty') return `(${alias}.${field} IS NULL OR ${alias}.${field} = '')`;
            return `(${alias}.${field} IS NOT NULL AND ${alias}.${field} != '')`;
        }
        if (field === 'tags') {
            const tagIds = add(value);
            const base = `SELECT ct.contact_id FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
                WHERE ct.contact_id = ${alias}.id AND t.organization_id = ${alias}.organization_id AND t.id = ANY(${tagIds}::int[])`;
            if (operator === 'has_any') return `EXISTS (${base})`;
            if (operator === 'has_none') return `NOT EXISTS (${base})`;
            return `${alias}.id IN (${base} GROUP BY ct.contact_id HAVING COUNT(DISTINCT t.id) = cardinality(${tagIds}::int[]))`;
        }
        if (field === 'created_at') {
            if (operator === 'after') return `${alias}.created_at >= ${add(value)}::timestamptz`;
            if (operator === 'before') return `${alias}.created_at <= ${add(value)}::timestamptz`;
            if (operator === 'between') return `${alias}.created_at BETWEEN ${add(value.start)}::timestamptz AND ${add(value.end)}::timestamptz`;
            return `${alias}.created_at >= NOW() - (${add(value)}::int * INTERVAL '1 day')`;
        }
        if (field === 'last_activity') {
            const activity = `SELECT 1 FROM contact_activities ca WHERE ca.contact_id = ${alias}.id
                AND ca.created_at >= NOW() - (${add(value)}::int * INTERVAL '1 day')`;
            return operator === 'last_n_days' ? `EXISTS (${activity})` : `NOT EXISTS (${activity})`;
        }
        if (field === 'email_engagement') {
            const opened = `SELECT 1 FROM campaign_recipients cr WHERE cr.contact_id = ${alias}.id
                AND cr.organization_id = ${alias}.organization_id`;
            if (operator === 'opened_campaign') return `EXISTS (${opened} AND cr.status IN ('opened', 'clicked') AND cr.opened_at IS NOT NULL)`;
            if (operator === 'never_opened') return `NOT EXISTS (${opened} AND cr.status IN ('opened', 'clicked') AND cr.opened_at IS NOT NULL)`;
            return `EXISTS (${opened} AND cr.status = 'clicked' AND cr.clicked_at IS NOT NULL)`;
        }
        if (field === 'email_unsubscribed') return `COALESCE(${alias}.email_unsubscribed, FALSE) = ${add(value)}::boolean`;
        if (field === 'assigned_to') {
            if (operator === 'equals') return `${alias}.assigned_to = ${add(value)}::int`;
            return operator === 'is_empty' ? `${alias}.assigned_to IS NULL` : `${alias}.assigned_to IS NOT NULL`;
        }
        if (field === 'custom_field') {
            const extracted = `${alias}.custom_fields ->> ${add(filter.custom_field_key)}`;
            if (operator === 'equals') return `${extracted} = ${add(value)}`;
            if (operator === 'contains') return `${extracted} ILIKE ${add(`%${value}%`)}`;
            if (operator === 'is_empty') return `(${extracted} IS NULL OR ${extracted} = '')`;
            return `(${extracted} IS NOT NULL AND ${extracted} != '')`;
        }
        if (field === 'deal_stage') {
            let suffix = '';
            if (operator === 'in_stage') suffix = `AND d.stage_id = ${add(value)}`;
            if (operator === 'has_open_deal' || operator === 'in_stage') suffix += ' AND d.won_at IS NULL AND d.lost_at IS NULL';
            if (operator === 'won_deal') suffix = 'AND d.won_at IS NOT NULL';
            if (operator === 'lost_deal') suffix = 'AND d.lost_at IS NOT NULL';
            return `EXISTS (SELECT 1 FROM deals d WHERE d.contact_id = ${alias}.id
                AND d.organization_id = ${alias}.organization_id ${suffix})`;
        }
        if (field === 'booking') {
            let suffix = '';
            if (operator === 'has_upcoming') suffix = "AND b.start_time > NOW() AND b.status IN ('confirmed', 'pending')";
            if (operator === 'completed') suffix = "AND b.status = 'completed'";
            if (operator === 'no_show') suffix = "AND b.status = 'no_show'";
            return `EXISTS (SELECT 1 FROM bookings b WHERE b.contact_id = ${alias}.id
                AND b.organization_id = ${alias}.organization_id ${suffix})`;
        }
        throw new Error(`Unhandled segment filter: ${field}`);
    });

    const joiner = definition.filter_type === 'or' ? ' OR ' : ' AND ';
    return { condition: `(${conditions.join(joiner)})`, params, definition };
}

module.exports = {
    CONTACT_STATUSES,
    FILTER_OPERATORS,
    SegmentValidationError,
    compileSegmentCondition,
    normalizeSegmentDefinition,
    validateSegmentReferences,
};
