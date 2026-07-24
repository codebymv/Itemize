/**
 * Page Versions API Service
 * Handles staging, versioning, and rollback
 */

import type { PageSection, PageSettings, PageTheme } from './pagesApi';
import {
    createLandingPageVersionViaGraphql,
    deleteLandingPageVersionViaGraphql,
    getLandingPageVersionViaGraphql,
    getLandingPageVersionsViaGraphql,
    publishLandingPageVersionViaGraphql,
    restoreLandingPageVersionViaGraphql,
} from './landingPageVersionsGraphql';

// ======================
// Types
// ======================

export interface PageVersion {
    id: number;
    page_id: number;
    version_number: number;
    content: PageContent;
    description: string;
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    published_at?: string;
}

export interface PageContent {
    name: string;
    description?: string;
    slug: string;
    theme?: Partial<PageTheme>;
    settings?: Partial<PageSettings>;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string;
    og_image?: string;
    favicon_url?: string;
    custom_css?: string;
    custom_js?: string;
    custom_head?: string;
    sections?: PageSection[];
}

// ======================
// API Functions
// ======================

export const getPageVersions = async (
    pageId: number,
    organizationId?: number
): Promise<{ versions: PageVersion[]; currentVersionId: number | null }> => {
    return getLandingPageVersionsViaGraphql(pageId, organizationId);
};

export const createPageVersion = async (
    pageId: number,
    description?: string,
    organizationId?: number
): Promise<PageVersion> => {
    return createLandingPageVersionViaGraphql(pageId, description, organizationId);
};

export const getPageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<PageVersion> => {
    return getLandingPageVersionViaGraphql(pageId, versionId, organizationId);
};

export const publishPageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<PageVersion> => {
    return publishLandingPageVersionViaGraphql(pageId, versionId, organizationId);
};

export const deletePageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteLandingPageVersionViaGraphql(pageId, versionId, organizationId);
};

export const restorePageVersion = async (
    pageId: number,
    versionId: number,
    organizationId?: number
): Promise<PageVersion> => {
    return restoreLandingPageVersionViaGraphql(pageId, versionId, organizationId);
};

export default {
    getPageVersions,
    createPageVersion,
    getPageVersion,
    publishPageVersion,
    deletePageVersion,
    restorePageVersion,
};
