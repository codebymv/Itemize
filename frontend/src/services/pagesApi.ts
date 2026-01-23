/**
 * Landing Pages API Service
 * Handles page CRUD, section management, and public page access
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface PageTheme {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    headingFont: string;
    borderRadius: number;
    spacing: 'compact' | 'normal' | 'spacious';
}

export interface PageSettings {
    showNavbar: boolean;
    showFooter: boolean;
    enableAnalytics: boolean;
    password?: string | null;
    expiresAt?: string | null;
}

export interface PageSectionSettings {
    visible: boolean;
    animation: 'none' | 'fade' | 'slide' | 'zoom';
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    backgroundColor?: string | null;
    backgroundImage?: string | null;
    backgroundOverlay?: string | null;
    maxWidth: string;
    fullWidth: boolean;
}

export type SectionType = 
    | 'hero' | 'text' | 'image' | 'video' | 'form' | 'cta'
    | 'testimonials' | 'pricing' | 'faq' | 'features'
    | 'gallery' | 'countdown' | 'html' | 'divider' | 'social'
    | 'header' | 'footer' | 'columns' | 'spacer' | 'button'
    | 'logo_cloud' | 'stats' | 'team' | 'contact' | 'map';

export interface PageSection {
    id?: number;
    page_id?: number;
    organization_id?: number;
    section_type: SectionType;
    name?: string;
    content: Record<string, any>;
    settings: Partial<PageSectionSettings>;
    section_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface Page {
    id: number;
    organization_id: number;
    name: string;
    description?: string;
    slug: string;
    status: 'draft' | 'published' | 'archived';
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string;
    og_image?: string;
    favicon_url?: string;
    theme: PageTheme;
    custom_css?: string;
    custom_js?: string;
    custom_head?: string;
    settings: PageSettings;
    view_count: number;
    unique_visitors: number;
    published_at?: string;
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
    section_count?: number;
    sections?: PageSection[];
}

export interface PageAnalytics {
    period: number;
    overall: {
        total_views: number;
        unique_visitors: number;
        avg_time_on_page: number;
        avg_scroll_depth: number;
        conversions: number;
    };
    views_over_time: Array<{
        date: string;
        views: number;
        unique_visitors: number;
    }>;
    devices: Array<{
        device_type: string;
        count: number;
    }>;
    referrers: Array<{
        referrer: string;
        count: number;
    }>;
    utm_sources: Array<{
        utm_source: string;
        utm_medium: string;
        utm_campaign: string;
        count: number;
    }>;
}

export interface PublicPage {
    id: number;
    name: string;
    slug: string;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string;
    og_image?: string;
    favicon_url?: string;
    theme: PageTheme;
    custom_css?: string;
    custom_js?: string;
    custom_head?: string;
    organization_name: string;
    sections: PageSection[];
}

// ======================
// Section Content Types
// ======================

export interface HeroContent {
    heading: string;
    subheading?: string;
    cta_text?: string;
    cta_url?: string;
    secondary_cta_text?: string;
    secondary_cta_url?: string;
    background_image?: string;
    overlay_color?: string;
    overlay_opacity?: number;
    alignment?: 'left' | 'center' | 'right';
    height?: 'small' | 'medium' | 'large' | 'full';
}

export interface TextContent {
    heading?: string;
    body: string;
    alignment?: 'left' | 'center' | 'right';
}

export interface ImageContent {
    image_url: string;
    alt_text?: string;
    caption?: string;
    link_url?: string;
    size?: 'small' | 'medium' | 'large' | 'full';
}

export interface VideoContent {
    video_url: string;
    poster?: string;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    controls?: boolean;
}

export interface FormContent {
    form_id: number;
    heading?: string;
    subheading?: string;
}

export interface CTAContent {
    heading: string;
    description?: string;
    button_text: string;
    button_url: string;
    style?: 'primary' | 'secondary' | 'outline';
}

export interface TestimonialItem {
    quote: string;
    author: string;
    role?: string;
    company?: string;
    avatar?: string;
    rating?: number;
}

export interface TestimonialsContent {
    heading?: string;
    subheading?: string;
    items: TestimonialItem[];
    layout?: 'grid' | 'carousel' | 'list';
    columns?: 1 | 2 | 3;
}

export interface PricingPlan {
    name: string;
    price: string;
    period?: string;
    description?: string;
    features: string[];
    cta_text: string;
    cta_url: string;
    highlighted?: boolean;
}

export interface PricingContent {
    heading?: string;
    subheading?: string;
    plans: PricingPlan[];
}

export interface FAQItem {
    question: string;
    answer: string;
}

export interface FAQContent {
    heading?: string;
    subheading?: string;
    items: FAQItem[];
}

export interface FeatureItem {
    icon?: string;
    title: string;
    description: string;
}

export interface FeaturesContent {
    heading?: string;
    subheading?: string;
    items: FeatureItem[];
    columns?: 2 | 3 | 4;
}

export interface GalleryContent {
    heading?: string;
    images: Array<{
        url: string;
        alt?: string;
        caption?: string;
    }>;
    columns?: 2 | 3 | 4;
    lightbox?: boolean;
}

export interface CountdownContent {
    target_date: string;
    heading?: string;
    expired_text?: string;
    show_days?: boolean;
    show_hours?: boolean;
    show_minutes?: boolean;
    show_seconds?: boolean;
}

export interface HTMLContent {
    html_content: string;
    css_content?: string;
}

export interface DividerContent {
    style: 'line' | 'space' | 'dotted' | 'gradient';
    height?: number;
    color?: string;
}

export interface SocialPlatform {
    type: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok' | 'github';
    url: string;
}

export interface SocialContent {
    heading?: string;
    platforms: SocialPlatform[];
    style?: 'icons' | 'buttons' | 'links';
}

// ======================
// Page API Functions
// ======================

export const getPages = async (
    params: {
        status?: Page['status'] | 'all';
        search?: string;
        page?: number;
        limit?: number;
    } = {},
    organizationId?: number
): Promise<{ pages: Page[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get('/api/pages', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const getPage = async (
    pageId: number,
    organizationId?: number
): Promise<Page> => {
    const response = await api.get(`/api/pages/${pageId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const createPage = async (
    page: {
        name: string;
        description?: string;
        slug?: string;
        theme?: Partial<PageTheme>;
        settings?: Partial<PageSettings>;
        seo_title?: string;
        seo_description?: string;
        seo_keywords?: string;
        og_image?: string;
        sections?: Partial<PageSection>[];
    },
    organizationId?: number
): Promise<Page> => {
    const response = await api.post('/api/pages', page, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updatePage = async (
    pageId: number,
    page: Partial<Omit<Page, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'sections'>>,
    organizationId?: number
): Promise<Page> => {
    const response = await api.put(`/api/pages/${pageId}`, page, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deletePage = async (
    pageId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/pages/${pageId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const duplicatePage = async (
    pageId: number,
    organizationId?: number
): Promise<Page> => {
    const response = await api.post(`/api/pages/${pageId}/duplicate`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Section API Functions
// ======================

export const updatePageSections = async (
    pageId: number,
    sections: Partial<PageSection>[],
    organizationId?: number
): Promise<{ sections: PageSection[] }> => {
    const response = await api.put(`/api/pages/${pageId}/sections`, { sections }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const addSection = async (
    pageId: number,
    section: {
        section_type: SectionType;
        name?: string;
        content?: Record<string, any>;
        settings?: Partial<PageSectionSettings>;
        position?: number;
    },
    organizationId?: number
): Promise<PageSection> => {
    const response = await api.post(`/api/pages/${pageId}/sections`, section, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateSection = async (
    pageId: number,
    sectionId: number,
    section: Partial<Pick<PageSection, 'section_type' | 'name' | 'content' | 'settings'>>,
    organizationId?: number
): Promise<PageSection> => {
    const response = await api.put(`/api/pages/${pageId}/sections/${sectionId}`, section, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteSection = async (
    pageId: number,
    sectionId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/pages/${pageId}/sections/${sectionId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const reorderSections = async (
    pageId: number,
    sectionIds: number[],
    organizationId?: number
): Promise<{ sections: PageSection[] }> => {
    const response = await api.post(`/api/pages/${pageId}/sections/reorder`, { section_ids: sectionIds }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Analytics API Functions
// ======================

export const getPageAnalytics = async (
    pageId: number,
    period: number = 30,
    organizationId?: number
): Promise<PageAnalytics> => {
    const response = await api.get(`/api/pages/${pageId}/analytics`, {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Public Page API Functions
// ======================

export const getPublicPage = async (slug: string, password?: string): Promise<PublicPage> => {
    const response = await api.get(`/api/pages/public/page/${slug}`, {
        headers: password ? { 'x-page-password': password } : {}
    });
    return response.data;
};

export const updatePublicPageAnalytics = async (
    slug: string,
    data: {
        visitor_id: string;
        session_id: string;
        time_on_page?: number;
        scroll_depth?: number;
        converted?: boolean;
        conversion_type?: string;
        conversion_value?: number;
    }
): Promise<{ success: boolean }> => {
    const response = await api.post(`/api/pages/public/page/${slug}/analytics`, data);
    return response.data;
};

// ======================
// Section Templates
// ======================

export const SECTION_TEMPLATES: Record<SectionType, { name: string; icon: string; defaultContent: Record<string, any> }> = {
    hero: {
        name: 'Hero',
        icon: 'Layout',
        defaultContent: {
            heading: 'Welcome to Our Website',
            subheading: 'Discover amazing products and services',
            cta_text: 'Get Started',
            cta_url: '#',
            alignment: 'center',
            height: 'large'
        }
    },
    text: {
        name: 'Text Block',
        icon: 'Type',
        defaultContent: {
            heading: 'Section Heading',
            body: '<p>Your content goes here. Edit this text to add your own content.</p>',
            alignment: 'left'
        }
    },
    image: {
        name: 'Image',
        icon: 'Image',
        defaultContent: {
            image_url: '',
            alt_text: 'Image description',
            size: 'medium'
        }
    },
    video: {
        name: 'Video',
        icon: 'Video',
        defaultContent: {
            video_url: '',
            autoplay: false,
            muted: true,
            controls: true
        }
    },
    form: {
        name: 'Form',
        icon: 'FileText',
        defaultContent: {
            form_id: null,
            heading: 'Contact Us'
        }
    },
    cta: {
        name: 'Call to Action',
        icon: 'MousePointer',
        defaultContent: {
            heading: 'Ready to Get Started?',
            description: 'Join thousands of satisfied customers.',
            button_text: 'Sign Up Now',
            button_url: '#',
            style: 'primary'
        }
    },
    testimonials: {
        name: 'Testimonials',
        icon: 'MessageSquare',
        defaultContent: {
            heading: 'What Our Customers Say',
            items: [
                { quote: 'Amazing product!', author: 'John Doe', role: 'CEO', rating: 5 }
            ],
            layout: 'grid',
            columns: 3
        }
    },
    pricing: {
        name: 'Pricing',
        icon: 'DollarSign',
        defaultContent: {
            heading: 'Choose Your Plan',
            plans: [
                { name: 'Basic', price: '$9', period: '/month', features: ['Feature 1', 'Feature 2'], cta_text: 'Get Started', cta_url: '#' }
            ]
        }
    },
    faq: {
        name: 'FAQ',
        icon: 'HelpCircle',
        defaultContent: {
            heading: 'Frequently Asked Questions',
            items: [
                { question: 'What is your product?', answer: 'Our product helps you...' }
            ]
        }
    },
    features: {
        name: 'Features',
        icon: 'Grid',
        defaultContent: {
            heading: 'Our Features',
            items: [
                { icon: 'Star', title: 'Feature 1', description: 'Description here' }
            ],
            columns: 3
        }
    },
    gallery: {
        name: 'Gallery',
        icon: 'Images',
        defaultContent: {
            heading: 'Gallery',
            images: [],
            columns: 3,
            lightbox: true
        }
    },
    countdown: {
        name: 'Countdown',
        icon: 'Clock',
        defaultContent: {
            target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            heading: 'Coming Soon',
            expired_text: 'Event has started!',
            show_days: true,
            show_hours: true,
            show_minutes: true,
            show_seconds: true
        }
    },
    html: {
        name: 'Custom HTML',
        icon: 'Code',
        defaultContent: {
            html_content: '<div>Custom HTML content</div>',
            css_content: ''
        }
    },
    divider: {
        name: 'Divider',
        icon: 'Minus',
        defaultContent: {
            style: 'line',
            height: 1
        }
    },
    social: {
        name: 'Social Links',
        icon: 'Share2',
        defaultContent: {
            heading: 'Follow Us',
            platforms: [],
            style: 'icons'
        }
    },
    header: {
        name: 'Header',
        icon: 'Menu',
        defaultContent: {
            logo_url: '',
            nav_items: []
        }
    },
    footer: {
        name: 'Footer',
        icon: 'AlignJustify',
        defaultContent: {
            copyright: '© 2024 Your Company',
            links: []
        }
    },
    columns: {
        name: 'Columns',
        icon: 'Columns',
        defaultContent: {
            columns: [{ content: '' }, { content: '' }]
        }
    },
    spacer: {
        name: 'Spacer',
        icon: 'MoreHorizontal',
        defaultContent: {
            height: 50
        }
    },
    button: {
        name: 'Button',
        icon: 'Square',
        defaultContent: {
            text: 'Click Me',
            url: '#',
            style: 'primary',
            size: 'medium',
            alignment: 'center'
        }
    },
    logo_cloud: {
        name: 'Logo Cloud',
        icon: 'Award',
        defaultContent: {
            heading: 'Trusted By',
            logos: []
        }
    },
    stats: {
        name: 'Stats',
        icon: 'BarChart',
        defaultContent: {
            heading: 'Our Numbers',
            items: [
                { value: '100+', label: 'Customers' }
            ]
        }
    },
    team: {
        name: 'Team',
        icon: 'Users',
        defaultContent: {
            heading: 'Meet Our Team',
            members: []
        }
    },
    contact: {
        name: 'Contact',
        icon: 'Mail',
        defaultContent: {
            heading: 'Get In Touch',
            email: '',
            phone: '',
            address: ''
        }
    },
    map: {
        name: 'Map',
        icon: 'MapPin',
        defaultContent: {
            address: '',
            embed_url: '',
            height: 400
        }
    }
};

export default {
    // Pages
    getPages,
    getPage,
    createPage,
    updatePage,
    deletePage,
    duplicatePage,
    // Sections
    updatePageSections,
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
    // Analytics
    getPageAnalytics,
    // Public
    getPublicPage,
    updatePublicPageAnalytics,
    // Templates
    SECTION_TEMPLATES
};
