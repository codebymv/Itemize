/**
 * Page Versions API Service
 * Handles staging, versioning, and rollback
 */

import api from '@/lib/api';

const unwrapResponse = <T>(payload: any): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }
    return payload as T;
};

// ======================
// Types
// ======================

export interface PageVersion {
    id: number;
    page_id: number;
    version_number: number;
    content: PageContent;
    description: string;
    created_by: number;
    created_by_name?: string;
    created_at: string;
    published_at?: string;
}

export interface PageContent {
    name: string;
    description?: string;
    slug: string;
    theme?: any;
    settings?: any;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string;
    og_image?: string;
    favicon_url?: string;
    custom_css?: string;
    custom_js?: string;
    custom_head?: string;
    sections?: any[];
}

// ======================
// API Functions
// ======================

export const getPageVersions = async (
    pageId: number,
    organizationId?: number
): Promise<{ versions: PageVersion[]; currentVersionId: number | null }> => {
    const response = await api.get(`/api/pages/${pageId}/versions`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<{ versions: PageVersion[]; currentVersionId: number | null }>(response.data);
};

export const createPageVersion = async (
    pageId: number,
    description?: string,
    organizationId?: number
): Promise<PageVersion> => {
    const response = await api.post(
        `/api/pages/${pageId}/versions`,
        { description },
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return unwrapResponse<PageVersion>(response.data);
};

export const getPageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<PageVersion> => {
    const response = await api.get(
        `/api/pages/${pageId}/versions/${versionId}`,
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return unwrapResponse<PageVersion>(response.data);
};

export const publishPageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<PageVersion> => {
    const response = await api.post(
        `/api/pages/${pageId}/versions/${versionId}/publish`,
        {},
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return unwrapResponse<PageVersion>(response.data);
};

export const deletePageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(
        `/api/pages/${pageId}/versions/${versionId}`,
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return unwrapResponse<{ success: boolean }>(response.data);
};

export const restorePageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<PageVersion> => {
    const response = await api.post(
        `/api/pages/${pageId}/versions/${versionId}/restore`,
        {},
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return unwrapResponse<PageVersion>(response.data);
};

export default {
    getPageVersions,
    createPageVersion,
    getPageVersion,
    publishPageVersion,
    deletePageVersion,
    restorePageVersion,
};