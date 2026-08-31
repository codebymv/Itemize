import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CalendarDays, Clock3, Loader2, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { LoadingState } from '@/components/LoadingState';
import {
  BrandedPublicCard,
  BrandedPublicContainer,
  BrandedPublicPage,
} from '@/components/public/BrandedPublicPage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  cancelPublicBooking,
  getAvailableSlots,
  getPublicCalendar,
  submitPublicBooking,
} from '@/services/calendarsApi';
import type { AvailableSlotsResponse, Booking, PublicCalendarInfo } from '@/types';
import { cn } from '@/lib/utils';

type Slot = AvailableSlotsResponse['slots'][number];
type ConfirmedBooking = Booking & { cancellation_token: string };

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const apiError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof response?.error === 'string') return response.error;
  if (typeof response?.message === 'string') return response.message;
  return fallback;
};

const formatSlot = (value: string, timezone: string) => new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: timezone,
}).format(new Date(value));

const formatBookingDate = (value: string, timezone: string) => new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: timezone,
}).format(new Date(value));

export default function PublicBookingPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const today = useMemo(() => new Date(), []);
  const [calendar, setCalendar] = useState<PublicCalendarInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateInputValue(today));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [attendee, setAttendee] = useState({ name: '', email: '', phone: '', notes: '' });

  useEffect(() => {
    let active = true;
    if (!identifier) {
      setError('This booking page is unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    getPublicCalendar(identifier)
      .then(result => {
        if (active) setCalendar(result);
      })
      .catch(errorValue => {
        if (active) setError(apiError(errorValue, 'This booking page is unavailable.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [identifier]);

  useEffect(() => {
    let active = true;
    if (!identifier || !calendar || !selectedDate || confirmed) return;
    setSlotsLoading(true);
    setSlotError('');
    setSelectedSlot(null);
    getAvailableSlots(identifier, selectedDate)
      .then(result => {
        if (active) setSlots(result.slots);
      })
      .catch(errorValue => {
        if (active) {
          setSlots([]);
          setSlotError(apiError(errorValue, 'Available times could not be loaded.'));
        }
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => { active = false; };
  }, [calendar, confirmed, identifier, selectedDate]);

  const maxDate = calendar
    ? dateInputValue(addDays(today, calendar.max_future_days))
    : dateInputValue(today);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier || !calendar || !selectedSlot || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await submitPublicBooking(identifier, {
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        timezone: calendar.timezone,
        attendee_name: attendee.name.trim(),
        attendee_email: attendee.email.trim(),
        attendee_phone: attendee.phone.trim() || undefined,
        notes: attendee.notes.trim() || undefined,
      });
      setConfirmed(result.booking);
    } catch (errorValue) {
      const message = apiError(errorValue, 'Your booking could not be completed. Please try again.');
      setError(message);
      if (message.toLowerCase().includes('no longer available')) {
        setSelectedSlot(null);
        try {
          const result = await getAvailableSlots(identifier, selectedDate);
          setSlots(result.slots);
        } catch {
          // The submission error remains the actionable message.
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async () => {
    if (!identifier || !confirmed || cancelling) return;
    setCancelling(true);
    setError('');
    try {
      await cancelPublicBooking(identifier, confirmed.cancellation_token);
      setCancelled(true);
    } catch (errorValue) {
      setError(apiError(errorValue, 'Your booking could not be cancelled.'));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <BrandedPublicPage>
        <LoadingState kind="page" message="Loading booking page" className="min-h-[calc(100vh-4rem)]" />
      </BrandedPublicPage>
    );
  }

  if (!calendar) {
    return (
      <BrandedPublicPage>
        <BrandedPublicContainer className="grid min-h-[calc(100vh-4rem)] max-w-xl place-items-center">
          <BrandedPublicCard className="w-full" contentClassName="p-8 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Booking page unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error || 'This booking page is unavailable.'}</p>
          </BrandedPublicCard>
        </BrandedPublicContainer>
      </BrandedPublicPage>
    );
  }

  if (confirmed) {
    return (
      <BrandedPublicPage>
        <BrandedPublicContainer className="max-w-2xl">
          <BrandedPublicCard contentClassName="p-6 text-center sm:p-10">
            <div className={cn(
              'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
              cancelled ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}>
              <CalendarCheck2 className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold">{cancelled ? 'Booking cancelled' : 'You’re booked'}</h1>
            <p className="mt-2 text-muted-foreground">
              {cancelled ? `Your appointment with ${calendar.organization_name} has been cancelled.` : `Your appointment with ${calendar.organization_name} is confirmed.`}
            </p>
            <div className="mx-auto mt-6 max-w-md rounded-lg border bg-muted/20 p-4 text-left">
              <p className="font-medium">{calendar.name}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {formatBookingDate(confirmed.start_time, calendar.timezone)}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {formatSlot(confirmed.start_time, calendar.timezone)}–{formatSlot(confirmed.end_time, calendar.timezone)}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {calendar.timezone}
              </p>
            </div>
            {!cancelled ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="mt-6" disabled={cancelling}>
                    Cancel booking
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This appointment will be released and cannot be restored from this page.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep booking</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground interaction-button--destructive"
                      disabled={cancelling}
                      aria-busy={cancelling ? 'true' : undefined}
                      onClick={event => {
                        event.preventDefault();
                        void cancelBooking();
                      }}
                    >
                      {cancelling && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
                      Cancel booking
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {error ? <Alert variant="destructive" className="mt-6 text-left"><AlertDescription>{error}</AlertDescription></Alert> : null}
          </BrandedPublicCard>
        </BrandedPublicContainer>
      </BrandedPublicPage>
    );
  }

  return (
    <BrandedPublicPage>
      <BrandedPublicContainer className="max-w-5xl">
        <BrandedPublicCard>
          <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <section className="border-b bg-muted/20 p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="h-6 w-6" />
              </div>
              <p className="mt-5 text-sm font-medium text-muted-foreground">{calendar.organization_name}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{calendar.name}</h1>
              {calendar.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{calendar.description}</p> : null}
              <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{calendar.duration_minutes} minutes</p>
                <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{calendar.timezone}</p>
              </div>
            </section>

            <form className="space-y-6 p-6 sm:p-8" onSubmit={submit}>
              <section>
                <Label htmlFor="booking-date">Choose a date</Label>
                <Input
                  id="booking-date"
                  type="date"
                  className="mt-2 max-w-xs"
                  min={dateInputValue(today)}
                  max={maxDate}
                  value={selectedDate}
                  onChange={event => setSelectedDate(event.target.value)}
                />
              </section>

              <section aria-live="polite">
                <h2 className="text-sm font-medium">Available times</h2>
                {slotsLoading ? (
                  <LoadingState
                    kind="inline"
                    message="Loading available times"
                    className="mt-3 rounded-lg border border-dashed"
                  />
                ) : slotError ? (
                  <Alert variant="destructive" className="mt-3"><AlertDescription>{slotError}</AlertDescription></Alert>
                ) : slots.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No times are available on this date.</div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {slots.map(slot => {
                      const selected = selectedSlot?.start_time === slot.start_time;
                      return (
                        <Button
                          key={slot.start_time}
                          type="button"
                          variant={selected ? 'default' : 'outline'}
                          className={cn(selected && 'bg-blue-600 text-white interaction-button--primary')}
                          aria-pressed={selected}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {formatSlot(slot.start_time, calendar.timezone)}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </section>

              {selectedSlot ? (
                <section className="space-y-4 border-t pt-6">
                  <div>
                    <h2 className="font-medium">Your details</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatBookingDate(selectedSlot.start_time, calendar.timezone)} at {formatSlot(selectedSlot.start_time, calendar.timezone)}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="attendee-name">Name</Label>
                      <div className="relative"><UserRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="attendee-name" className="pl-10" autoComplete="name" required value={attendee.name} onChange={event => setAttendee(previous => ({ ...previous, name: event.target.value }))} /></div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="attendee-email">Email</Label>
                      <div className="relative"><Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="attendee-email" className="pl-10" type="email" autoComplete="email" required value={attendee.email} onChange={event => setAttendee(previous => ({ ...previous, email: event.target.value }))} /></div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="attendee-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
                      <div className="relative"><Phone className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="attendee-phone" className="pl-10" type="tel" autoComplete="tel" value={attendee.phone} onChange={event => setAttendee(previous => ({ ...previous, phone: event.target.value }))} /></div>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="attendee-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
                      <Textarea id="attendee-notes" rows={3} value={attendee.notes} onChange={event => setAttendee(previous => ({ ...previous, notes: event.target.value }))} />
                    </div>
                  </div>
                  {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                  <Button type="submit" className="w-full bg-blue-600 text-white interaction-button--primary sm:w-auto" disabled={submitting} aria-busy={submitting ? 'true' : undefined}>
                    {submitting && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm booking
                  </Button>
                </section>
              ) : null}
            </form>
          </div>
        </BrandedPublicCard>
      </BrandedPublicContainer>
    </BrandedPublicPage>
  );
}
