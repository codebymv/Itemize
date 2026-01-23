import { useLocation, useParams } from 'react-router-dom';
import { useMemo } from 'react';

export interface BreadcrumbItem {
    label: string;
    href?: string;
    isCurrent?: boolean;
}

// Route label mapping
const routeLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    workspace: 'Workspace',
    contacts: 'Contacts',
    pipelines: 'Pipelines',
    calendars: 'Calendars',
    bookings: 'Bookings',
    forms: 'Forms',
    inbox: 'Inbox',
    automations: 'Automations',
    settings: 'Settings',
    status: 'Status',
    help: 'Help',
    new: 'New',
};

export function useBreadcrumbs(): BreadcrumbItem[] {
    const location = useLocation();
    const params = useParams();

    return useMemo(() => {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        
        if (pathSegments.length === 0) {
            return [];
        }

        const breadcrumbs: BreadcrumbItem[] = [];
        let currentPath = '';

        pathSegments.forEach((segment, index) => {
            currentPath += `/${segment}`;
            const isLast = index === pathSegments.length - 1;
            
            // Check if this segment is a dynamic parameter (like :id)
            const isDynamicSegment = /^[0-9]+$/.test(segment) || 
                Object.values(params).includes(segment);

            let label: string;
            
            if (isDynamicSegment) {
                // For dynamic segments, use a more descriptive label
                const parentSegment = pathSegments[index - 1];
                if (parentSegment === 'contacts') {
                    label = 'Contact Details';
                } else if (parentSegment === 'automations') {
                    label = 'Workflow';
                } else {
                    label = 'Details';
                }
            } else {
                label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
            }

            breadcrumbs.push({
                label,
                href: isLast ? undefined : currentPath,
                isCurrent: isLast,
            });
        });

        return breadcrumbs;
    }, [location.pathname, params]);
}

export default useBreadcrumbs;
