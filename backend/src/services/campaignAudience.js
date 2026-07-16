const {
    CONTACT_STATUSES,
    SegmentValidationError,
    compileSegmentCondition,
} = require('./segmentFilter');

const positiveIds = (value, field, { required = false } = {}) => {
    if (value === undefined || value === null) {
        if (required) throw new SegmentValidationError(`${field} is required`, field);
        return [];
    }
    if (!Array.isArray(value) || (required && value.length === 0) || value.length > 100) {
        throw new SegmentValidationError(`${field} must be an array of at most 100 IDs`, field);
    }
    const ids = [...new Set(value.map(Number))];
    if (ids.length !== value.length || ids.some(id => !Number.isInteger(id) || id < 1)) {
        throw new SegmentValidationError(`${field} must contain unique positive integer IDs`, field);
    }
    return ids;
};

async function validateOwnedTags(client, organizationId, tagIds, field) {
    if (tagIds.length === 0) return;
    const result = await client.query(
        'SELECT COUNT(*)::int AS total FROM tags WHERE organization_id = $1 AND id = ANY($2::int[])',
        [organizationId, tagIds]
    );
    if (Number(result.rows[0].total) !== tagIds.length) {
        throw new SegmentValidationError(`${field} contains tags outside the organization`, field);
    }
}

async function normalizeCampaignAudience(client, organizationId, input = {}, existing = {}) {
    const segmentType = input.segment_type ?? existing.segment_type ?? 'all';
    if (!['all', 'tag', 'status', 'segment'].includes(segmentType)) {
        throw new SegmentValidationError('segment_type is unsupported', 'segment_type');
    }

    const excludedTagIds = positiveIds(
        input.excluded_tag_ids ?? existing.excluded_tag_ids ?? [],
        'excluded_tag_ids'
    );
    await validateOwnedTags(client, organizationId, excludedTagIds, 'excluded_tag_ids');

    const audience = {
        segment_type: segmentType,
        segment_id: null,
        segment_filter: {},
        tag_ids: [],
        excluded_tag_ids: excludedTagIds,
        segment: null,
    };

    if (segmentType === 'tag') {
        audience.tag_ids = positiveIds(input.tag_ids ?? existing.tag_ids, 'tag_ids', { required: true });
        await validateOwnedTags(client, organizationId, audience.tag_ids, 'tag_ids');
    } else if (segmentType === 'status') {
        const filter = input.segment_filter ?? existing.segment_filter;
        if (!filter || typeof filter !== 'object' || !CONTACT_STATUSES.includes(filter.status)) {
            throw new SegmentValidationError('segment_filter.status is invalid', 'segment_filter.status');
        }
        audience.segment_filter = { status: filter.status };
    } else if (segmentType === 'segment') {
        const segmentId = Number(input.segment_id ?? existing.segment_id);
        if (!Number.isInteger(segmentId) || segmentId < 1) {
            throw new SegmentValidationError('segment_id is required for saved-segment targeting', 'segment_id');
        }
        const result = await client.query(
            `SELECT * FROM segments
             WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
            [segmentId, organizationId]
        );
        if (result.rows.length === 0) {
            throw new SegmentValidationError('segment_id is not an active segment in this organization', 'segment_id');
        }
        compileSegmentCondition(result.rows[0]);
        audience.segment_id = segmentId;
        audience.segment = result.rows[0];
    }

    return audience;
}

function compileCampaignAudience(audience, { alias = 'c', startIndex = 1 } = {}) {
    const params = [];
    const conditions = [];
    const add = value => {
        params.push(value);
        return `$${startIndex + params.length - 1}`;
    };

    if (audience.segment_type === 'tag') {
        conditions.push(`EXISTS (
            SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
            WHERE ct.contact_id = ${alias}.id
              AND t.organization_id = ${alias}.organization_id
              AND t.id = ANY(${add(audience.tag_ids)}::int[])
        )`);
    } else if (audience.segment_type === 'status') {
        conditions.push(`${alias}.status = ${add(audience.segment_filter.status)}`);
    } else if (audience.segment_type === 'segment') {
        if (!audience.segment) throw new Error('Saved segment was not loaded');
        const compiled = compileSegmentCondition(audience.segment, {
            alias,
            startIndex: startIndex + params.length,
        });
        conditions.push(compiled.condition);
        params.push(...compiled.params);
    }

    if (audience.excluded_tag_ids.length > 0) {
        conditions.push(`NOT EXISTS (
            SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
            WHERE ct.contact_id = ${alias}.id
              AND t.organization_id = ${alias}.organization_id
              AND t.id = ANY(${add(audience.excluded_tag_ids)}::int[])
        )`);
    }

    return {
        condition: conditions.length ? conditions.map(condition => `(${condition})`).join(' AND ') : 'TRUE',
        params,
    };
}

module.exports = {
    compileCampaignAudience,
    normalizeCampaignAudience,
};
