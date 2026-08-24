import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Calendar as CalendarIcon, Settings, Link2, MoreHorizontal, Trash2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Calendar } from '@/types';
import { getCalendars, updateCalendar, deleteCalendar } from '@/services/calendarsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { CreateCalendarModal } from './components/CreateCalendarModal';
import { CalendarIntegrations } from './components/CalendarIntegrations';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const responseData = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
    return responseData?.error || responseData?.message || fallback;
};

export function CalendarsPage() {
    const navigate = useNavigate();
    const { toast } = useToast();
    // Onboarding
    const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('calendars');

    // State
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [loading, setLoading] = useState(true);
    const { organizationId, error: initError } = useOrganization({
        onError: () => 'Failed to initialize organization.'
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        if (!organizationId && initError) {
            setLoading(false);
        }
    }, [organizationId, initError]);

    // Fetch calendars
    const fetchCalendars = useCallback(async () => {
        if (!organizationId) return;

        setLoading(true);
        try {
            const response = await getCalendars(organizationId);
            setCalendars(response.calendars);
        } catch (error) {
            console.error('Error fetching calendars:', error);
            toast({
                title: 'Error',
                description: 'Failed to load calendars',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchCalendars();
    }, [fetchCalendars]);

    // Filter calendars by search
    const filteredCalendars = calendars.filter((cal) =>
        cal.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Toggle calendar active status
    const handleToggleActive = async (calendar: Calendar) => {
        if (!organizationId) return;

        try {
            await updateCalendar(calendar.id, { is_active: !calendar.is_active }, organizationId);
            setCalendars((prev) =>
                prev.map((c) =>
                    c.id === calendar.id ? { ...c, is_active: !c.is_active } : c
                )
            );
            toast({
                title: calendar.is_active ? 'Calendar Disabled' : 'Calendar Enabled',
                description: `${calendar.name} is now ${calendar.is_active ? 'inactive' : 'active'}`,
            });
        } catch (error) {
            console.error('Error toggling calendar:', error);
            toast({
                title: 'Error',
                description: 'Failed to update calendar',
                variant: 'destructive',
            });
        }
    };

    // Delete calendar
    const handleDeleteCalendar = async (id: number) => {
        if (!organizationId) return;

        try {
            await deleteCalendar(id, organizationId);
            setCalendars((prev) => prev.filter((c) => c.id !== id));
            toast({
                title: 'Deleted',
                description: 'Calendar deleted successfully',
            });
        } catch (error) {
            console.error('Error deleting calendar:', error);
            toast({
                title: 'Error',
                description: getApiErrorMessage(error, 'Failed to delete calendar'),
                variant: 'destructive',
            });
        }
    };

    // Copy booking link
    const copyBookingLink = (slug: string) => {
        const url = `${window.location.origin}/book/${slug}`;
        navigator.clipboard.writeText(url);
        toast({
            title: 'Link Copied',
            description: 'Booking link copied to clipboard',
        });
    };

    // Calendar created callback
    const handleCalendarCreated = (calendar: Calendar) => {
        setShowCreateModal(false);
        setCalendars((prev) => [calendar, ...prev]);
        toast({
            title: 'Created',
            description: 'Calendar created successfully',
        });
    };

    // Error state
    if (initError) {
        return (
            <PageLayout
                title="CALENDARS"
                icon={<CalendarIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            >
                <ErrorState
                    title="Calendars Not Ready"
                    description={initError}
                    icon={CalendarIcon}
                    onAction={() => void fetchCalendars()}
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="CALENDARS"
            icon={<CalendarIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />}
            headerActions={
                <>
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search calendars..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
                            style={{ fontFamily: '"Raleway", sans-serif' }}
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New Calendar
                    </Button>
                </>
            }
            mobileActions={
                <>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search calendars..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 w-full"
                        />
                    </div>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </>
            }
        >
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={closeOnboarding}
                onComplete={completeOnboarding}
                onDismiss={dismissOnboarding}
                content={ONBOARDING_CONTENT.calendars}
            />

                {/* Calendar Integrations */}
                {organizationId && <CalendarIntegrations organizationId={organizationId} />}

                {/* Calendars content */}
                    {loading ? (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-48 w-full" />
                            ))}
                        </div>
                    ) : filteredCalendars.length === 0 ? (
                        <EmptyState
                            icon={CalendarIcon}
                            title="No calendars yet"
                            description="Create a calendar to start accepting appointments"
                            actionLabel="New Calendar"
                            onAction={() => setShowCreateModal(true)}
                            className="p-12"
                        />
                    ) : (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredCalendars.map((calendar) => (
                                <Card
                                    key={calendar.id}
                                    className="overflow-hidden hover:shadow-md transition-shadow"
                                >
                                    <div
                                        className="h-2"
                                        style={{ backgroundColor: calendar.color || '#3B82F6' }}
                                    />
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <CardTitle className="text-lg truncate">{calendar.name}</CardTitle>
                                                {calendar.description && (
                                                    <CardDescription className="line-clamp-2 mt-1">
                                                        {calendar.description}
                                                    </CardDescription>
                                                )}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => navigate(`/calendars/${calendar.id}`)}>
                                                        <Settings className="h-4 w-4 mr-2" />
                                                        Settings
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => copyBookingLink(calendar.public_id)}>
                                                        <Copy className="h-4 w-4 mr-2" />
                                                        Copy Link
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => window.open(`/book/${calendar.public_id}`, '_blank')}
                                                    >
                                                        <ExternalLink className="h-4 w-4 mr-2" />
                                                        Preview
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => handleDeleteCalendar(calendar.id)}
                                                        className="text-destructive focus:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <Badge variant="outline" className="text-xs">
                                                {calendar.duration_minutes} min
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {calendar.timezone}
                                            </Badge>
                                            {calendar.upcoming_bookings ? (
                                                <Badge variant="secondary" className="text-xs">
                                                    {calendar.upcoming_bookings} upcoming
                                                </Badge>
                                            ) : null}
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t">
                                            <div className="flex items-center gap-2">
                                                <Link2 className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                                                    /book/{calendar.public_id}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    {calendar.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                                <Switch
                                                    checked={calendar.is_active}
                                                    onCheckedChange={() => handleToggleActive(calendar)}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

            {showCreateModal && organizationId && (
                <CreateCalendarModal
                    organizationId={organizationId}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleCalendarCreated}
                />
            )}
        </PageLayout>
    );
}

export default CalendarsPage;
