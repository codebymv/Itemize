/**
 * Text utilities for consistent capitalization across the app
 * Matches Pages capitalization style
 */

export function capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function titleCase(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
        'published': 'Published',
        'draft': 'Draft',
        'archived': 'Archived',
        'scheduled': 'Scheduled',
        'pending': 'Pending Review'
    };
    return statusMap[status] || capitalize(status);
}

export function formatSectionType(type: string): string {
    const typeMap: Record<string, string> = {
        'hero': 'Hero',
        'text': 'Text',
        'image': 'Image',
        'video': 'Video',
        'form': 'Form',
        'cta': 'Call to Action',
        'testimonials': 'Testimonials',
        'pricing': 'Pricing',
        'faq': 'FAQ',
        'features': 'Features',
        'gallery': 'Gallery',
        'countdown': 'Countdown',
        'html': 'Custom HTML',
        'divider': 'Divider',
        'social': 'Social Links',
        'header': 'Header',
        'footer': 'Footer',
        'columns': 'Columns',
        'spacer': 'Spacer',
        'button': 'Button',
        'logo_cloud': 'Logo Cloud',
        'stats': 'Stats',
        'team': 'Team',
        'contact': 'Contact',
        'map': 'Map'
    };
    return typeMap[type] || titleCase(type);
}