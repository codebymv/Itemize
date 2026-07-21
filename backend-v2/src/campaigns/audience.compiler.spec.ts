import {
  AudienceValidationError,
  CampaignAudience,
  compileCampaignAudience,
  compileSegmentCondition,
} from './audience.compiler';

describe('audience compiler', () => {
  it.each([
    ['status', 'equals', 'active'],
    ['source', 'contains', 'import'],
    ['email', 'ends_with', '@itemize.test'],
    ['phone', 'is_not_empty', undefined],
    ['tags', 'has_all', [2, 3]],
    ['created_at', 'between', { start: '2026-01-01', end: '2026-02-01' }],
    ['last_activity', 'no_activity_days', 30],
    ['email_engagement', 'opened_campaign', undefined],
    ['email_unsubscribed', 'equals', false],
    ['assigned_to', 'equals', 7],
    ['deal_stage', 'has_open_deal', undefined],
    ['booking', 'has_upcoming', undefined],
  ])('compiles the %s filter family with bound values', (field, operator, value) => {
    const compiled = compileSegmentCondition({
      segment_type: 'dynamic', filter_type: 'and',
      filters: [{ field, operator, ...(value === undefined ? {} : { value }) }],
    }, { alias: 'contact', startIndex: 4 });
    expect(compiled.condition).toContain('contact.');
    expect(compiled.condition).not.toContain(String(value));
    if (value !== undefined) expect(compiled.params.length).toBeGreaterThan(0);
  });

  it('binds hostile custom-field keys and values instead of interpolating them', () => {
    const key = "tier') OR TRUE --";
    const compiled = compileSegmentCondition({
      filters: [{ field: 'custom_field', operator: 'equals', custom_field_key: key, value: 'gold' }],
    }, { startIndex: 3 });
    expect(compiled.condition).toContain('c.custom_fields ->> $3 = $4');
    expect(compiled.condition).not.toContain(key);
    expect(compiled.params).toEqual([key, 'gold']);
  });

  it('supports static membership, OR definitions, and parameter offsets', () => {
    expect(compileSegmentCondition({ segment_type: 'static', static_contact_ids: [9, 10] }, {
      alias: 'c', startIndex: 6,
    })).toMatchObject({ condition: 'c.id = ANY($6::int[])', params: [[9, 10]] });
    const dynamic = compileSegmentCondition({
      filter_type: 'or', filters: [
        { field: 'status', operator: 'equals', value: 'active' },
        { field: 'status', operator: 'equals', value: 'inactive' },
      ],
    });
    expect(dynamic.condition).toContain(' OR ');
  });

  it.each([
    { filters: [] },
    { filters: [{ field: 'unknown', operator: 'equals', value: 'x' }] },
    { filters: [{ field: 'status', operator: 'contains', value: 'active' }] },
    { segment_type: 'static', static_contact_ids: [1, 1] },
  ])('fails closed for malformed saved definitions', (segment) => {
    expect(() => compileSegmentCondition(segment)).toThrow(AudienceValidationError);
  });

  it('combines campaign inclusion and exclusion with tenant-correlated subqueries', () => {
    const audience: CampaignAudience = {
      segmentType: 'tag', segmentId: null, segmentFilter: {}, tagIds: [2],
      excludedTagIds: [3], segment: null,
    };
    const compiled = compileCampaignAudience(audience, { startIndex: 2 });
    expect(compiled.condition).toContain('t.organization_id = c.organization_id');
    expect(compiled.condition).toContain('NOT EXISTS');
    expect(compiled.params).toEqual([[2], [3]]);
  });
});
