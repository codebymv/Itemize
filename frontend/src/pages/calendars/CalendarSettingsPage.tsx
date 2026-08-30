import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarDays,
    CalendarClock,
    CalendarOff,
    Link2,
    Loader2,
    Plus,
    Save,
    SlidersHorizontal,
    Trash2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageLayout } from '@/components/layout/PageLayout';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { AvailabilitySettingRow } from '@/components/settings/SettingsPrimitives';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
    getCalendar,
    addDateOverride,
    removeDateOverride,
    updateCalendar,
    updateCalendarAvailability,
} from '@/services/calendarsApi';
import type { AvailabilityWindow, Calendar, CalendarDateOverride } from '@/types';
import { getCalendarStatusVisual } from './constants/schedulingVisuals';
import { CalendarBookingPreview } from './CalendarBookingPreview';
import { cn } from '@/lib/utils';

const DAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const;

const TIMEZONES = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Australia/Sydney',
];

type SettingsDraft = {
    name: string;
    description: string;
    timezone: string;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeHours: number;
    maxFutureDays: number;
    color: string;
    isActive: boolean;
};

const makeDraft = (calendar: Calendar): SettingsDraft => ({
    name: calendar.name,
    description: calendar.description ?? '',
    timezone: calendar.timezone,
    durationMinutes: calendar.duration_minutes,
    bufferBeforeMinutes: calendar.buffer_before_minutes,
    bufferAfterMinutes: calendar.buffer_after_minutes,
    minNoticeHours: calendar.min_notice_hours,
    maxFutureDays: calendar.max_future_days,
    color: calendar.color,
    isActive: calendar.is_active,
});

const sortWindows = (windows: AvailabilityWindow[]): AvailabilityWindow[] =>
    [...windows].sort((left, right) =>
        left.day_of_week - right.day_of_week
        || left.start_time.localeCompare(right.start_time),
    );

const comparableWindows = (windows: AvailabilityWindow[]) => sortWindows(windows).map(window => ({
    dayOfWeek: window.day_of_week,
    startTime: window.start_time.slice(0, 5),
    endTime: window.end_time.slice(0, 5),
    isActive: window.is_active !== false,
}));

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const data = (error as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data;
    return data?.error || data?.message || fallback;
};

