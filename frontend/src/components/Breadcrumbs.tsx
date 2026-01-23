import React from 'react';
import { Link } from 'react-router-dom';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface BreadcrumbsProps {
    className?: string;
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
    const breadcrumbs = useBreadcrumbs();

    // Don't render if only one breadcrumb (root page)
    if (breadcrumbs.length <= 1) {
        return null;
    }

    return (
        <Breadcrumb className={className}>
            <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.href || crumb.label}>
                        <BreadcrumbItem>
                            {crumb.isCurrent ? (
                                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink asChild>
                                    <Link to={crumb.href || '#'}>{crumb.label}</Link>
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>
                        {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                    </React.Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
}

export default Breadcrumbs;
