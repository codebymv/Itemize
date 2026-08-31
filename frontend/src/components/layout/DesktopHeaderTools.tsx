import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useState,
  useContext,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { AppHeaderIconButton } from '@/components/ui/app-header-icon-button';
import { Button } from '@/components/ui/button';
import { NavigationRow } from '@/components/ui/navigation-row';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchField } from '@/components/ui/search-field';
import { IconTabsList, IconTabsTrigger, Tabs } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface DesktopHeaderToolsProps {
  /** Persistent editor modes; compacts from labels to icons to one selector. */
  modeNavigation?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  combinedQuery?: ReactNode;
  /** Read-only entity state kept visible while lower-priority controls compact. */
  status?: ReactNode;
  secondaryAction?: ReactNode;
  primaryAction?: ReactNode;
}

export type ResponsiveHeaderToolsProps = DesktopHeaderToolsProps;

const PromotedHeaderActionContext = createContext(false);

interface HeaderSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Allows longer dataset labels to use available shell width before compacting. */
  width?: 'default' | 'wide';
}

interface HeaderFiltersProps {
  children: ReactNode;
  compactChildren?: ReactNode;
  /** Short current value used instead of a generic filter icon when context matters. */
  compactLabel?: string;
  label: string;
  activeCount?: number;
  /**
   * Surfaces a high-value scope control before the complete filter lane fits.
   * `true` is the first control to expose; `when-roomy` and `wide-lane`
   * progressively expose useful secondary controls as the command lane grows.
   */
  preferExpanded?: boolean | 'when-roomy' | 'wide-lane';
}

interface HeaderCombinedQueryProps extends HeaderSearchProps, HeaderFiltersProps {}

interface HeaderRefreshActionProps {
  onClick: () => void;
  refreshing?: boolean;
  label?: string;
  prominence?: 'primary' | 'secondary';
}

interface HeaderActionProps {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  prominence?: 'primary' | 'secondary';
}

export interface HeaderModeNavigationItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface HeaderModeNavigationProps {
  value: string;
  onValueChange: (value: string) => void;
  items: HeaderModeNavigationItem[];
  label: string;
}

/**
 * One non-wrapping desktop command lane. Named slots preserve the order
 * search -> filters -> secondary -> primary, with primary nearest global chrome.
 */
