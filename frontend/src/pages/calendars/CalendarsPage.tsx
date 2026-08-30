import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CalendarCheck2,
    CalendarDays,
    CalendarOff,
    Copy,
    ExternalLink,
    Link2,
    MoreHorizontal,
    Plus,
    Settings2,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import type { Calendar } from '@/types';
import { getCalendars, updateCalendar, deleteCalendar } from '@/services/calendarsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { CreateCalendarModal } from './components/CreateCalendarModal';
import { getCalendarStatusVisual } from './constants/schedulingVisuals';
import { PageLayout } from '@/components/layout/PageLayout';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { HeaderAction, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { StatCard } from '@/components/StatCard';
import { cn } from '@/lib/utils';

export function CalendarsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const onboarding = useOnboardingTrigger('calendars');
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize organization.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [calendarToDelete, setCalendarToDelete] = useState<Calendar | null>(null);

    const fetchCalendars = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError('');
        try {
            const response = await getCalendars(organizationId);
            setCalendars(response.calendars);
        } catch (error) {
            console.error('Error fetching calendars:', error);
            setLoadError('Calendars could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        if (!organizationId && initError) setLoading(false);
    }, [organizationId, initError]);

    useEffect(() => {
        void fetchCalendars();
    }, [fetchCalendars]);

    const filteredCalendars = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return calendars;
        return calendars.filter(calendar => [calendar.name, calendar.description, calendar.timezone]
            .some(value => value?.toLowerCase().includes(query)));
    }, [calendars, searchQuery]);

    const stats = useMemo(() => ({
        total: calendars.length,
        active: calendars.filter(calendar => calendar.is_active).length,
        inactive: calendars.filter(calendar => !calendar.is_active).length,
        upcoming: calendars.reduce((sum, calendar) => sum + (calendar.upcoming_bookings ?? 0), 0),
    }), [calendars]);

    const handleToggleActive = async (calendar: Calendar) => {
        if (!organizationId) return;
        try {
            await updateCalendar(calendar.id, { is_active: !calendar.is_active }, organizationId);
            setCalendars(previous => previous.map(item => item.id === calendar.id
                ? { ...item, is_active: !item.is_active }
                : item));
            toast({ title: calendar.is_active ? 'Calendar paused' : 'Calendar activated', description: calendar.name });
        } catch (error) {
            console.error('Error toggling calendar:', error);
            toast({ title: 'Unable to update calendar', variant: 'destructive' });
        }
    };

    const handleDeleteCalendar = async (): Promise<boolean> => {
        if (!organizationId || !calendarToDelete) return false;
        try {
            await deleteCalendar(calendarToDelete.id, organizationId);
            setCalendars(previous => previous.filter(calendar => calendar.id !== calendarToDelete.id));
            setCalendarToDelete(null);
            return true;
        } catch (error) {
            console.error('Error deleting calendar:', error);
            return false;
        }
    };

    const copyBookingLink = async (publicId: string) => {
        await navigator.clipboard.writeText(`${window.location.origin}/book/${publicId}`);
        toast({ title: 'Booking link copied' });
    };

    const handleCalendarCreated = (calendar: Calendar) => {
        setShowCreateModal(false);
        setCalendars(previous => [calendar, ...previous]);
        toast({ title: 'Calendar created' });
        navigate(`/calendars/${calendar.id}`);
    };

    if (initError) {
        return (
            <PageLayout title="CALENDARS" icon={<CalendarDays className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
                <OrganizationErrorState title="Unable to load calendars" icon={CalendarDays} />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="CALENDARS"
            icon={<CalendarDays className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: <HeaderSearch label="Search calendars" placeholder="Search calendars..." value={searchQuery} onChange={setSearchQuery} width="wide" />,
                primaryAction: <HeaderAction label="New calendar" icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)} />,
            }}
        >
            <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT.calendars} />

            {!loadError && (
                <ResponsiveCardRail label="Calendar summary" desktopColumns="md:grid-cols-2 lg:grid-cols-4" className="responsive-stat-summary">
                    <StatCard title="Total calendars" badgeText="Total" value={stats.total} icon={CalendarDays} description={`${stats.total} configured`} colorTheme="blue" isLoading={loading} />
                    <StatCard title="Active calendars" badgeText="Active" value={stats.active} icon={CalendarCheck2} description="Accepting bookings" colorTheme="blue" isLoading={loading} />
                    <StatCard title="Paused calendars" badgeText="Paused" value={stats.inactive} icon={CalendarOff} description="Not accepting bookings" colorTheme="orange" isLoading={loading} />
                    <StatCard title="Upcoming bookings" badgeText="Upcoming" value={stats.upcoming} icon={CalendarCheck2} description="Across all calendars" colorTheme="green" isLoading={loading} />
                </ResponsiveCardRail>
            )}

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="space-y-4 p-6">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>
                    ) : loadError ? (
                        <ErrorState title="Calendars unavailable" description={loadError} icon={CalendarDays} onAction={() => void fetchCalendars()} className="p-12" />
                    ) : filteredCalendars.length === 0 ? (
                        <EmptyState
                            icon={CalendarDays}
                            kind={searchQuery.trim() ? 'results' : 'collection'}
                            title={searchQuery.trim() ? 'No matching calendars' : 'No calendars yet'}
                            description={searchQuery.trim() ? undefined : 'Create a calendar to start accepting appointments.'}
                            actionLabel={searchQuery.trim() ? 'Clear search' : 'New calendar'}
                            onAction={searchQuery.trim() ? () => setSearchQuery('') : () => setShowCreateModal(true)}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {filteredCalendars.map(calendar => {
                                const visual = getCalendarStatusVisual(calendar.is_active);
                                const StatusIcon = visual.icon;
                                return (
                                    <div
                                        key={calendar.id}
                                        role="link"
                                        tabIndex={0}
                                        aria-label={`Open ${calendar.name}`}
                                        className="group flex cursor-pointer items-center gap-3 px-3 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
                                        onClick={() => navigate(`/calendars/${calendar.id}`)}
                                        onKeyDown={event => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                navigate(`/calendars/${calendar.id}`);
                                            }
                                        }}
                                    >
                                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}>
                                            <StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <h3 className="truncate text-sm font-medium md:text-base">{calendar.name}</h3>
                                                <Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge>
                                            </div>
                                            {calendar.description ? <p className="mt-1 truncate text-sm text-muted-foreground">{calendar.description}</p> : null}
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <span>{calendar.duration_minutes} minutes</span>
                                                <span>{calendar.timezone}</span>
                                                <span>{calendar.upcoming_bookings ?? 0} upcoming</span>
                                                {calendar.assigned_to_name ? <span>{calendar.assigned_to_name}</span> : null}
                                                <span className="inline-flex min-w-0 items-center gap-1"><Link2 className="h-3 w-3 shrink-0" /><span className="truncate">/book/{calendar.public_id}</span></span>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More actions for ${calendar.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
                                                <DropdownMenuItem onClick={() => navigate(`/calendars/${calendar.id}`)}><Settings2 className="mr-2 h-4 w-4" />Edit calendar</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => void copyBookingLink(calendar.public_id)}><Copy className="mr-2 h-4 w-4" />Copy booking link</DropdownMenuItem>
                                                <DropdownMenuItem
                                                    disabled={!calendar.is_active}
                                                    onClick={() => window.open(`/book/${calendar.public_id}`, '_blank', 'noopener,noreferrer')}
                                                >
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    Open booking page
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => void handleToggleActive(calendar)}>
                                                    {calendar.is_active ? <CalendarOff className="mr-2 h-4 w-4" /> : <CalendarCheck2 className="mr-2 h-4 w-4" />}
                                                    {calendar.is_active ? 'Pause calendar' : 'Activate calendar'}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => setCalendarToDelete(calendar)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete calendar</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {showCreateModal && organizationId ? <CreateCalendarModal organizationId={organizationId} onClose={() => setShowCreateModal(false)} onCreated={handleCalendarCreated} /> : null}
            <DeleteDialog open={Boolean(calendarToDelete)} onOpenChange={open => !open && setCalendarToDelete(null)} onConfirm={handleDeleteCalendar} itemType="calendar" itemTitle={calendarToDelete?.name} />
        </PageLayout>
    );
}

export default CalendarsPage;
