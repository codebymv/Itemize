import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { format, parseISO } from 'date-fns';
import { Search, Calendar as CalendarIcon, CalendarCheck, Clock, User, MoreHorizontal, X, Check, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { Booking } from '@/types';
import { getBookings, cancelBooking, BookingsQueryParams } from '@/services/calendarsApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { useOrganization } from '@/hooks/useOrganization';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';

export function BookingsPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    // State
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
    });

    // Set header content
    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2 min-w-0">
                    <CalendarCheck className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SCHEDULING | Bookings
                    </h1>
                </div>
                {/* Desktop-only controls */}
                <div className="hidden md:flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search bookings..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
                            style={{ fontFamily: '"Raleway", sans-serif' }}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px] h-9 bg-muted/20 border-border/50">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="no_show">No Show</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        if (!organizationId && initError) {
            setLoading(false);
        }
    }, [organizationId, initError]);

    // Fetch bookings
    const fetchBookings = useCallback(async () => {
        if (!organizationId) return;

        setLoading(true);
        try {
            const params: BookingsQueryParams = {
                organization_id: organizationId,
                page: pagination.page,
                limit: pagination.limit,
            };
            if (statusFilter && statusFilter !== 'all') {
                params.status = statusFilter as any;
            }
            const response = await getBookings(params);
            setBookings(response.bookings);
            setPagination(response.pagination);
        } catch (error) {
            console.error('Error fetching bookings:', error);
            toast({
                title: 'Error',
                description: 'Failed to load bookings',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter, pagination.page, pagination.limit]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    // Cancel booking
    const handleCancelBooking = async (id: number) => {
        if (!organizationId) return;

        try {
            await cancelBooking(id, 'Cancelled by admin', organizationId);
            toast({ title: 'Cancelled', description: 'Booking cancelled successfully' });
            fetchBookings();
        } catch (error) {
            console.error('Error cancelling booking:', error);
            toast({
                title: 'Error',
                description: 'Failed to cancel booking',
                variant: 'destructive',
            });
        }
    };

    // Status badge color
    const getStatusBadge = (status: string) => {
        const variants: Record<string, string> = {
            confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
            completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            no_show: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
        };
        return variants[status] || 'bg-gray-100 text-gray-800';
    };

    // Filter by search
    const filteredBookings = bookings.filter((b) => {
        const searchLower = searchQuery.toLowerCase();
        return (
            (b.attendee_name?.toLowerCase().includes(searchLower) || false) ||
            (b.attendee_email?.toLowerCase().includes(searchLower) || false) ||
            (b.calendar_name?.toLowerCase().includes(searchLower) || false)
        );
    });

    // Error state
    if (initError) {
        return (
            <PageContainer>
                <PageSurface className="max-w-lg mx-auto mt-12" contentClassName="pt-6 text-center">
                    <p className="text-muted-foreground">{initError}</p>
                    <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                </PageSurface>
            </PageContainer>
        );
    }

    return (
        <>
            {/* Mobile Controls Bar */}
            <MobileControlsBar>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search bookings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 w-full"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[120px] h-9">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="no_show">No Show</SelectItem>
                    </SelectContent>
                </Select>
            </MobileControlsBar>

            <PageContainer>
                <PageSurface>
                {/* Bookings list */}
                <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : filteredBookings.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <CalendarIcon className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No bookings yet</h3>
                            <p className="text-muted-foreground">
                                Bookings will appear here when customers schedule appointments
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredBookings.map((booking) => (
                                <div
                                    key={booking.id}
                                    className="p-4 hover:bg-muted/50 transition-colors flex items-center gap-4"
                                >
                                    {/* Calendar color indicator */}
                                    <div
                                        className="w-1 h-12 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: booking.calendar_color || '#3B82F6' }}
                                    />

                                    {/* Booking info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium truncate">
                                                {booking.attendee_name || 'Unknown'}
                                            </span>
                                            <Badge className={`text-xs ${getStatusBadge(booking.status)}`}>
                                                {booking.status}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {format(parseISO(booking.start_time), 'MMM d, yyyy h:mm a')}
                                            </span>
                                            {booking.calendar_name && (
                                                <span className="flex items-center gap-1">
                                                    <CalendarIcon className="h-3 w-3" />
                                                    {booking.calendar_name}
                                                </span>
                                            )}
                                            {booking.attendee_email && (
                                                <span className="truncate max-w-[200px]">
                                                    {booking.attendee_email}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {booking.status === 'confirmed' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleCancelBooking(booking.id)}>
                                                        <X className="h-4 w-4 mr-2" />
                                                        Cancel
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                            <DropdownMenuItem disabled>
                                                <Check className="h-4 w-4 mr-2" />
                                                Mark Complete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                        Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total} bookings
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page === pagination.totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
                )}
            </PageSurface>
            </PageContainer>
        </>
    );
}

export default BookingsPage;
