import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, ExternalLink, MapPin, Monitor, Smartphone } from 'lucide-react';
import { LiveServicePreview, ServicePreviewBrowser } from '@/components/preview/LiveServicePreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AvailabilityWindow } from '@/types';
import { cn } from '@/lib/utils';

type PreviewDevice = 'desktop' | 'mobile';

export interface CalendarBookingPreviewConfig {
  name: string;
  description: string;
  timezone: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  color: string;
  /** Pending value rendered inside the draft preview. */
  isActive: boolean;
  /** Persisted value controlling whether the public route is currently usable. */
  liveIsActive: boolean;
  organizationName: string;
  publicPath: string;
}

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const nextAvailableDate = (availability: AvailabilityWindow[]) => {
  const activeDays = new Set(
    availability.filter(window => window.is_active !== false).map(window => window.day_of_week),
  );
  const candidate = new Date();
  for (let offset = 0; offset < 14; offset += 1) {
    const next = new Date(candidate);
    next.setDate(candidate.getDate() + offset);
    if (activeDays.has(next.getDay())) return dateInputValue(next);
  }
  return dateInputValue(candidate);
};

const minutesFromTime = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

function DeviceControls({ device, onChange }: { device: PreviewDevice; onChange: (device: PreviewDevice) => void }) {
  return (
    <div className="flex items-center rounded-lg bg-muted/60 p-1" aria-label="Calendar preview device">
      {([
        { value: 'desktop' as const, label: 'Desktop', icon: Monitor },
        { value: 'mobile' as const, label: 'Mobile', icon: Smartphone },
      ]).map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant={device === value ? 'default' : 'ghost'}
          size="sm"
          className={cn('h-8 gap-2 px-2.5', device === value && 'bg-blue-600 text-white hover:bg-blue-700')}
          onClick={() => onChange(value)}
          aria-label={`${label} calendar preview`}
          aria-pressed={device === value}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden lg:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}

export function CalendarBookingPreview({
  config,
  availability,
}: {
  config: CalendarBookingPreviewConfig;
  availability: AvailabilityWindow[];
}) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [selectedDate, setSelectedDate] = useState(() => nextAvailableDate(availability));
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const selectedDay = new Date(`${selectedDate}T12:00:00Z`).getUTCDay();
  const times = useMemo(() => {
    const next: string[] = [];
    const step = Math.max(5, config.durationMinutes + config.bufferAfterMinutes);
    availability
      .filter(window => window.day_of_week === selectedDay && window.is_active !== false)
      .forEach(window => {
        const start = minutesFromTime(window.start_time);
        const end = minutesFromTime(window.end_time);
        for (let cursor = start; cursor + config.durationMinutes <= end && next.length < 12; cursor += step) {
          next.push(formatMinutes(cursor));
        }
      });
    return next;
  }, [availability, config.bufferAfterMinutes, config.durationMinutes, selectedDay]);

  const openLivePage = () => {
    if (!config.liveIsActive) return;
    window.open(config.publicPath, '_blank', 'noopener,noreferrer');
  };

  return (
    <LiveServicePreview
      controls={(
        <div className="flex items-center gap-2">
          <DeviceControls device={device} onChange={setDevice} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={openLivePage}
            disabled={!config.liveIsActive}
            aria-label={config.liveIsActive ? 'Open live booking page' : 'Save an active calendar to open its live booking page'}
            title={config.liveIsActive ? 'Open live booking page' : 'Save an active calendar to open its live booking page'}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      )}
    >
      <ServicePreviewBrowser contentClassName="overflow-auto bg-slate-100 p-3 dark:bg-slate-950/60">
        <div
          className={cn(
            'mx-auto min-h-full overflow-hidden rounded-lg border-t-4 bg-white text-slate-950 shadow-lg transition-[width] duration-200',
            device === 'mobile' ? 'w-[375px] max-w-full' : 'w-full',
          )}
          style={{ borderTopColor: config.color }}
        >
          {!config.isActive ? (
            <div className="border-b bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
              Previewing an inactive calendar
            </div>
          ) : null}
          <div className={cn(device === 'desktop' && 'grid min-h-full grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]')}>
            <section className={cn('border-b bg-slate-50 p-5', device === 'desktop' && 'border-b-0 border-r p-6')}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <CalendarDays className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-medium text-slate-500">{config.organizationName}</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">{config.name || 'Calendar name'}</h3>
              {config.description ? <p className="mt-2 text-sm leading-5 text-slate-500">{config.description}</p> : null}
              <div className="mt-5 space-y-2 text-xs text-slate-500">
                <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />{config.durationMinutes} minutes</p>
                <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{config.timezone}</p>
              </div>
            </section>
            <section className="space-y-5 p-5 sm:p-6">
              <div>
                <Label htmlFor="calendar-preview-date" className="text-slate-700">Choose a date</Label>
                <Input
                  id="calendar-preview-date"
                  type="date"
                  className="mt-2 border-slate-200 bg-white text-slate-950"
                  value={selectedDate}
                  onChange={event => {
                    setSelectedDate(event.target.value);
                    setSelectedTime(null);
                  }}
                />
              </div>
              <div>
                <p className="text-sm font-medium">Available times</p>
                {times.length ? (
                  <div className={cn('mt-2 grid gap-2', device === 'desktop' ? 'grid-cols-2' : 'grid-cols-2')}>
                    {times.map(time => (
                      <Button
                        key={time}
                        type="button"
                        variant={selectedTime === time ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                          selectedTime === time && 'bg-blue-600 text-white hover:bg-blue-700',
                        )}
                        onClick={() => setSelectedTime(time)}
                      >
                        {time}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    No times are available on this date.
                  </div>
                )}
              </div>
              {selectedTime ? (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <p className="text-sm font-medium">Your details</p>
                  <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-400">Name</div>
                  <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-400">Email</div>
                  <div className="rounded-md bg-blue-600 px-3 py-2 text-center text-xs font-medium text-white">Confirm booking</div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </ServicePreviewBrowser>
    </LiveServicePreview>
  );
}
