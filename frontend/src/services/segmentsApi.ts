/**
 * Segments API Service
 * Handles segment CRUD and dynamic filtering
 */
import type { Contact } from '@/types';
import {
    createSegmentViaGraphql,
    deleteSegmentViaGraphql,
    getSegmentContactsViaGraphql,
    getSegmentFilterOptionsViaGraphql,
    getSegmentViaGraphql,
    getSegmentsViaGraphql,
    previewSegmentViaGraphql,
    recalculateSegmentViaGraphql,
    updateSegmentViaGraphql,
    type SegmentListParams,
} from './segmentsGraphql';

// ======================
// Types
// ======================

export interface SegmentFilter {
    field: string;
    operator: string;
    value: string | number | boolean | number[] | null;
    custom_field_key?: string;
}

export interface Segment {
    id: number;
    organization_id: number;
    name: string;
    description?: string;
    color: string;
    icon: string;
    filter_type: 'and' | 'or';
    filters: SegmentFilter[];
    segment_type: 'dynamic' | 'static';
    static_contact_ids: number[];
    contact_count: number;
    last_calculated_at?: string;
    is_active: boolean;
    used_in_campaigns: number;
    used_in_automations: number;
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
    history?: SegmentHistory[];
}

export interface SegmentHistory {
    id: number;
    segment_id: number;
    organization_id: number;
    contact_count: number;
    calculated_at: string;
    contacts_added: number;
    contacts_removed: number;
    created_at: string;
}

export interface SegmentPreview {
    count: number;
    sample: Array<{
        id: number;
        first_name?: string;
        last_name?: string;
        email?: string;
        status?: string;
    }>;
}

export interface FilterField {
    id: string;
    label: string;
    type: 'select' | 'text' | 'tags' | 'date' | 'number' | 'boolean' | 'user' | 'stage' | 'custom';
    operators: string[];
    options?: string[];
}

export interface FilterOptions {
    fields: FilterField[];
    tags: Array<{ id: number; name: string; color: string }>;
    users: Array<{ id: number; name: string }>;
    pipelines: Array<{
        id: number;
        name: string;
        stages: Array<{ id: string; name: string; color: string }>;
    }>;
}

// ======================
// API Functions
// ======================

/**
 * Get one bounded segment page.
 */
export const getSegments = async (
    params: SegmentListParams = {},
    organizationId?: number,
    signal?: AbortSignal,
): Promise<Segment[]> => {
    return signal
        ? getSegmentsViaGraphql(params, organizationId, signal)
        : getSegmentsViaGraphql(params, organizationId);
};

/**
 * Get single segment
 */
export const getSegment = async (
    segmentId: number,
    organizationId?: number
): Promise<Segment> => {
    return getSegmentViaGraphql(segmentId, organizationId);
};

/**
 * Create segment
 */
export const createSegment = async (
    segment: Partial<Segment>,
    organizationId: number,
    idempotencyKey: string
): Promise<Segment> => {
    return createSegmentViaGraphql(segment, organizationId, idempotencyKey);
};

/**
 * Update segment
 */
export const updateSegment = async (
    segmentId: number,
    segment: Partial<Segment>,
    organizationId?: number
): Promise<Segment> => {
    return updateSegmentViaGraphql(segmentId, segment, organizationId);
};

/**
 * Delete segment
 */
export const deleteSegment = async (
    segmentId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteSegmentViaGraphql(segmentId, organizationId);
};

/**
 * Recalculate segment count
 */
export const calculateSegment = async (
    segmentId: number,
    organizationId?: number
): Promise<Segment> => {
    return recalculateSegmentViaGraphql(segmentId, organizationId);
};

/**
 * Get contacts in segment
 */
export const getSegmentContacts = async (
    segmentId: number,
    params: { page?: number; limit?: number } = {},
    organizationId?: number
): Promise<{ contacts: Contact[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    return getSegmentContactsViaGraphql(segmentId, params, organizationId);
};

/**
 * Preview segment filter results
 */
export const previewSegment = async (
    filters: SegmentFilter[],
    filterType: 'and' | 'or' = 'and',
    organizationId?: number
): Promise<SegmentPreview> => {
    return previewSegmentViaGraphql(filters, filterType, organizationId);
};

/**
 * Get available filter options
 */
export const getFilterOptions = async (organizationId?: number): Promise<FilterOptions> => {
    return getSegmentFilterOptionsViaGraphql(organizationId);
};

export default {
    getSegments,
    getSegment,
    createSegment,
    updateSegment,
    deleteSegment,
    calculateSegment,
    getSegmentContacts,
    previewSegment,
    getFilterOptions
};
