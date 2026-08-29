import type { ChangeEvent, ReactNode } from 'react';
import { Filter, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { AppHeaderIconButton } from '@/components/ui/app-header-icon-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface DesktopHeaderToolsProps {
  search?: ReactNode;
  filters?: ReactNode;
  combinedQuery?: ReactNode;
  secondaryAction?: ReactNode;
  primaryAction?: ReactNode;
}

interface HeaderSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

interface HeaderFiltersProps {
  children: ReactNode;
  compactChildren?: ReactNode;
  label: string;
  activeCount?: number;
  /**
   * Surfaces a high-value scope control before the complete filter lane fits.
   * `true` is the first control to expose; `when-roomy` is for a useful second
   * control that should wait until the compact command lane can hold it.
   */
  preferExpanded?: boolean | 'when-roomy';
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
  prominence?: 'primary' | 'secondary';
}

/**
 * One non-wrapping desktop command lane. Named slots preserve the order
 * search -> filters -> secondary -> primary, with primary nearest global chrome.
 */
export function DesktopHeaderTools({
  search,
  filters,
  combinedQuery,
  secondaryAction,
  primaryAction,
}: DesktopHeaderToolsProps) {
  return (
    <div className="desktop-header-tools" data-desktop-header-tools>
      <div className="desktop-header-tools__lane">
        {combinedQuery ? (
          <div className="desktop-header-tools__combined-query">{combinedQuery}</div>
        ) : null}
        {search ? <div className="desktop-header-tools__search">{search}</div> : null}
        {filters ? <div className="desktop-header-tools__filters">{filters}</div> : null}
        {secondaryAction ? (
          <div className="desktop-header-tools__secondary">{secondaryAction}</div>
        ) : null}
        {primaryAction ? (
          <div className="desktop-header-tools__primary">{primaryAction}</div>
        ) : null}
      </div>
    </div>
  );
}

export function HeaderSearch({ value, onChange, label, placeholder = 'Search' }: HeaderSearchProps) {
  const input = (compact = false) => (
    <div className={cn('relative', compact ? 'w-full' : 'w-44 xl:w-56')}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className="h-11 bg-muted/20 pl-10 font-raleway focus:bg-background"
      />
    </div>
  );

  return (
    <>
      <div className="desktop-header-search__full">{input()}</div>
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
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          'desktop-header-filters__compact',
          preferExpanded === true && 'desktop-header-filters__compact--priority',
          preferExpanded === 'when-roomy' && 'desktop-header-filters__compact--roomy',
        )}
      >
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <AppHeaderIconButton className="relative" aria-label={label}>
                  <Filter className="h-4 w-4" />
                  <CountBadge count={activeCount} />
                </AppHeaderIconButton>
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={label}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-11 pl-10"
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
      label={label}
      onClick={onClick}
      disabled={refreshing}
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
  prominence = 'primary',
}: HeaderActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          variant={prominence === 'primary' ? 'default' : 'outline'}
          className={cn(
            'h-11 min-w-11 gap-2 px-3 font-light',
            prominence === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
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
