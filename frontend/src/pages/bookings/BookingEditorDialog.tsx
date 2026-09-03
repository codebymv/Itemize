import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Booking, Calendar } from '@/types';
import { createBooking, rescheduleBooking } from '@/services/calendarsApi';
import { zonedDateTimeInput, zonedDateTimeToIso } from '@/lib/zonedDateTime';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';

const errorMessage = (error: unknown) => {
  const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof response?.error === 'string') return response.error;
  if (typeof response?.message === 'string') return response.message;
  return error instanceof Error ? error.message : 'The booking could not be saved.';
};

export function BookingEditorDialog({
  open,
  onOpenChange,
  organizationId,
  calendars,
  booking,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  calendars: Calendar[];
  booking?: Booking | null;
  onSaved: () => void;
}) {
  const initialCalendarId = booking?.calendar_id ?? calendars.find(calendar => calendar.is_active)?.id ?? calendars[0]?.id;
  const initialCalendar = calendars.find(calendar => calendar.id === initialCalendarId);
  const initialDateTime = booking
    ? zonedDateTimeInput(new Date(booking.start_time), booking.timezone)
    : zonedDateTimeInput(new Date(), initialCalendar?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [calendarId, setCalendarId] = useState(initialCalendarId?.toString() ?? '');
  const [date, setDate] = useState(initialDateTime.date);
  const [time, setTime] = useState(initialDateTime.time);
  const [title, setTitle] = useState(booking?.title ?? '');
  const [name, setName] = useState(booking?.attendee_name ?? '');
  const [email, setEmail] = useState(booking?.attendee_email ?? '');
  const [phone, setPhone] = useState(booking?.attendee_phone ?? '');
  const [notes, setNotes] = useState(booking?.notes ?? '');
  const { pending: saving, run, dismissIfIdle } = useSingleFlightAction();
  const bookingCreation = useStableMutationKey('booking-create');
  const [error, setError] = useState('');
  const selectedCalendar = useMemo(() => calendars.find(calendar => calendar.id === Number(calendarId)), [calendarId, calendars]);

  useEffect(() => {
    if (!open) return;
    const nextCalendarId = booking?.calendar_id ?? calendars.find(calendar => calendar.is_active)?.id ?? calendars[0]?.id;
    const nextCalendar = calendars.find(calendar => calendar.id === nextCalendarId);
    const nextDateTime = booking
      ? zonedDateTimeInput(new Date(booking.start_time), booking.timezone)
      : zonedDateTimeInput(new Date(), nextCalendar?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setCalendarId(nextCalendarId?.toString() ?? '');
    setDate(nextDateTime.date);
    setTime(nextDateTime.time);
    setTitle(booking?.title ?? '');
    setName(booking?.attendee_name ?? '');
    setEmail(booking?.attendee_email ?? '');
    setPhone(booking?.attendee_phone ?? '');
    setNotes(booking?.notes ?? '');
    setError('');
  }, [booking, calendars, open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCalendar) return;
    setError('');
    await run(async () => {
      try {
        const timezone = booking?.timezone ?? selectedCalendar.timezone;
        const startTime = zonedDateTimeToIso(date, time, timezone);
        const duration = booking
          ? Math.max(1, (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 60000)
          : selectedCalendar.duration_minutes;
        const endTime = new Date(new Date(startTime).getTime() + duration * 60000).toISOString();
        if (booking) {
          await rescheduleBooking(booking.id, { start_time: startTime, end_time: endTime, timezone }, organizationId);
        } else {
          const createInput = {
            organization_id: organizationId,
            calendar_id: selectedCalendar.id,
            start_time: startTime,
            end_time: endTime,
            timezone,
            title: title.trim() || undefined,
            attendee_name: name.trim(),
            attendee_email: email.trim() || undefined,
            attendee_phone: phone.trim() || undefined,
            notes: notes.trim() || undefined,
          };
          const idempotencyKey = bookingCreation.begin(JSON.stringify(createInput));
          if (!idempotencyKey) return;
          await createBooking(createInput, idempotencyKey);
          bookingCreation.reset();
        }
      } catch (errorValue) {
        bookingCreation.release();
        setError(errorMessage(errorValue));
        return;
      }
      // The write is already confirmed. Follow-up view updates must not turn it
      // into a retryable "save failed" state.
      onOpenChange(false);
      onSaved();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) onOpenChange(true);
      else dismissIfIdle(() => {
        bookingCreation.reset();
        onOpenChange(false);
      });
    }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarCheck2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />{booking ? 'Reschedule booking' : 'New booking'}</DialogTitle>
          <DialogDescription>{booking ? 'Choose a new date and time.' : 'Schedule an appointment for a customer.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {!booking ? (
            <div className="space-y-2">
              <Label htmlFor="booking-calendar">Calendar</Label>
              <Select value={calendarId} onValueChange={setCalendarId} required>
                <SelectTrigger id="booking-calendar"><SelectValue placeholder="Select a calendar" /></SelectTrigger>
                <SelectContent>{calendars.filter(calendar => calendar.is_active).map(calendar => <SelectItem key={calendar.id} value={String(calendar.id)}>{calendar.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="booking-editor-date">Date</Label><Input id="booking-editor-date" type="date" required value={date} onChange={event => setDate(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="booking-editor-time">Time</Label><Input id="booking-editor-time" type="time" required value={time} onChange={event => setTime(event.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{booking?.timezone ?? selectedCalendar?.timezone}</p>
          {!booking ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="booking-editor-name">Attendee name</Label><Input id="booking-editor-name" required value={name} onChange={event => setName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="booking-editor-email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="booking-editor-email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="booking-editor-phone">Phone <span className="text-muted-foreground">(optional)</span></Label><Input id="booking-editor-phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="booking-editor-title">Title <span className="text-muted-foreground">(optional)</span></Label><Input id="booking-editor-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="booking-editor-notes">Notes <span className="text-muted-foreground">(optional)</span></Label><Textarea id="booking-editor-notes" rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></div>
            </div>
          ) : null}
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => dismissIfIdle(() => {
              bookingCreation.reset();
              onOpenChange(false);
            })} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !selectedCalendar} aria-busy={saving || undefined} className="bg-blue-600 text-white interaction-button--primary">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{booking ? 'Reschedule' : 'Create booking'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
