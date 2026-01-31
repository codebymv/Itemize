import React, { useState } from 'react';
import { X, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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

interface CreateCalendarModalProps {
    organizationId: number;
    onClose: () => void;
    onCreated: (calendar: CalendarType) => void;
}

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
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<CalendarCreateData>({
        name: '',
        description: '',
        timezone: 'America/New_York',
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

        setLoading(true);
        try {
            const calendar = await createCalendar(formData);
            onCreated(calendar);
        } catch (error: any) {
            console.error('Error creating calendar:', error);
            toast({
                title: 'Error',
                description: error.response?.data?.error || 'Failed to create calendar',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        Create Calendar
                    </DialogTitle>
                    <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
                        Set up a new calendar for appointment scheduling
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name" style={{ fontFamily: '"Raleway", sans-serif' }}>Calendar Name *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="e.g., Strategy Call, Discovery Meeting"
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description" style={{ fontFamily: '"Raleway", sans-serif' }}>Description</Label>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="duration" style={{ fontFamily: '"Raleway", sans-serif' }}>Duration</Label>
                                <Select
                                    value={formData.duration_minutes?.toString()}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, duration_minutes: parseInt(val) }))
                                    }
                                >
                                    <SelectTrigger>
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
                                <Label htmlFor="timezone">Timezone</Label>
                                <Select
                                    value={formData.timezone}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, timezone: val }))
                                    }
                                >
                                    <SelectTrigger>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="min_notice" style={{ fontFamily: '"Raleway", sans-serif' }}>Minimum Notice</Label>
                                <Select
                                    value={formData.min_notice_hours?.toString()}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, min_notice_hours: parseInt(val) }))
                                    }
                                >
                                    <SelectTrigger>
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
                                <Label htmlFor="max_future">Booking Window</Label>
                                <Select
                                    value={formData.max_future_days?.toString()}
                                    onValueChange={(val) =>
                                        setFormData((prev) => ({ ...prev, max_future_days: parseInt(val) }))
                                    }
                                >
                                    <SelectTrigger>
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
                            <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Calendar Color</Label>
                            <div className="flex gap-2">
                                {COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`w-8 h-8 rounded-full transition-transform ${formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                                            }`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => setFormData((prev) => ({ ...prev, color }))}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            style={{ fontFamily: '"Raleway", sans-serif' }}
                            aria-label={loading ? 'Creating calendar...' : 'Create calendar'}
                        >
                            {loading ? 'Creating...' : 'Create Calendar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
