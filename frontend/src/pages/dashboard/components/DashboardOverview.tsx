import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Activity,
  AlertTriangle,
  GripVertical,
  Pin,
  PinOff,
  Plus,
} from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FramedSection } from '@/components/ui/framed-section';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/ui/search-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { getStatIconBgClass, getStatIconClass, getStatValueClass } from '@/hooks/useStatStyles';
import { cn } from '@/lib/utils';
import { STATUS_THEME_CLASSES } from '@/lib/statusVisuals';
import { ResponsiveValue } from '@/components/ui/responsive-value';
import {
  DASHBOARD_SIGNAL_GROUPS,
  MAX_PINNED_DASHBOARD_SIGNALS,
  MIN_PINNED_DASHBOARD_SIGNALS,
  type DashboardSignal,
  type DashboardSignalGroup,
  type DashboardSignalId,
} from '../signals/dashboardSignalCatalog';

interface DashboardOverviewProps {
  signals: DashboardSignal[];
  pinnedSignalIds: DashboardSignalId[];
  onSavePinnedSignalIds: (signalIds: DashboardSignalId[]) => void;
  onNavigate: (route: string) => void;
}

const signalAriaLabel = (signal: DashboardSignal) => [
  signal.title,
  signal.status === 'loading' ? 'Loading' : signal.status === 'unavailable' ? 'Unavailable' : signal.value,
  signal.supportingText,
  signal.timeframe,
  `Open ${signal.source}`,
].filter(Boolean).join('. ');

function SignalIcon({ signal, size = 'default' }: { signal: DashboardSignal; size?: 'default' | 'small' }) {
  const Icon = signal.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        getStatIconBgClass(signal.theme),
        size === 'small' ? 'h-8 w-8' : 'h-10 w-10',
      )}
    >
      <Icon className={cn(getStatIconClass(signal.theme), size === 'small' ? 'h-4 w-4' : 'h-5 w-5')} />
    </span>
  );
}