export function CalendarSettingsPage() {
    const { id } = useParams<{ id: string }>();
    const calendarId = Number(id);
    const navigate = useNavigate();
    const { toast } = useToast();
    const {
        organizationId,
        organization,
        isLoading: organizationLoading,
        error: organizationError,
    } = useOrganization({ onError: () => 'Failed to initialize organization.' });

    const [calendar, setCalendar] = useState<Calendar | null>(null);
    const [draft, setDraft] = useState<SettingsDraft | null>(null);
    const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [savingAvailability, setSavingAvailability] = useState(false);
    const [savingOverride, setSavingOverride] = useState(false);
    const [overrideDraft, setOverrideDraft] = useState({
        date: '',
        isAvailable: false,
        startTime: '09:00',
        endTime: '17:00',
        reason: '',
    });

    const settingsDirty = useMemo(() => Boolean(
        calendar && draft && JSON.stringify(draft) !== JSON.stringify(makeDraft(calendar)),
    ), [calendar, draft]);
    const availabilityDirty = useMemo(() => Boolean(
        calendar && JSON.stringify(comparableWindows(availability)) !== JSON.stringify(
            comparableWindows(calendar.availability_windows ?? []),
        ),
    ), [availability, calendar]);
    const { confirmLeave } = useUnsavedChangesGuard({
        when: settingsDirty || availabilityDirty || savingSettings || savingAvailability,
        message: 'This calendar has unsaved changes. Leave without saving them?',
    });

    const loadCalendar = useCallback(async () => {
        if (organizationLoading) return;
        if (!Number.isInteger(calendarId) || calendarId < 1) {
            setLoadError('Invalid calendar ID.');
            setLoading(false);
            return;
        }
        if (!organizationId) {
            setLoadError(organizationError || 'No organization selected.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setLoadError(null);
        try {
            const loaded = await getCalendar(calendarId, organizationId);
            setCalendar(loaded);
            setDraft(makeDraft(loaded));
            setAvailability(sortWindows(loaded.availability_windows ?? []));
        } catch (error) {
            setLoadError(apiErrorMessage(error, 'Unable to load this calendar.'));
        } finally {
            setLoading(false);
        }
    }, [calendarId, organizationError, organizationId, organizationLoading]);

    useEffect(() => {
        void loadCalendar();
    }, [loadCalendar]);

    const saveSettings = async () => {
        if (!calendar || !draft || !organizationId) return;
        if (!draft.name.trim()) {
            toast({
                title: 'Calendar name is required',
                variant: 'destructive',
            });
            return;
        }

        setSavingSettings(true);
        try {
            const updated = await updateCalendar(
                calendar.id,
                {
                    name: draft.name.trim(),
                    description: draft.description.trim(),
                    timezone: draft.timezone,
                    duration_minutes: draft.durationMinutes,
                    buffer_before_minutes: draft.bufferBeforeMinutes,
                    buffer_after_minutes: draft.bufferAfterMinutes,
                    min_notice_hours: draft.minNoticeHours,
                    max_future_days: draft.maxFutureDays,
                    assigned_to: calendar.assigned_to,
                    assignment_mode: calendar.assignment_mode,
                    confirmation_email: calendar.confirmation_email,
                    reminder_email: calendar.reminder_email,
                    reminder_hours: calendar.reminder_hours,
                    color: draft.color,
                    is_active: draft.isActive,
                },
                organizationId,
            );
            setCalendar(previous => previous ? { ...previous, ...updated } : updated);
            setDraft(makeDraft({ ...calendar, ...updated }));
            toast({ title: 'Calendar settings saved' });
        } catch (error) {
            toast({
                title: 'Unable to save calendar',
                description: apiErrorMessage(error, 'Try again.'),
                variant: 'destructive',
            });
        } finally {
            setSavingSettings(false);
        }
    };

    const changeWindow = (
        index: number,
        update: Partial<AvailabilityWindow>,
    ) => {
        setAvailability(previous => previous.map((window, windowIndex) =>
            windowIndex === index ? { ...window, ...update } : window,
        ));
    };

    const addWindow = (day: number) => {
        setAvailability(previous => sortWindows([
            ...previous,
            {
                day_of_week: day,
                start_time: '09:00',
                end_time: '17:00',
                is_active: true,
            },
        ]));
    };

    const removeWindow = (index: number) => {
        setAvailability(previous => previous.filter((_, windowIndex) => windowIndex !== index));
    };

    const saveAvailability = async () => {
        if (!calendar || !organizationId) return;
        const invalidWindow = availability.some(window => window.start_time >= window.end_time);
        if (invalidWindow) {
            toast({
                title: 'Check availability times',
                description: 'Each end time must be later than its start time.',
                variant: 'destructive',
            });
            return;
        }

        setSavingAvailability(true);
        try {
            const response = await updateCalendarAvailability(
                calendar.id,
                availability.map(window => ({
                    day_of_week: window.day_of_week,
                    start_time: window.start_time,
                    end_time: window.end_time,
                    is_active: window.is_active !== false,
                })),
                organizationId,
            );
            const updatedWindows = sortWindows(response.availability_windows);
            setAvailability(updatedWindows);
            setCalendar(previous => previous
                ? { ...previous, availability_windows: updatedWindows }
                : previous);
            toast({ title: 'Availability saved' });
        } catch (error) {
            toast({
                title: 'Unable to save availability',
                description: apiErrorMessage(error, 'Try again.'),
                variant: 'destructive',
            });
        } finally {
            setSavingAvailability(false);
        }
    };

    const saveAll = async () => {
        if (settingsDirty) await saveSettings();
        if (availabilityDirty) await saveAvailability();
    };

    const saveOverride = async () => {
        if (!calendar || !organizationId || !overrideDraft.date) return;
        if (overrideDraft.isAvailable && overrideDraft.startTime >= overrideDraft.endTime) {
            toast({ title: 'Check override times', description: 'The end time must be later than the start time.', variant: 'destructive' });
            return;
        }
        setSavingOverride(true);
        try {
            const created = await addDateOverride(calendar.id, {
                override_date: overrideDraft.date,
                is_available: overrideDraft.isAvailable,
                start_time: overrideDraft.isAvailable ? overrideDraft.startTime : undefined,
                end_time: overrideDraft.isAvailable ? overrideDraft.endTime : undefined,
                reason: overrideDraft.reason.trim() || undefined,
            }, organizationId);
            setCalendar(previous => {
                if (!previous) return previous;
                const retained = (previous.date_overrides ?? []).filter(item => item.override_date !== created.override_date);
                return { ...previous, date_overrides: [...retained, created].sort((left, right) => left.override_date.localeCompare(right.override_date)) };
            });
            setOverrideDraft({ date: '', isAvailable: false, startTime: '09:00', endTime: '17:00', reason: '' });
            toast({ title: 'Date override saved' });
        } catch (error) {
            toast({ title: 'Unable to save date override', description: apiErrorMessage(error, 'Try again.'), variant: 'destructive' });
        } finally {
            setSavingOverride(false);
        }
    };

    const deleteOverride = async (override: CalendarDateOverride) => {
        if (!calendar || !organizationId) return;
        try {
            await removeDateOverride(calendar.id, override.id, organizationId);
            setCalendar(previous => previous ? {
                ...previous,
                date_overrides: (previous.date_overrides ?? []).filter(item => item.id !== override.id),
            } : previous);
            toast({ title: 'Date override removed' });
        } catch (error) {
            toast({ title: 'Unable to remove date override', description: apiErrorMessage(error, 'Try again.'), variant: 'destructive' });
        }
    };

    const backButton = (
        <ShellBackButton
            label="Back to calendars"
            onClick={() => {
                if (confirmLeave()) navigate('/calendars');
            }}
        />
    );

    if (loading) {
        return (
            <PageLayout
                title="CALENDAR"
                icon={<CalendarDays className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={backButton}
            >
                <div className="space-y-4">
                    <Skeleton className="h-52 w-full" />
                    <Skeleton className="h-72 w-full" />
                </div>
            </PageLayout>
        );
    }

    if (loadError || !calendar || !draft) {
        return (
            <PageLayout
                title="CALENDAR"
                icon={<CalendarDays className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
                leading={backButton}
            >
                {organizationError ? (
                    <OrganizationErrorState title="Unable to load calendar" icon={CalendarDays} />
                ) : (
                    <ErrorState
                        kind="page"
                        title="Calendar unavailable"
                        description={loadError || 'Unable to load this calendar.'}
                        onAction={() => void loadCalendar()}
                    />
                )}
            </PageLayout>
        );
    }

    const persistedVisual = getCalendarStatusVisual(calendar.is_active);

    return (
        <PageLayout
            title="CALENDAR"
            icon={<CalendarDays className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
            leading={backButton}
            headerTools={{
                status: (
                    <Badge className={cn('pointer-events-none whitespace-nowrap', persistedVisual.badgeClass)}>
                        {persistedVisual.label}
                    </Badge>
                ),
                primaryAction: (
                    <HeaderAction
                        label={savingSettings || savingAvailability ? 'Saving...' : 'Save changes'}
                        icon={savingSettings || savingAvailability
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Save className="h-4 w-4" />}
                        onClick={() => void saveAll()}
                        disabled={savingSettings || savingAvailability || (!settingsDirty && !availabilityDirty)}
                    />
                ),
            }}
        >
                <div className="space-y-6">
                    <EntityDetailHeader
                        className="mb-0"
                        icon={<CalendarDays className={cn('h-6 w-6', persistedVisual.iconClass)} />}
                        iconClassName={persistedVisual.iconBackgroundClass}
                        title={draft.name}
                        mobileStatus={(
                            <Badge className={cn('whitespace-nowrap text-xs', persistedVisual.badgeClass)}>
                                {persistedVisual.label}
                            </Badge>
                        )}
                        metadata={(
                            <>
                                <span>{draft.durationMinutes} minutes</span>
                                <span>{draft.timezone}</span>
                                <span>{calendar.upcoming_bookings ?? 0} upcoming</span>
                                <span className="inline-flex min-w-0 items-center gap-1">
                                    <Link2 className="h-3 w-3 shrink-0" />
                                    <span className="truncate">/book/{calendar.public_id}</span>
                                </span>
                            </>
                        )}
                    />
                    <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(27rem,0.72fr)]">
                        <div className="order-2 space-y-6 2xl:order-1">
                    <Card>
                        <CardHeader>
                            <SectionCardTitle icon={SlidersHorizontal}>Calendar settings</SectionCardTitle>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-5" onSubmit={event => { event.preventDefault(); void saveSettings(); }}>
                                <AvailabilitySettingRow
                                    id="calendar-active"
                                    label="Accept new bookings"
                                    checked={draft.isActive}
                                    onCheckedChange={isActive => setDraft(previous => previous && ({
                                        ...previous,
                                        isActive,
                                    }))}
                                    help="Inactive calendars remain editable, but their public booking pages cannot accept new bookings."
                                    helpLabel="About calendar availability"
                                />
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="calendar-name">Name</Label>
                                        <Input
                                            id="calendar-name"
                                            value={draft.name}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                name: event.target.value,
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="calendar-description">Description</Label>
                                        <Textarea
                                            id="calendar-description"
                                            rows={3}
                                            value={draft.description}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                description: event.target.value,
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-timezone">Timezone</Label>
                                        <Select
                                            value={draft.timezone}
                                            onValueChange={timezone => setDraft(previous => previous && ({
                                                ...previous,
                                                timezone,
                                            }))}
                                        >
                                            <SelectTrigger id="calendar-timezone">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TIMEZONES.map(timezone => (
                                                    <SelectItem key={timezone} value={timezone}>
                                                        {timezone}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-duration">Duration (minutes)</Label>
                                        <Input
                                            id="calendar-duration"
                                            type="number"
                                            min={5}
                                            value={draft.durationMinutes}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                durationMinutes: Number(event.target.value),
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-buffer-before">Buffer before (minutes)</Label>
                                        <Input
                                            id="calendar-buffer-before"
                                            type="number"
                                            min={0}
                                            value={draft.bufferBeforeMinutes}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                bufferBeforeMinutes: Number(event.target.value),
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-buffer-after">Buffer after (minutes)</Label>
                                        <Input
                                            id="calendar-buffer-after"
                                            type="number"
                                            min={0}
                                            value={draft.bufferAfterMinutes}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                bufferAfterMinutes: Number(event.target.value),
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-min-notice">Minimum notice (hours)</Label>
                                        <Input
                                            id="calendar-min-notice"
                                            type="number"
                                            min={0}
                                            value={draft.minNoticeHours}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                minNoticeHours: Number(event.target.value),
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-max-future">Booking window (days)</Label>
                                        <Input
                                            id="calendar-max-future"
                                            type="number"
                                            min={1}
                                            value={draft.maxFutureDays}
                                            onChange={event => setDraft(previous => previous && ({
                                                ...previous,
                                                maxFutureDays: Number(event.target.value),
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="calendar-color">Color</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="calendar-color"
                                                type="color"
                                                className="w-14 p-1"
                                                value={draft.color}
                                                onChange={event => setDraft(previous => previous && ({
                                                    ...previous,
                                                    color: event.target.value,
                                                }))}
                                            />
                                            <Input
                                                aria-label="Color value"
                                                value={draft.color}
                                                onChange={event => setDraft(previous => previous && ({
                                                    ...previous,
                                                    color: event.target.value,
                                                }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <SectionCardTitle icon={CalendarClock}>Weekly availability</SectionCardTitle>
                        </CardHeader>
                        <CardContent className="divide-y">
                            {DAYS.map((day, dayIndex) => {
                                const windows = availability
                                    .map((window, index) => ({ window, index }))
                                    .filter(item => item.window.day_of_week === dayIndex);
                                return (
                                    <div
                                        key={day}
                                        className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-start"
                                    >
                                        <div className="flex min-h-10 items-center justify-between gap-3 sm:min-h-11">
                                            <p className="font-medium">{day}</p>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="sm:hidden"
                                                onClick={() => addWindow(dayIndex)}
                                                aria-label={`Add ${day} hours`}
                                            >
                                                <Plus className="mr-1 h-4 w-4" />
                                                Add hours
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {windows.length === 0 && (
                                                <p className="flex min-h-11 items-center text-sm text-muted-foreground">Unavailable</p>
                                            )}
                                            {windows.map(({ window, index }, windowIndex) => (
                                                <div
                                                    key={window.id ?? `${dayIndex}-${windowIndex}`}
                                                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-nowrap"
                                                >
                                                    <Input
                                                        type="time"
                                                        className="w-full min-w-0 sm:w-32 sm:flex-none"
                                                        aria-label={`${day} start`}
                                                        value={window.start_time.slice(0, 5)}
                                                        onInput={event => changeWindow(index, {
                                                            start_time: (event.target as HTMLInputElement).value,
                                                        })}
                                                    />
                                                    <span className="text-sm text-muted-foreground">to</span>
                                                    <Input
                                                        type="time"
                                                        className="w-full min-w-0 sm:w-32 sm:flex-none"
                                                        aria-label={`${day} end`}
                                                        value={window.end_time.slice(0, 5)}
                                                        onInput={event => changeWindow(index, {
                                                            end_time: (event.target as HTMLInputElement).value,
                                                        })}
                                                    />
                                                    <div className="col-span-3 flex items-center justify-end gap-2 sm:contents">
                                                        <Switch
                                                            aria-label={`${day} hours active`}
                                                            checked={window.is_active !== false}
                                                            onCheckedChange={isActive => changeWindow(index, {
                                                                is_active: isActive,
                                                            })}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="shrink-0"
                                                            aria-label={`Remove ${day} hours`}
                                                            onClick={() => removeWindow(index)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="hidden sm:inline-flex"
                                            onClick={() => addWindow(dayIndex)}
                                            aria-label={`Add ${day} hours`}
                                        >
                                            <Plus className="mr-1 h-4 w-4" />
                                            Add hours
                                        </Button>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <SectionCardTitle icon={CalendarOff}>Date overrides</SectionCardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-4 rounded-lg border bg-muted/15 p-4">
                                <div className={cn(
                                    'grid gap-4 sm:grid-cols-2',
                                    overrideDraft.isAvailable && 'lg:grid-cols-[minmax(12rem,1fr)_minmax(9rem,0.7fr)_minmax(16rem,1.25fr)]',
                                )}>
                                    <div className="space-y-2">
                                    <Label htmlFor="override-date">Date</Label>
                                    <Input id="override-date" type="date" min={new Date().toISOString().slice(0, 10)} value={overrideDraft.date} onChange={event => setOverrideDraft(previous => ({ ...previous, date: event.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="override-available">Availability</Label>
                                        <div className="flex h-11 items-center justify-between gap-3 rounded-md border bg-background px-3">
                                            <span className="text-sm text-muted-foreground">Available</span>
                                            <Switch id="override-available" aria-label="Make this date available" checked={overrideDraft.isAvailable} onCheckedChange={isAvailable => setOverrideDraft(previous => ({ ...previous, isAvailable }))} />
                                        </div>
                                    </div>
                                    {overrideDraft.isAvailable ? (
                                        <div className="flex gap-3 sm:col-span-2 lg:col-span-1">
                                            <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="override-start">Start</Label><Input id="override-start" type="time" value={overrideDraft.startTime} onChange={event => setOverrideDraft(previous => ({ ...previous, startTime: event.target.value }))} /></div>
                                            <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="override-end">End</Label><Input id="override-end" type="time" value={overrideDraft.endTime} onChange={event => setOverrideDraft(previous => ({ ...previous, endTime: event.target.value }))} /></div>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                    <div className="min-w-0 space-y-2">
                                    <Label htmlFor="override-reason">Reason <span className="text-muted-foreground">(optional)</span></Label>
                                    <Input id="override-reason" placeholder="Holiday, extended hours…" value={overrideDraft.reason} onChange={event => setOverrideDraft(previous => ({ ...previous, reason: event.target.value }))} />
                                    </div>
                                    <Button type="button" onClick={() => void saveOverride()} disabled={!overrideDraft.date || savingOverride} className="w-full sm:w-auto">
                                        {savingOverride ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                        Add override
                                    </Button>
                                </div>
                            </div>
                            {(calendar.date_overrides?.length ?? 0) > 0 ? (
                                <div className="divide-y rounded-lg border">
                                {calendar.date_overrides?.map(override => (
                                    <div
                                        key={override.id}
                                        className="flex items-center justify-between gap-4 px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-medium">{override.override_date}</p>
                                            {override.reason && (
                                                <p className="truncate text-sm text-muted-foreground">{override.reason}</p>
                                            )}
                                        </div>
                                        <p className="text-sm">
                                            {override.is_available
                                                ? `${override.start_time ?? ''}–${override.end_time ?? ''}`
                                                : 'Unavailable'}
                                        </p>
                                        <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remove override for ${override.override_date}`} onClick={() => void deleteOverride(override)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                </div>
                            ) : <EmptyState icon={CalendarOff} kind="inline" title="No upcoming date overrides" />}
                            </CardContent>
                        </Card>
                        </div>
                        <aside className="order-1 min-w-0 2xl:order-2 2xl:sticky 2xl:top-20">
                            <CalendarBookingPreview
                                config={{
                                    name: draft.name,
                                    description: draft.description,
                                    timezone: draft.timezone,
                                    durationMinutes: draft.durationMinutes,
                                    bufferAfterMinutes: draft.bufferAfterMinutes,
                                    color: draft.color,
                                    isActive: draft.isActive,
                                    liveIsActive: calendar.is_active,
                                    organizationName: organization?.name || 'Your organization',
                                    publicPath: `/book/${calendar.public_id}`,
                                }}
                                availability={availability}
                            />
                        </aside>
                    </div>
                </div>
        </PageLayout>
    );
}

export default CalendarSettingsPage;
