import React, { useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
} from '@/components/ui/dialog';
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarType } from '@/types';
import { createCalendar, CalendarCreateData } from '@/services/calendarsApi';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const responseData = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
    return responseData?.error || responseData?.message || fallback;
};

interface CreateCalendarModalProps {
    organizationId: number;
    onClose: () => void;
    onCreated: (calendar: CalendarType) => void;
}

const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const TIMEZONES = Array.from(new Set([
    detectedTimezone,
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
]));

const DURATIONS = [15, 30, 45, 60, 90, 120];

const COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
];

export function CreateCalendarModal({
    organizationId,
    onClose,
    onCreated,
}: CreateCalendarModalProps) {
    const { toast } = useToast();
    const { pending: loading, run, dismissIfIdle } = useSingleFlightAction();
    const [formData, setFormData] = useState<CalendarCreateData>({
        name: '',
        description: '',
        timezone: detectedTimezone,
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        min_notice_hours: 24,
        max_future_days: 60,
        color: '#3B82F6',
        organization_id: organizationId,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast({
                title: 'Error',
                description: 'Calendar name is required',
                variant: 'destructive',
            });
            return;
        }

        await run(async () => {
            try {
                const calendar = await createCalendar(formData);
                onCreated(calendar);
            } catch (error) {
                console.error('Error creating calendar:', error);
                toast({
                    title: 'Error',
                    description: getApiErrorMessage(error, 'Failed to create calendar'),
                    variant: 'destructive',
                });
            }
        });
    };

    return (
        <Dialog open onOpenChange={(open) => !open && dismissIfIdle(onClose)}>
            <ModalContent size="md">
                <ModalHeader
                    icon={CalendarDays}
                    title="Create calendar"
                    description="Set the details and booking rules for this calendar."
                />

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <ModalBody className="space-y-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name">Calendar name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="Strategy call"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Description <span className="text-muted-foreground">(optional)</span></Label>
                            <Textarea
                                id="description"
                                value={formData.description || ''}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                                }
                                placeholder="Optional description for your booking page"
                                rows={2}
                            />
                        </div>

                        {/* Duration and Timezone */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="calendar-duration">Duration</Label>
                                <Select
                                    value={formData.duration_minutes?.toString()}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, duration_minutes: parseInt(val) }))
                                    }
                                >
                                    <SelectTrigger id="calendar-duration">
                                        <Clock className="h-4 w-4 mr-2" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DURATIONS.map((d) => (
                                            <SelectItem key={d} value={d.toString()}>
                                                {d} minutes
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="calendar-timezone">Timezone</Label>
                                <Select
                                    value={formData.timezone}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, timezone: val }))
                                    }
                                >
                                    <SelectTrigger id="calendar-timezone">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                        {TIMEZONES.map((tz) => (
                                            <SelectItem key={tz} value={tz}>
                                                {tz.replace('_', ' ')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Booking constraints */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="calendar-min-notice">Minimum notice</Label>
                                <Select
                                    value={formData.min_notice_hours?.toString()}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, min_notice_hours: parseInt(val) }))
                                    }
                                >
                                    <SelectTrigger id="calendar-min-notice">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 hour</SelectItem>
                                        <SelectItem value="4">4 hours</SelectItem>
                                        <SelectItem value="24">24 hours</SelectItem>
                                        <SelectItem value="48">48 hours</SelectItem>
                                        <SelectItem value="72">3 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="calendar-booking-window">Booking window</Label>
                                <Select
                                    value={formData.max_future_days?.toString()}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, max_future_days: parseInt(val) }))
                                    }
                                >
                                    <SelectTrigger id="calendar-booking-window">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="7">1 week</SelectItem>
                                        <SelectItem value="14">2 weeks</SelectItem>
                                        <SelectItem value="30">1 month</SelectItem>
                                        <SelectItem value="60">2 months</SelectItem>
                                        <SelectItem value="90">3 months</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Color picker */}
                        <div className="space-y-2">
                            <Label>Calendar color</Label>
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Calendar color">
                                {COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`h-8 w-8 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${formData.color === color ? 'scale-110 ring-2 ring-blue-500 ring-offset-2' : ''
                                            }`}
                                        style={{ backgroundColor: color }}
                                        aria-label={`Use ${color} calendar color`}
                                        aria-pressed={formData.color === color}
                                        onClick={() => setFormData((prev) => ({ ...prev, color }))}
                                    />
                                ))}
                            </div>
                        </div>
                    </ModalBody>

                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => dismissIfIdle(onClose)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 interaction-button--primary text-white"
                            aria-label={loading ? 'Creating calendar...' : 'Create calendar'}
                            aria-busy={loading || undefined}
                        >
                            {loading ? 'Creating...' : 'Create calendar'}
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Dialog>
    );
}
