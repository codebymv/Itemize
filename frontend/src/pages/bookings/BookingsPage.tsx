import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
    CalendarCheck2,
    CalendarDays,
    CalendarClock,
    ChevronDown,
    ChevronUp,
    Clock3,
    Mail,
    Globe2,
    MoreHorizontal,
    Phone,
    Plus,
    UserRound,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpandedRowActions, ExpandedRowActionLabel } from '@/components/ui/expanded-row';
import { useToast } from '@/hooks/use-toast';
import { toastMessages } from '@/constants/toastMessages';
import { useRouteOnboarding } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import type { Booking, Calendar } from '@/types';
import { getBookings, getCalendars, cancelBooking, type BookingsQueryParams } from '@/services/calendarsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { PageLayout } from '@/components/layout/PageLayout';
import {
    HeaderCombinedQuery,
    HeaderAction,
    HeaderFilters,
    HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { getBookingStatusVisual } from '@/pages/calendars/constants/schedulingVisuals';
import { cn } from '@/lib/utils';
import { BookingEditorDialog } from './BookingEditorDialog';
import { useKeyedSingleFlightAction } from '@/hooks/useSingleFlightAction';

const BOOKING_STATUSES: Array<NonNullable<BookingsQueryParams['status']>> = [
    'pending',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
];

const isBookingStatus = (value: string): value is NonNullable<BookingsQueryParams['status']> =>
    BOOKING_STATUSES.includes(value as NonNullable<BookingsQueryParams['status']>);

const sourceLabel = (source: Booking['source']): string => ({
    booking_page: 'Booking page',
    manual: 'Manual',
    api: 'API',
    import: 'Imported',
})[source];

export function BookingsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const onboarding = useRouteOnboarding();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [expandedBookingId, setExpandedBookingId] = useState<number | null>(null);
    const { isPending: isBookingPending, run: runBookingAction } = useKeyedSingleFlightAction<number>();
    const [bookingEditorOpen, setBookingEditorOpen] = useState(false);
    const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });

    useEffect(() => {
        if (!organizationId && initError) setLoading(false);
    }, [organizationId, initError]);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    const fetchBookings = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError('');
        try {
            const params: BookingsQueryParams = {
                organization_id: organizationId,
                page: pagination.page,
                limit: pagination.limit,
            };
            if (debouncedSearch) params.search = debouncedSearch;
            if (statusFilter !== 'all' && isBookingStatus(statusFilter)) params.status = statusFilter;
            const response = await getBookings(params);
            setBookings(response.bookings);
            setPagination(response.pagination);
        } catch (error) {
            console.error('Error fetching bookings:', error);
            setLoadError(toastMessages.failedToLoad('bookings'));
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter, debouncedSearch, pagination.page, pagination.limit]);

    useEffect(() => {
        void fetchBookings();
    }, [fetchBookings]);

    useEffect(() => {
        if (!organizationId) return;
        getCalendars(organizationId)
            .then(response => setCalendars(response.calendars))
            .catch(error => console.error('Error fetching calendars for booking editor:', error));
    }, [organizationId]);

    const openNewBooking = () => {
        setEditingBooking(null);
        setBookingEditorOpen(true);
    };

    const openReschedule = (booking: Booking) => {
        setEditingBooking(booking);
        setBookingEditorOpen(true);
    };

    const handleCancelBooking = async (id: number) => {
        if (!organizationId) return;
        await runBookingAction(id, async () => {
            try {
                await cancelBooking(id, 'Cancelled by admin', organizationId);
                toast({ title: 'Booking cancelled' });
                await fetchBookings();
            } catch (error) {
                console.error('Error cancelling booking:', error);
                toast({ title: 'Unable to cancel booking', description: toastMessages.failedToCancel('booking'), variant: 'destructive' });
            }
        });
    };

    const changeSearch = (value: string) => {
        setSearchQuery(value);
        setPagination(previous => ({ ...previous, page: 1 }));
    };

    const statusSelect = (compact = false) => (
        <Select
            value={statusFilter}
            onValueChange={value => {
                setStatusFilter(value);
                setPagination(previous => ({ ...previous, page: 1 }));
            }}
        >
            <SelectTrigger aria-label="Booking status" className={cn('h-11', compact ? 'w-full' : 'w-36')}>
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No show</SelectItem>
            </SelectContent>
        </Select>
    );

    if (initError) {
        return (
            <PageLayout title="BOOKINGS" icon={<CalendarCheck2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
                <OrganizationErrorState title="Unable to load bookings" icon={CalendarCheck2} />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="BOOKINGS"
            icon={<CalendarCheck2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            headerTools={{
                search: <HeaderSearch label="Search bookings" placeholder="Search bookings..." value={searchQuery} onChange={changeSearch} width="wide" />,
                filters: (
                    <HeaderFilters label="Filter bookings by status" activeCount={Number(statusFilter !== 'all')} compactChildren={statusSelect(true)} preferExpanded>
                        {statusSelect()}
                    </HeaderFilters>
                ),
                combinedQuery: (
                    <HeaderCombinedQuery
                        label="Search and filter bookings"
                        placeholder="Search bookings..."
                        value={searchQuery}
                        onChange={changeSearch}
                        activeCount={Number(Boolean(searchQuery.trim())) + Number(statusFilter !== 'all')}
                    >
                        {statusSelect(true)}
                    </HeaderCombinedQuery>
                ),
                primaryAction: <HeaderAction label="New booking" icon={<Plus className="h-4 w-4" />} onClick={openNewBooking} disabled={calendars.every(calendar => !calendar.is_active)} />,
            }}
        >
            {onboarding.featureKey && ONBOARDING_CONTENT[onboarding.featureKey] ? (
                <OnboardingModal isOpen={onboarding.showModal} onClose={onboarding.handleClose} onComplete={onboarding.handleComplete} onDismiss={onboarding.handleDismiss} content={ONBOARDING_CONTENT[onboarding.featureKey]} />
            ) : null}

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="space-y-4 p-6">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
                    ) : loadError ? (
                        <ErrorState title="Bookings unavailable" description={loadError} icon={CalendarCheck2} onAction={() => void fetchBookings()} className="p-12" />
                    ) : bookings.length === 0 ? (
                        <EmptyState
                            icon={CalendarCheck2}
                            kind={searchQuery.trim() || statusFilter !== 'all' ? 'results' : 'passive'}
                            title={searchQuery.trim() || statusFilter !== 'all' ? 'No matching bookings' : 'No bookings yet'}
                            description={searchQuery.trim() || statusFilter !== 'all' ? undefined : 'Bookings will appear here when customers schedule appointments.'}
                            actionLabel={searchQuery.trim() || statusFilter !== 'all' ? 'Clear filters' : calendars.some(calendar => calendar.is_active) ? 'New booking' : 'View calendars'}
                            onAction={searchQuery.trim() || statusFilter !== 'all'
                                ? () => { setSearchQuery(''); setStatusFilter('all'); }
                                : calendars.some(calendar => calendar.is_active) ? openNewBooking : () => navigate('/calendars')}
                            className="p-12"
                        />
                    ) : (
                        <div className="divide-y">
                            {bookings.map(booking => {
                                const visual = getBookingStatusVisual(booking.status);
                                const StatusIcon = visual.icon;
                                const isExpanded = expandedBookingId === booking.id;
                                const working = isBookingPending(booking.id);
                                const attendee = booking.attendee_name
                                    || [booking.contact_first_name, booking.contact_last_name].filter(Boolean).join(' ')
                                    || booking.attendee_email
                                    || 'Unknown attendee';
                                return (
                                    <div key={booking.id} aria-busy={working ? 'true' : undefined}>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={isExpanded}
                                            className={cn(
                                                'group flex cursor-pointer items-center gap-3 px-3 py-4 interaction-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4',
                                                isExpanded && 'bg-muted/30',
                                            )}
                                            onClick={() => setExpandedBookingId(isExpanded ? null : booking.id)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    setExpandedBookingId(isExpanded ? null : booking.id);
                                                }
                                            }}
                                        >
                                            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', visual.iconBackgroundClass)}>
                                                <StatusIcon className={cn('h-5 w-5', visual.iconClass)} aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <h3 className="truncate text-sm font-medium md:text-base">{attendee}</h3>
                                                    <Badge className={cn('shrink-0 text-xs', visual.badgeClass)}>{visual.label}</Badge>
                                                </div>
                                                {booking.title ? <p className="mt-1 truncate text-sm text-muted-foreground">{booking.title}</p> : null}
                                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{format(parseISO(booking.start_time), 'MMM d, yyyy · h:mm a')}</span>
                                                    {booking.calendar_name ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{booking.calendar_name}</span> : null}
                                                    {booking.assigned_to_name ? <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{booking.assigned_to_name}</span> : null}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    aria-label={isExpanded ? `Collapse ${attendee}` : `Expand ${attendee}`}
                                                    onClick={event => {
                                                        event.stopPropagation();
                                                        setExpandedBookingId(isExpanded ? null : booking.id);
                                                    }}
                                                >
                                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                </Button>
                                                {(booking.status === 'confirmed' || booking.status === 'pending') ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={event => event.stopPropagation()}>
                                                            <Button variant="ghost" size="icon" className="h-9 w-9" disabled={working} aria-label={`More actions for ${attendee}`}><MoreHorizontal className="h-4 w-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
                                                        <DropdownMenuItem onClick={() => openReschedule(booking)}><CalendarClock className="mr-2 h-4 w-4" />Reschedule</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => void handleCancelBooking(booking.id)} className="text-destructive focus:text-destructive"><X className="mr-2 h-4 w-4" />Cancel booking</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : null}
                                            </div>
                                        </div>

                                        {isExpanded ? (
                                            <div className="border-t bg-muted/30 px-4 py-5 sm:px-6">
                                                {(booking.status === 'confirmed' || booking.status === 'pending') ? (
                                                    <ExpandedRowActions>
                                                        <Button variant="outline" size="sm" onClick={() => openReschedule(booking)}>
                                                            <CalendarClock className="mr-2 h-4 w-4" />
                                                            <ExpandedRowActionLabel full="Reschedule booking" compact="Reschedule" />
                                                        </Button>
                                                        <Button variant="outline" size="sm" disabled={working} className="border-destructive/30 text-destructive interaction-button--destructive-ghost" onClick={() => void handleCancelBooking(booking.id)}>
                                                            <X className="mr-2 h-4 w-4" />
                                                            <ExpandedRowActionLabel full="Cancel booking" compact="Cancel" />
                                                        </Button>
                                                    </ExpandedRowActions>
                                                ) : null}
                                                <div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground">Schedule</p>
                                                        <p className="mt-1">{format(parseISO(booking.start_time), 'EEEE, MMMM d, yyyy')}</p>
                                                        <p className="text-muted-foreground">{format(parseISO(booking.start_time), 'h:mm a')}–{format(parseISO(booking.end_time), 'h:mm a')} · {booking.timezone}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground">Attendee</p>
                                                        <p className="mt-1">{attendee}</p>
                                                        {booking.attendee_email ? <p className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" />{booking.attendee_email}</p> : null}
                                                        {booking.attendee_phone ? <p className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{booking.attendee_phone}</p> : null}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground">Booking information</p>
                                                        <p className="mt-1">{booking.calendar_name || `Calendar ${booking.calendar_id}`}</p>
                                                        <p className="flex items-center gap-1 text-muted-foreground"><Globe2 className="h-3 w-3" />{sourceLabel(booking.source)}</p>
                                                    </div>
                                                    {booking.notes ? <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-muted-foreground">Attendee notes</p><p className="mt-1 whitespace-pre-wrap">{booking.notes}</p></div> : null}
                                                    {booking.internal_notes ? <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-muted-foreground">Internal notes</p><p className="mt-1 whitespace-pre-wrap">{booking.internal_notes}</p></div> : null}
                                                    {booking.cancellation_reason ? <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-muted-foreground">Cancellation reason</p><p className="mt-1">{booking.cancellation_reason}</p></div> : null}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {pagination.totalPages > 1 ? (
                        <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                                Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setPagination(previous => ({ ...previous, page: previous.page - 1 }))} disabled={pagination.page === 1}>Previous</Button>
                                <Button variant="outline" size="sm" onClick={() => setPagination(previous => ({ ...previous, page: previous.page + 1 }))} disabled={pagination.page === pagination.totalPages}>Next</Button>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
            {organizationId ? (
                <BookingEditorDialog
                    open={bookingEditorOpen}
                    onOpenChange={setBookingEditorOpen}
                    organizationId={organizationId}
                    calendars={calendars}
                    booking={editingBooking}
                    onSaved={() => void fetchBookings()}
                />
            ) : null}
        </PageLayout>
    );
}

export default BookingsPage;