function HeaderToolsLane({
  modeNavigation,
  search,
  filters,
  combinedQuery,
  status,
  secondaryAction,
  primaryAction,
}: DesktopHeaderToolsProps) {
  const promoteSecondary = Boolean(
    secondaryAction && !primaryAction && countMobileActions(secondaryAction) === 1,
  );
  const effectiveSecondaryAction = promoteSecondary ? null : secondaryAction;
  const effectivePrimaryAction = primaryAction ?? (promoteSecondary ? secondaryAction : null);

  return (
    <div className="desktop-header-tools__lane">
      {modeNavigation ? (
        <div className="desktop-header-tools__mode">{modeNavigation}</div>
      ) : null}
      {combinedQuery ? (
        <div className="desktop-header-tools__combined-query">{combinedQuery}</div>
      ) : null}
      {search ? <div className="desktop-header-tools__search">{search}</div> : null}
      {filters ? <div className="desktop-header-tools__filters">{filters}</div> : null}
      {status ? <div className="desktop-header-tools__status flex shrink-0">{status}</div> : null}
      {effectiveSecondaryAction ? (
        <div className="desktop-header-tools__secondary">{effectiveSecondaryAction}</div>
      ) : null}
      {effectivePrimaryAction ? (
        <div
          className={cn('desktop-header-tools__primary', promoteSecondary && 'header-action-promoted-primary')}
          data-promoted-primary={promoteSecondary ? '' : undefined}
        >
          <PromotedHeaderActionContext.Provider value={promoteSecondary}>
            {effectivePrimaryAction}
          </PromotedHeaderActionContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

function MobileHeaderOverflow({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <AppHeaderIconButton aria-label="More page actions">
              <MoreHorizontal className="h-4 w-4" />
            </AppHeaderIconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>More</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="mobile-header-overflow w-64 space-y-2 p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function countMobileActions(node: ReactNode): number {
  if (node == null || typeof node === 'boolean') return 0;
  if (Array.isArray(node)) {
    return node.reduce((total, child) => total + countMobileActions(child), 0);
  }
  if (!isValidElement(node)) return 1;

  // Transparent grouping elements should not consume an action slot of their
  // own. Count their controls so dense editor groups can collapse as a unit.
  if (node.type === Fragment || node.type === 'div' || node.type === 'span') {
    return Children.toArray(node.props.children).reduce(
      (total, child) => total + countMobileActions(child),
      0,
    );
  }

  return 1;
}

function MobileHeaderTools({
  modeNavigation,
  search,
  filters,
  combinedQuery,
  status,
  secondaryAction,
  primaryAction,
}: ResponsiveHeaderToolsProps) {
  const promoteSecondary = Boolean(
    secondaryAction && !primaryAction && countMobileActions(secondaryAction) === 1,
  );
  const effectiveSecondaryAction = promoteSecondary ? null : secondaryAction;
  const effectivePrimaryAction = primaryAction ?? (promoteSecondary ? secondaryAction : null);
  const preferredQuery = combinedQuery ?? search ?? filters;
  const extraQuery = combinedQuery ? null : search && filters ? filters : null;
  const visibleContext = modeNavigation ?? preferredQuery;
  const overflowQuery = modeNavigation ? preferredQuery : extraQuery;
  const hasVisibleContext = Boolean(visibleContext);
  const secondaryActionCount = countMobileActions(effectiveSecondaryAction);
  const overflowSecondary = effectiveSecondaryAction && effectivePrimaryAction && secondaryActionCount > 1
    ? effectiveSecondaryAction
    : null;
  const showSecondaryDirectly = Boolean(effectiveSecondaryAction && !overflowSecondary);
  // Entity state already hands off to the detail header on compact layouts.
  // Keep it in the sticky row only when it is the sole page-level context;
  // otherwise action space and an intact page title take priority.
  const showStatusDirectly = Boolean(
    status && !effectivePrimaryAction && !effectiveSecondaryAction && !hasVisibleContext,
  );
  const hasOverflow = Boolean(overflowQuery || overflowSecondary);

  return (
    <div className="mobile-header-tools" data-mobile-header-tools>
      {visibleContext ? <div className="mobile-header-tools__context">{visibleContext}</div> : null}
      {showStatusDirectly ? <div className="mobile-header-tools__status">{status}</div> : null}
      {showSecondaryDirectly ? (
        <div className="mobile-header-tools__secondary">{effectiveSecondaryAction}</div>
      ) : null}
      {hasOverflow ? (
        <MobileHeaderOverflow>
          {overflowQuery ? <div className="mobile-header-overflow__query">{overflowQuery}</div> : null}
          {overflowSecondary ? (
            <div className="mobile-header-overflow__action grid gap-2">{overflowSecondary}</div>
          ) : null}
        </MobileHeaderOverflow>
      ) : null}
      {effectivePrimaryAction ? (
        <div
          className={cn('mobile-header-tools__primary', promoteSecondary && 'header-action-promoted-primary')}
          data-promoted-primary={promoteSecondary ? '' : undefined}
        >
          <PromotedHeaderActionContext.Provider value={promoteSecondary}>
            {effectivePrimaryAction}
          </PromotedHeaderActionContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

/** Legacy desktop-only renderer retained while pages migrate to one responsive command spec. */
export function DesktopHeaderTools(props: DesktopHeaderToolsProps) {
  return (
    <div className="desktop-header-tools" data-desktop-header-tools>
      <HeaderToolsLane {...props} />
    </div>
  );
}

/**
 * One command declaration rendered in both the sticky mobile identity row and
 * the desktop shell lane. Compact children and action labels respond to the
 * actual space remaining beside the page title.
 */
export function ResponsiveHeaderTools(props: ResponsiveHeaderToolsProps) {
  return (
    <div
      className="desktop-header-tools desktop-header-tools--responsive"
      data-responsive-header-tools
    >
      <MobileHeaderTools {...props} />
      <div className="responsive-header-tools__desktop">
        <HeaderToolsLane {...props} />
      </div>
    </div>
  );
}

export function HeaderModeNavigation({
  value,
  onValueChange,
  items,
  label,
}: HeaderModeNavigationProps) {
  const [compactOpen, setCompactOpen] = useState(false);
  const activeItem = items.find((item) => item.value === value) ?? items[0];

  if (!activeItem) return null;

  const ActiveIcon = activeItem.icon;

  return (
    <>
      <div className="desktop-header-mode__tabs">
        <Tabs value={value} onValueChange={onValueChange}>
          <IconTabsList aria-label={label} className="gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <IconTabsTrigger
                  key={item.value}
                  value={item.value}
                  aria-label={item.label}
                  className="gap-0.5 px-1"
                >
                  <Icon className="h-4 w-4" />
                  <span className="desktop-header-mode__label">{item.label}</span>
                </IconTabsTrigger>
              );
            })}
          </IconTabsList>
        </Tabs>
      </div>
      <div className="desktop-header-mode__compact">
        <Popover open={compactOpen} onOpenChange={setCompactOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <AppHeaderIconButton aria-label={`${label}: ${activeItem.label}`}>
                  <ActiveIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </AppHeaderIconButton>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{activeItem.label}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-56 p-2">
            <div role="radiogroup" aria-label={label} className="space-y-1">
              {items.map((item) => (
                <NavigationRow
                  key={item.value}
                  role="radio"
                  aria-checked={item.value === value}
                  active={item.value === value}
                  icon={item.icon}
                  onClick={() => {
                    onValueChange(item.value);
                    setCompactOpen(false);
                  }}
                >
                  {item.label}
                </NavigationRow>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

export function HeaderSearch({
  value,
  onChange,
  label,
  placeholder = 'Search',
  width = 'default',
}: HeaderSearchProps) {
  const input = (compact = false) => (
    <div
      className={cn(
        'relative',
        compact ? 'w-full' : 'w-44 xl:w-56',
        !compact && width === 'wide' && 'desktop-header-search__wide',
      )}
    >
      <SearchField
        label={label}
        placeholder={placeholder}
        value={value}
        onValueChange={onChange}
        className="bg-muted/20 font-raleway focus:bg-background"
      />
    </div>
  );

  return (
    <>
      <div className="desktop-header-search__full">{input()}</div>
      <div className="desktop-header-search__label">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-11 min-w-11 px-3" aria-label={label}>
              <Search aria-hidden="true" className="h-4 w-4" />
              <span>Search</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            {input(true)}
          </PopoverContent>
        </Popover>
      </div>
      <div className="desktop-header-search__compact">
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <AppHeaderIconButton aria-label={label}>
                  <Search className="h-4 w-4" />
                </AppHeaderIconButton>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-72">
            {input(true)}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span data-badge className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">
      {count}
    </span>
  );
}

export function HeaderFilters({
  children,
  compactChildren,
  compactLabel,
  label,
  activeCount = 0,
  preferExpanded = false,
}: HeaderFiltersProps) {
  return (
    <>
      <div
        className={cn(
          'desktop-header-filters__full',
          preferExpanded === true && 'desktop-header-filters__full--priority',
          preferExpanded === 'when-roomy' && 'desktop-header-filters__full--roomy',
          preferExpanded === 'wide-lane' && 'desktop-header-filters__full--wide-lane',
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          'desktop-header-filters__compact',
          preferExpanded === true && 'desktop-header-filters__compact--priority',
          preferExpanded === 'when-roomy' && 'desktop-header-filters__compact--roomy',
          preferExpanded === 'wide-lane' && 'desktop-header-filters__compact--wide-lane',
        )}
      >
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                {compactLabel ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="relative h-11 min-w-11 gap-0.5 px-2 font-light"
                    aria-label={`${label}: ${compactLabel}`}
                  >
                    <span className="whitespace-nowrap">{compactLabel}</span>
                    <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                    <CountBadge count={activeCount} />
                  </Button>
                ) : (
                  <AppHeaderIconButton className="relative" aria-label={label}>
                    <Filter className="h-4 w-4" />
                    <CountBadge count={activeCount} />
                  </AppHeaderIconButton>
                )}
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="header-query-popover w-72 space-y-2">
            {compactChildren ?? children}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

export function HeaderCombinedQuery({
  value,
  onChange,
  label,
  placeholder = 'Search',
  children,
  activeCount = 0,
}: HeaderCombinedQueryProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <AppHeaderIconButton className="relative" aria-label={label}>
              <SlidersHorizontal className="h-4 w-4" />
              <CountBadge count={activeCount} />
            </AppHeaderIconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="header-query-popover w-72 space-y-2">
        <div>
          <SearchField
            label={label}
            placeholder={placeholder}
            value={value}
            onValueChange={onChange}
          />
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function HeaderRefreshAction({
  onClick,
  refreshing = false,
  label = 'Refresh',
  prominence = 'primary',
}: HeaderRefreshActionProps) {
  return (
    <HeaderAction
      label={refreshing ? 'Refreshing' : label}
      onClick={onClick}
      busy={refreshing}
      prominence={prominence}
      icon={(
        <RefreshCw
          aria-hidden="true"
          className={cn('h-4 w-4', refreshing && 'animate-spin')}
        />
      )}
    />
  );
}

export function HeaderAction({
  label,
  onClick,
  icon,
  disabled = false,
  busy = false,
  prominence = 'primary',
}: HeaderActionProps) {
  const promoted = useContext(PromotedHeaderActionContext);
  const effectiveProminence = promoted ? 'primary' : prominence;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          aria-label={label}
          aria-busy={busy ? 'true' : undefined}
          data-busy={busy ? '' : undefined}
          disabled={disabled || busy}
          onClick={onClick}
          variant={effectiveProminence === 'primary' ? 'default' : 'outline'}
          className={cn(
            'h-11 min-w-11 gap-2 px-3',
          )}
        >
          {icon}
          <HeaderActionLabel>{label}</HeaderActionLabel>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function HeaderActionLabel({ children }: { children: ReactNode }) {
  return <span className="desktop-header-action-label whitespace-nowrap">{children}</span>;
}
