/**
 * Segments API Service
 * Handles segment CRUD and dynamic filtering
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface SegmentFilter {
    field: string;
    operator: string;
    value: any;
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
 * Get all segments
 */
export const getSegments = async (
    params: { is_active?: boolean; search?: string } = {},
    organizationId?: number
): Promise<Segment[]> => {
    const response = await api.get('/api/segments', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get single segment
 */
export const getSegment = async (
    segmentId: number,
    organizationId?: number
): Promise<Segment> => {
    const response = await api.get(`/api/segments/${segmentId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Create segment
 */
export const createSegment = async (
    segment: Partial<Segment>,
    organizationId?: number
): Promise<Segment> => {
    const response = await api.post('/api/segments', segment, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Update segment
 */
export const updateSegment = async (
    segmentId: number,
    segment: Partial<Segment>,
    organizationId?: number
): Promise<Segment> => {
    const response = await api.put(`/api/segments/${segmentId}`, segment, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Delete segment
 */
export const deleteSegment = async (
    segmentId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/segments/${segmentId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Recalculate segment count
 */
export const calculateSegment = async (
    segmentId: number,
    organizationId?: number
): Promise<Segment> => {
    const response = await api.post(`/api/segments/${segmentId}/calculate`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get contacts in segment
 */
export const getSegmentContacts = async (
    segmentId: number,
    params: { page?: number; limit?: number } = {},
    organizationId?: number
): Promise<{ contacts: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get(`/api/segments/${segmentId}/contacts`, {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Preview segment filter results
 */
export const previewSegment = async (
    filters: SegmentFilter[],
    filterType: 'and' | 'or' = 'and',
    organizationId?: number
): Promise<SegmentPreview> => {
    const response = await api.post('/api/segments/preview', {
        filters,
        filter_type: filterType
    }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get available filter options
 */
export const getFilterOptions = async (organizationId?: number): Promise<FilterOptions> => {
    const response = await api.get('/api/segments/filter-options', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
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
