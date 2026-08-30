import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  Receipt,
  FileSignature,
  Map,
  Users,
  ChevronDown,
  TrendingUp,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

export interface ModuleWidgetProps {
  title: string
  description?: string
  icon: React.ElementType
  iconColor?: string
  primaryStat: string | number
  primaryStatLabel?: string
  primaryStatColor?: string
  secondaryStats?: Array<{
    label: string
    value: string | number
    color?: string
  }>
  recentItems?: Array<{
    id: string
    title: string
    subtitle?: string
    status?: {
      label: string
      color: string
    }
  }>
  loading?: boolean
  action?: {
    label: string
    compactLabel?: string
    onClick: () => void
  }
  className?: string
  compact?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  emptyListMessage?: string
}

export function ModuleWidget({
  title,
  description,
  icon: Icon,
  iconColor,
  primaryStat,
  primaryStatLabel,
  primaryStatColor,
  secondaryStats,
  recentItems,
  loading,
  action,
  className,
  compact = false,
  isCollapsed = false,
  onToggleCollapse,
  emptyListMessage,
}: ModuleWidgetProps) {
  const [isOpen, setIsOpen] = useState(!isCollapsed);

  useEffect(() => {
    setIsOpen(!isCollapsed);
  }, [isCollapsed]);

  if (loading) {
    return (
      <Card surface="inset" className={cn('h-full', className)}>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

const hasRecentItems = recentItems !== undefined;
  const hasItems = recentItems && recentItems.length > 0;

  if (hasRecentItems) {
    return (
      <Collapsible
        open={compact ? false : isOpen}
        onOpenChange={(nextIsOpen) => {
          if (compact) return;
          setIsOpen(nextIsOpen);
          onToggleCollapse?.();
        }}
      >
        <Card surface="inset" className={cn('h-full', className)}>
          <CardHeader data-module-widget-card-header>
            <div
              className="flex items-start justify-between gap-2"
              data-module-widget-header
            >
              <div className="flex items-center gap-3">
                <div
                  className="rounded-lg bg-muted p-2 min-[1280px]:max-[1399px]:hidden"
                  data-module-widget-icon
                >
                  <Icon className={cn("h-5 w-5", iconColor || "text-blue-600 dark:text-blue-400")} />
                </div>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  {description && <CardDescription>{description}</CardDescription>}
                </div>
              </div>
              <div className="flex items-center gap-1" data-module-widget-actions>
                {!compact && (
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Toggle collapse"
                      data-module-widget-toggle
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          isOpen ? "" : "transform rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                )}
                {action && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/20"
                    onClick={action.onClick}
                    aria-label={action.label}
                    data-module-widget-action
                  >
                    {action.compactLabel ? (
                      <>
                        <span aria-hidden="true" className="min-[1750px]:hidden">
                          {action.compactLabel}
                        </span>
                        <span aria-hidden="true" className="hidden min-[1750px]:inline">
                          {action.label}
                        </span>
                      </>
                    ) : action.label}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-4">
              <span className={cn('text-3xl font-bold', primaryStatColor || 'text-foreground')}>
                {typeof primaryStat === 'number' ? primaryStat.toLocaleString() : primaryStat}
              </span>
              {primaryStatLabel && (
                <span className="text-sm text-muted-foreground">{primaryStatLabel}</span>
              )}
            </div>

            {secondaryStats && secondaryStats.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {secondaryStats.map((stat, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                    data-module-widget-secondary-stat
                  >
                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                    <span className={cn('text-sm font-medium', stat.color)}>{stat.value}</span>
                  </div>
                ))}
              </div>
            )}

            <CollapsibleContent>
              {hasItems ? (
                <div className="space-y-2 border-t pt-4">
                  {recentItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                      {item.status && (
                        <Badge variant="outline" className={cn('text-xs', item.status.color)}>
                          {item.status.label}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Icon}
                  kind="inline"
                  title={emptyListMessage || `No ${title.toLowerCase()} yet`}
                  className="border-t pt-4"
                />
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    )
  }

  return (
    <Card surface="inset" className={cn('h-full', className)}>
      <CardHeader data-module-widget-card-header>
        <div
          className="flex items-start justify-between gap-2"
          data-module-widget-header
        >
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg bg-muted p-2 min-[1280px]:max-[1399px]:hidden"
              data-module-widget-icon
            >
              <Icon className={cn("h-5 w-5", iconColor || "text-blue-600 dark:text-blue-400")} />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
          </div>
          <div className="flex items-center gap-1" data-module-widget-actions>
            {action && (
              <Button
                size="sm"
                variant="ghost"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/20"
                onClick={action.onClick}
                aria-label={action.label}
                data-module-widget-action
              >
                {action.compactLabel ? (
                  <>
                    <span aria-hidden="true" className="min-[1750px]:hidden">
                      {action.compactLabel}
                    </span>
                    <span aria-hidden="true" className="hidden min-[1750px]:inline">
                      {action.label}
                    </span>
                  </>
                ) : action.label}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mb-4">
          <span className={cn('text-3xl font-bold', primaryStatColor || 'text-foreground')}>
            {typeof primaryStat === 'number' ? primaryStat.toLocaleString() : primaryStat}
          </span>
          {primaryStatLabel && (
            <span className="text-sm text-muted-foreground">{primaryStatLabel}</span>
          )}
        </div>

        {secondaryStats && secondaryStats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {secondaryStats.map((stat, i) => (
              <div
                key={i}
                className="flex items-center justify-between"
                data-module-widget-secondary-stat
              >
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <span className={cn('text-sm font-medium', stat.color)}>{stat.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}



// Pre-configured widgets for common modules

type PresetWidgetProps = Omit<ModuleWidgetProps, 'icon' | 'iconColor' | 'title'>

export function InvoicesWidget(props: PresetWidgetProps) {
  return (
    <ModuleWidget
      icon={Receipt}
      title="Invoices"
      primaryStat={props.primaryStat}
      primaryStatLabel="Pending"
      {...props}
    />
  )
}

export function SignaturesWidget(props: PresetWidgetProps) {
  return (
    <ModuleWidget
      icon={FileSignature}
      title="Signatures"
      primaryStat={props.primaryStat}
      primaryStatLabel="Awaiting"
      {...props}
    />
  )
}

export function WorkspaceWidget(props: PresetWidgetProps) {
  return (
    <ModuleWidget
      icon={Map}
      title="Workspace"
      primaryStat={props.primaryStat}
      primaryStatLabel={props.primaryStatLabel || 'Active Items'}
      {...props}
    />
  )
}

export function ContactsWidget(props: PresetWidgetProps) {
  return (
    <ModuleWidget
      icon={Users}
      title="Contacts"
      primaryStat={props.primaryStat}
      primaryStatLabel="This Week"
      {...props}
    />
  )
}

export function DealsWidget(props: PresetWidgetProps) {
  return (
    <ModuleWidget
      icon={TrendingUp}
      title="Deals"
      primaryStat={props.primaryStat}
      primaryStatLabel="Open"
      {...props}
    />
  )
}
