import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useHeader } from '@/contexts/HeaderContext';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import {
    getCalendar,
    updateCalendar,
    updateCalendarAvailability,
} from '@/services/calendarsApi';
import type { AvailabilityWindow, Calendar } from '@/types';

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

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const data = (error as { response?: { data?: { error?: string; message?: string } } })
        ?.response?.data;
    return data?.error || data?.message || fallback;
};

export function CalendarSettingsPage() {
    const { id } = useParams<{ id: string }>();
    const calendarId = Number(id);
    const navigate = useNavigate();
    const { setHeaderContent } = useHeader();
    const { toast } = useToast();
    const {
        organizationId,
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

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center gap-3 min-w-0">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Back to calendars"
                    onClick={() => navigate('/calendars')}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <CalendarIcon className="h-5 w-5 text-blue-600 shrink-0" />
                <h1 className="text-lg font-semibold truncate">
                    {calendar?.name || 'Calendar settings'}
                </h1>
            </div>,
        );
        return () => setHeaderContent(null);
    }, [calendar?.name, navigate, setHeaderContent]);

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

    const saveSettings = async (event: React.FormEvent) => {
        event.preventDefault();
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

    if (loading) {
        return (
            <PageContainer>
                <PageSurface>
                    <div className="space-y-4">
                        <Skeleton className="h-52 w-full" />
                        <Skeleton className="h-72 w-full" />
                    </div>
                </PageSurface>
            </PageContainer>
        );
    }

    if (loadError || !calendar || !draft) {
        return (
            <PageContainer>
                <PageSurface className="max-w-lg mx-auto mt-12" contentClassName="text-center">
                    <CalendarIcon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <h2 className="text-lg font-semibold">Calendar unavailable</h2>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                        {loadError || 'Unable to load this calendar.'}
                    </p>
                    <div className="flex justify-center gap-2">
                        <Button variant="outline" onClick={() => navigate('/calendars')}>
                            Back
                        </Button>
                        <Button onClick={() => void loadCalendar()}>Retry</Button>
                    </div>
                </PageSurface>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageSurface>
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Settings</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-5" onSubmit={saveSettings}>
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
                                    <div className="flex items-center justify-between rounded-md border px-4 py-3">
                                        <Label htmlFor="calendar-active">Active</Label>
                                        <Switch
                                            id="calendar-active"
                                            checked={draft.isActive}
                                            onCheckedChange={isActive => setDraft(previous => previous && ({
                                                ...previous,
                                                isActive,
                                            }))}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button type="submit" disabled={savingSettings}>
                                        {savingSettings
                                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            : <Save className="h-4 w-4 mr-2" />}
                                        Save settings
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle>Weekly availability</CardTitle>
                            <Button
                                type="button"
                                onClick={() => void saveAvailability()}
                                disabled={savingAvailability}
                            >
                                {savingAvailability
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <Save className="h-4 w-4 mr-2" />}
                                Save availability
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {DAYS.map((day, dayIndex) => {
                                const windows = availability
                                    .map((window, index) => ({ window, index }))
                                    .filter(item => item.window.day_of_week === dayIndex);
                                return (
                                    <div
                                        key={day}
                                        className="grid gap-3 border-b pb-4 last:border-0 last:pb-0 md:grid-cols-[8rem_1fr]"
                                    >
                                        <div className="flex items-center justify-between md:block">
                                            <p className="font-medium py-2">{day}</p>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => addWindow(dayIndex)}
                                                aria-label={`Add ${day} hours`}
                                            >
                                                <Plus className="h-4 w-4 mr-1" />
                                                Hours
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {windows.length === 0 && (
                                                <p className="text-sm text-muted-foreground py-2">Unavailable</p>
                                            )}
                                            {windows.map(({ window, index }, windowIndex) => (
                                                <div
                                                    key={window.id ?? `${dayIndex}-${windowIndex}`}
                                                    className="flex flex-wrap items-center gap-2"
                                                >
                                                    <Input
                                                        type="time"
                                                        className="w-32"
                                                        aria-label={`${day} start`}
                                                        value={window.start_time.slice(0, 5)}
                                                        onChange={event => changeWindow(index, {
                                                            start_time: event.target.value,
                                                        })}
                                                    />
                                                    <span className="text-sm text-muted-foreground">to</span>
                                                    <Input
                                                        type="time"
                                                        className="w-32"
                                                        aria-label={`${day} end`}
                                                        value={window.end_time.slice(0, 5)}
                                                        onChange={event => changeWindow(index, {
                                                            end_time: event.target.value,
                                                        })}
                                                    />
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
                                                        aria-label={`Remove ${day} hours`}
                                                        onClick={() => removeWindow(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    {(calendar.date_overrides?.length ?? 0) > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Upcoming date overrides</CardTitle>
                            </CardHeader>
                            <CardContent className="divide-y">
                                {calendar.date_overrides?.map(override => (
                                    <div
                                        key={override.id}
                                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                                    >
                                        <div>
                                            <p className="font-medium">{override.override_date}</p>
                                            {override.reason && (
                                                <p className="text-sm text-muted-foreground">{override.reason}</p>
                                            )}
                                        </div>
                                        <p className="text-sm">
                                            {override.is_available
                                                ? `${override.start_time ?? ''}–${override.end_time ?? ''}`
                                                : 'Unavailable'}
                                        </p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </PageSurface>
        </PageContainer>
    );
}

export default CalendarSettingsPage;