function SortableDashboardSignalCell({
  signal,
  canUnpin,
  onUnpin,
  onNavigate,
}: {
  signal: DashboardSignal;
  canUnpin: boolean;
  onUnpin: (id: DashboardSignalId) => void;
  onNavigate: (route: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: signal.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.75 : undefined,
      }}
      className="group relative flex min-w-0 bg-background"
      data-dashboard-signal={signal.id}
      data-dragging={isDragging || undefined}
    >
      <button
        type="button"
        className="interaction-row min-w-0 flex-1 p-4 text-left sm:p-5"
        aria-label={signalAriaLabel(signal)}
        onClick={() => onNavigate(signal.route)}
      >
        <div className="flex min-w-0 items-start gap-3">
          <SignalIcon signal={signal} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-foreground">{signal.title}</p>
              {signal.timeframe ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">{signal.timeframe}</span>
              ) : null}
            </div>
            {signal.status === 'loading' ? (
              <div className="mt-2 space-y-2" aria-label={`Loading ${signal.title}`}>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            ) : (
              <>
                <p className={cn('mt-1 min-w-0 text-2xl font-bold tabular-nums', signal.status === 'unavailable' ? 'text-muted-foreground' : getStatValueClass(signal.theme))}>
                  {signal.status === 'unavailable' ? '—' : (
                    <ResponsiveValue
                      values={[signal.value, signal.compactValue ?? signal.value]}
                      accessibleValue={signal.value}
                    />
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {signal.status === 'unavailable' ? 'Data unavailable' : signal.supportingText}
                </p>
              </>
            )}
          </div>
        </div>
      </button>
      <div className="interaction-reveal flex shrink-0 flex-col items-center justify-center gap-1 border-l border-border/70 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="iconCompact"
              className="touch-target-mobile cursor-grab touch-pan-y active:cursor-grabbing"
              aria-label={`Reorder ${signal.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructiveGhost"
              size="iconCompact"
              aria-label={`Unpin ${signal.title}`}
              disabled={!canUnpin}
              onClick={() => onUnpin(signal.id)}
            >
              <PinOff aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{canUnpin ? 'Unpin signal' : 'Keep at least one signal pinned'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function AttentionSignals({
  signals,
  onNavigate,
}: {
  signals: DashboardSignal[];
  onNavigate: (route: string) => void;
}) {
  if (signals.length === 0) return null;

  return (
    <div className="dashboard-overview-attention-body mb-4 grid overflow-hidden rounded-lg border border-red-200 bg-red-50/70 min-[520px]:grid-cols-[auto_minmax(0,1fr)] dark:border-red-900 dark:bg-red-950/20">
      <div className="flex items-center justify-between gap-3 border-b border-red-200 px-4 py-3 min-[520px]:border-b-0 min-[520px]:border-r dark:border-red-900">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <h3 className="text-sm font-medium">Needs attention</h3>
        </div>
        <Badge className={STATUS_THEME_CLASSES.red.badgeClass}>
          {signals.length}
        </Badge>
      </div>
      <div className="divide-y divide-red-200 dark:divide-red-900">
        {signals.map((signal) => (
          <button
            key={signal.id}
            type="button"
            className="interaction-row flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left"
            aria-label={signalAriaLabel(signal)}
            onClick={() => onNavigate(signal.route)}
          >
            <SignalIcon signal={signal} size="small" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{signal.title}</span>
            <span className="shrink-0 text-sm font-semibold text-red-600 dark:text-red-400">{signal.value}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground min-[520px]:inline">{signal.supportingText}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactAttentionSignals({
  signals,
  onNavigate,
}: {
  signals: DashboardSignal[];
  onNavigate: (route: string) => void;
}) {
  if (signals.length === 0) return null;

  const firstSignal = signals[0];
  const summary = (
    <>
      <AlertTriangle aria-hidden="true" className="text-red-600 dark:text-red-400" />
      <span className="max-w-40 truncate">{firstSignal.title}</span>
      <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">{firstSignal.value}</span>
      {signals.length > 1 ? (
        <span className="shrink-0 text-xs text-muted-foreground">+{signals.length - 1}</span>
      ) : null}
    </>
  );

  if (signals.length === 1) {
    return (
      <div className="dashboard-overview-attention-summary">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 bg-red-50/70 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/20 dark:hover:bg-red-950/40"
                aria-label={`Needs attention: ${signalAriaLabel(firstSignal)}`}
                onClick={() => onNavigate(firstSignal.route)}
              >
                {summary}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{firstSignal.supportingText}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="dashboard-overview-attention-summary">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-200 bg-red-50/70 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/20 dark:hover:bg-red-950/40"
            aria-label={`${signals.length} signals need attention`}
          >
            {summary}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Needs attention</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {signals.map((signal) => (
            <DropdownMenuItem key={signal.id} className="gap-3" onSelect={() => onNavigate(signal.route)}>
              <SignalIcon signal={signal} size="small" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{signal.title}</span>
                  <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">{signal.value}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">{signal.supportingText}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function OverviewSignalPickerBody({
  signals,
  pinnedSignalIds,
  onSave,
}: {
  signals: DashboardSignal[];
  pinnedSignalIds: DashboardSignalId[];
  onSave: (signalIds: DashboardSignalId[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | DashboardSignalGroup>('all');

  const availableSignals = signals.filter((signal) => {
    if (pinnedSignalIds.includes(signal.id)) return false;
    if (group !== 'all' && signal.source !== group) return false;
    const normalized = query.trim().toLowerCase();
    return !normalized || [signal.title, signal.source].some((text) => text.toLowerCase().includes(normalized));
  });

  const pin = (id: DashboardSignalId) => {
    if (pinnedSignalIds.length >= MAX_PINNED_DASHBOARD_SIGNALS) return;
    onSave([...pinnedSignalIds, id]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b p-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
            <SearchField
              label="Search overview signals"
              placeholder="Search signals…"
              value={query}
              onValueChange={setQuery}
            />
            <Select value={group} onValueChange={(value) => setGroup(value as 'all' | DashboardSignalGroup)}>
              <SelectTrigger aria-label="Filter signals by module">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {DASHBOARD_SIGNAL_GROUPS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
      </div>

        <div data-signal-picker-results className="min-h-0 flex-1 overflow-y-auto p-4">
          {availableSignals.length === 0 ? (
            <EmptyState
              kind="results"
              size="compact"
              icon={Pin}
              title={pinnedSignalIds.length >= MAX_PINNED_DASHBOARD_SIGNALS ? 'Your overview is full' : 'No matching signals'}
              description={pinnedSignalIds.length >= MAX_PINNED_DASHBOARD_SIGNALS ? 'Unpin one signal from the overview before adding another.' : 'Try a different search or module.'}
              className="rounded-lg border bg-background"
            />
          ) : (
            <div className="overflow-hidden rounded-lg border bg-background">
              {availableSignals.map((signal) => (
                <div key={signal.id} className="flex min-w-0 items-center gap-3 border-b p-3 last:border-b-0">
                  <SignalIcon signal={signal} size="small" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium">{signal.title}</p>
                      <Badge variant="outline" className="hidden shrink-0 font-normal sm:inline-flex">{signal.source}</Badge>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="toolbar" disabled={pinnedSignalIds.length >= MAX_PINNED_DASHBOARD_SIGNALS} onClick={() => pin(signal.id)}>
                    <Pin aria-hidden="true" />
                    Pin
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}

function OverviewSignalPicker({
  trigger,
  signals,
  pinnedSignalIds,
  onSave,
}: {
  trigger: ReactElement;
  signals: DashboardSignal[];
  pinnedSignalIds: DashboardSignalId[];
  onSave: (signalIds: DashboardSignalId[]) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pinnedSignalIds.length >= MAX_PINNED_DASHBOARD_SIGNALS) setOpen(false);
  }, [pinnedSignalIds.length]);

  const pickerBody = (
    <OverviewSignalPickerBody
      key={open ? 'open' : 'closed'}
      signals={signals}
      pinnedSignalIds={pinnedSignalIds}
      onSave={onSave}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          data-overview-signal-picker="sheet"
          className="flex h-[85dvh] max-h-[720px] flex-col gap-0 overflow-hidden rounded-t-xl p-0"
        >
          <SheetHeader className="shrink-0 border-b p-4 pr-12 text-left">
            <SheetTitle>Add overview signals</SheetTitle>
            <SheetDescription>Choose signals to add. Reorder or unpin them from the overview.</SheetDescription>
          </SheetHeader>
          {pickerBody}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Add overview signals"
        data-overview-signal-picker="popover"
        className="flex h-[min(560px,65vh)] w-[460px] flex-col overflow-hidden p-0"
      >
        <div className="shrink-0 border-b p-4">
          <h2 className="text-base font-semibold">Add overview signals</h2>
          <p className="text-xs text-muted-foreground">Choose signals to add. Reorder or unpin them from the overview.</p>
        </div>
        {pickerBody}
      </PopoverContent>
    </Popover>
  );
}

export function DashboardOverview({
  signals,
  pinnedSignalIds,
  onSavePinnedSignalIds,
  onNavigate,
}: DashboardOverviewProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = useMemo(() => new Map(signals.map((signal) => [signal.id, signal])), [signals]);
  const pinnedSignals = pinnedSignalIds.map((id) => byId.get(id)).filter((signal): signal is DashboardSignal => Boolean(signal));
  const openSlotNumbers = Array.from(
    { length: Math.max(0, MAX_PINNED_DASHBOARD_SIGNALS - pinnedSignalIds.length) },
    (_, index) => pinnedSignalIds.length + index + 1,
  );
  const attentionSignals = signals.filter((signal) => (
    signal.requiresAttention
    && signal.status === 'ready'
    && !pinnedSignalIds.includes(signal.id)
  ));

  const unpinSignal = (id: DashboardSignalId) => {
    if (pinnedSignalIds.length <= MIN_PINNED_DASHBOARD_SIGNALS) return;
    onSavePinnedSignalIds(pinnedSignalIds.filter((candidate) => candidate !== id));
  };

  const reorderSignals = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = pinnedSignalIds.indexOf(active.id as DashboardSignalId);
    const newIndex = pinnedSignalIds.indexOf(over.id as DashboardSignalId);
    if (oldIndex < 0 || newIndex < 0) return;
    onSavePinnedSignalIds(arrayMove(pinnedSignalIds, oldIndex, newIndex));
  };

  return (
    <>
      <FramedSection
        title="Overview"
        icon={Activity}
        contentSurface="inset"
        headerClassName="items-center"
        className="dashboard-overview-frame mb-8"
        data-dashboard-section="overview"
        action={(
          <div className="flex items-center gap-2">
            <CompactAttentionSignals signals={attentionSignals} onNavigate={onNavigate} />
            <OverviewSignalPicker
              signals={signals}
              pinnedSignalIds={pinnedSignalIds}
              onSave={onSavePinnedSignalIds}
              trigger={(
                <Button type="button" variant="outline" size="sm" disabled={pinnedSignalIds.length >= MAX_PINNED_DASHBOARD_SIGNALS}>
                  <Plus aria-hidden="true" />
                  Add signals
                </Button>
              )}
            />
          </div>
        )}
      >
        <AttentionSignals signals={attentionSignals} onNavigate={onNavigate} />
        <TooltipProvider delayDuration={300}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderSignals}>
            <SortableContext items={pinnedSignalIds} strategy={rectSortingStrategy}>
              <div className="dashboard-signal-grid grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Pinned overview signals">
                {pinnedSignals.map((signal) => (
                  <SortableDashboardSignalCell
                    key={signal.id}
                    signal={signal}
                    canUnpin={pinnedSignalIds.length > MIN_PINNED_DASHBOARD_SIGNALS}
                    onUnpin={unpinSignal}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
              {openSlotNumbers.length > 0 ? (
                <div
                  className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  role="group"
                  aria-label={`${openSlotNumbers.length} open overview ${openSlotNumbers.length === 1 ? 'slot' : 'slots'}`}
                >
                  {openSlotNumbers.map((slotNumber) => (
                    <OverviewSignalPicker
                      key={slotNumber}
                      signals={signals}
                      pinnedSignalIds={pinnedSignalIds}
                      onSave={onSavePinnedSignalIds}
                      trigger={(
                        <button
                          type="button"
                          className="interaction-row flex min-h-12 items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
                          aria-label={`Open overview slot ${slotNumber} of ${MAX_PINNED_DASHBOARD_SIGNALS}`}
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>Open slot</span>
                          <span className="tabular-nums">{slotNumber}/{MAX_PINNED_DASHBOARD_SIGNALS}</span>
                        </button>
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </SortableContext>
          </DndContext>
        </TooltipProvider>
      </FramedSection>

    </>
  );
}
