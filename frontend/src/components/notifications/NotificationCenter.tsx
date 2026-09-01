import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isThisWeek, isToday } from 'date-fns';
import {
  ArrowRightLeft,
  Bell,
  Building2,
  Check,
  CircleCheckBig,
  CircleDollarSign,
  CircleX,
  CreditCard,
  FileCheck2,
  FileSignature,
  Inbox,
  Loader2,
  Eye,
  MessageSquareText,
  MessageSquareWarning,
  ReceiptText,
  Undo2,
  UsersRound,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { AppHeaderIconButton } from '@/components/ui/app-header-icon-button';
import { ResponsivePageHeading } from '@/components/layout/ResponsivePageHeading';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToastAction } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrganization } from '@/hooks/useOrganization';
import { getApiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { visibleRefetchInterval } from '@/lib/queryPolicy';
import {
  AppNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsSeen,
} from '@/services/notificationsGraphql';
import {
  formatNotificationAge,
  getNotificationDisplayBody,
  getNotificationDisplayTitle,
  getNotificationIconKind,
} from './notificationDisplay';
import { CommunicationChannelMark } from '@/components/communications/CommunicationChannelMark';

const PAGE_SIZE = 25;

type NotificationFilter = 'all' | 'unread';

type RealtimeNotification = {
  organizationId?: number;
  notification?: AppNotification;
};

function notificationGroup(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return 'Today';
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'This week';
  return 'Earlier';
}

function NotificationIcon({ notification }: { notification: AppNotification }) {
  if (notification.eventType.startsWith('communication.')) {
    const channel = typeof notification.payload.channel === 'string'
      ? notification.payload.channel
      : undefined;
    if (channel) {
      return <CommunicationChannelMark channel={channel} className="h-4 w-4" />;
    }
  }
  switch (getNotificationIconKind(notification)) {
    case 'itemize':
      return (
        <img
          src="/icon.png"
          alt=""
          aria-hidden="true"
          className="h-[18px] w-6 max-w-none object-contain"
        />
      );
    case 'viewed':
      return <Eye className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'subscription':
      return <CreditCard className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'paid':
      return <CircleDollarSign className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    case 'refunded':
      return <Undo2 className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
    case 'accepted':
      return <CircleCheckBig className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    case 'declined':
      return <CircleX className="h-4 w-4 text-destructive" aria-hidden="true" />;
    case 'signed':
      return <FileSignature className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    case 'signature':
      return <FileSignature className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'ownership-transfer':
      return <ArrowRightLeft className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'organization-people':
      return <UsersRound className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'organization':
      return <Building2 className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'estimate':
      return <FileCheck2 className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'billing':
      return <ReceiptText className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'communication':
      return <MessageSquareText className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
    case 'communication-failed':
      return <MessageSquareWarning className="h-4 w-4 text-destructive" aria-hidden="true" />;
    default:
      return <Bell className="h-4 w-4 text-blue-600" aria-hidden="true" />;
  }
}

function NotificationPanel({
  reserveCloseSpace,
  filter,
  setFilter,
  notifications,
  unreadCount,
  isLoading,
  isError,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onRetry,
  onRead,
  onMarkAllRead,
  isMarkingAllRead,
}: {
  reserveCloseSpace?: boolean;
  filter: NotificationFilter;
  setFilter: (filter: NotificationFilter) => void;
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  onRetry: () => void;
  onRead: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  isMarkingAllRead: boolean;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) fetchNextPage();
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  let previousGroup = '';
  const markAllUnavailable = unreadCount === 0 || isMarkingAllRead;
  const markAllLabel = isMarkingAllRead
    ? 'Marking all notifications as read'
    : unreadCount === 0
      ? 'Everything is read'
      : 'Mark all as read';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className={cn(
        'flex flex-wrap items-center gap-2 border-b px-3 py-3',
        reserveCloseSpace && 'pr-12',
      )}>
        <div className="min-w-0 shrink-0">
          <ResponsivePageHeading
            title="NOTIFICATIONS"
            icon={<Bell className="h-4 w-4 text-blue-600" aria-hidden="true" />}
            className="w-auto md:ml-0"
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as NotificationFilter)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="all" className="h-7 px-3 text-xs">All</TabsTrigger>
              <TabsTrigger value="unread" className="h-7 px-3 text-xs">Unread</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-disabled={markAllUnavailable}
                aria-label={markAllLabel}
                onClick={() => {
                  if (!markAllUnavailable) onMarkAllRead();
                }}
                className="h-8 w-8 shrink-0 text-muted-foreground aria-disabled:cursor-default aria-disabled:opacity-50"
              >
                {isMarkingAllRead ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{markAllLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading notifications" />
          </div>
        ) : isError ? (
          <ErrorState
            kind="inline"
            title="Notifications unavailable"
            description="We couldn't load your activity. Try again."
            onAction={onRetry}
            className="min-h-56"
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Inbox}
            kind="inline"
            title={filter === 'unread' ? 'No unread notifications' : 'Nothing new yet'}
            className="min-h-56"
          />
        ) : (
          <div className="pb-2">
            {notifications.map((notification) => {
              const group = notificationGroup(notification.createdAt);
              const showGroup = group !== previousGroup;
              previousGroup = group;
              return (
                <div key={notification.id}>
                  {showGroup && (
                    <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {group}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => onRead(notification)}
                    className={cn(
                      'interaction-row group flex w-full gap-3 border-b px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600',
                      !notification.readAt && 'bg-blue-600/[0.06]',
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <NotificationIcon notification={notification} />
                    </span>
                    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                      <span className="min-w-0">
                        <span className={cn(
                          'block text-sm leading-5',
                          !notification.readAt ? 'font-semibold' : 'font-medium',
                        )}>
                          {getNotificationDisplayTitle(notification)}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                          {getNotificationDisplayBody(notification)}
                        </span>
                      </span>
                      <span className="flex min-h-full flex-col items-end justify-between gap-2">
                        {!notification.readAt && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                        )}
                        <span className="whitespace-nowrap text-right text-[11px] leading-4 text-muted-foreground">
                          {formatNotificationAge(notification.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
            <div ref={sentinel} className="flex h-10 items-center justify-center">
              {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function NotificationCenter() {
  const isMobile = useIsMobile();
  const { organizationId } = useOrganization();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const queryKey = ['notification-center', organizationId, filter] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getNotifications(organizationId as number, {
      first: PAGE_SIZE,
      after: pageParam,
      unreadOnly: filter === 'unread',
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.pageInfo.hasNextPage
      ? page.pageInfo.endCursor
      : undefined,
    enabled: organizationId !== null,
    refetchInterval: () => visibleRefetchInterval(60_000),
    refetchIntervalInBackground: false,
  });

  const notifications = useMemo(() => {
    const byId = new Map<string, AppNotification>();
    for (const page of query.data?.pages ?? []) {
      for (const notification of page.nodes) byId.set(notification.id, notification);
    }
    return [...byId.values()];
  }, [query.data]);
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const unseenCount = query.data?.pages[0]?.unseenCount ?? 0;

  const invalidate = () => queryClient.invalidateQueries({
    queryKey: ['notification-center', organizationId],
  });

  const seenMutation = useMutation({
    mutationFn: () => markNotificationsSeen(organizationId as number),
    onSuccess: invalidate,
  });
  const readMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(
      organizationId as number,
      notificationId,
    ),
    onSuccess: invalidate,
  });
  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(organizationId as number),
    onSuccess: () => {
      void invalidate();
      toast({ title: 'All notifications marked as read' });
    },
    onError: () => {
      toast({
        title: 'Could not mark notifications as read',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && unseenCount > 0 && !seenMutation.isPending) {
      seenMutation.mutate();
    }
  };

  const handleRead = (notification: AppNotification) => {
    if (!notification.readAt) readMutation.mutate(notification.id);
    setOpen(false);
    if (notification.href) navigate(notification.href);
  };

  useEffect(() => {
    if (!organizationId) return;
    const params = new URLSearchParams(location.search);
    const notificationId = params.get('notification');
    if (!notificationId || !/^[1-9]\d*$/.test(notificationId)) return;
    let cancelled = false;
    void markNotificationRead(organizationId, notificationId)
      .then(() => {
        if (cancelled) return;
        params.delete('notification');
        navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
        void invalidate();
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // The deep-link mutation must only run when the URL or organization changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, navigate, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    let socket: Socket | null = null;
    void import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      socket = io(getApiUrl(), {
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });
      socket.on('connect', () => socket?.emit('joinUserNotifications'));
      socket.on('notificationCreated', (event: RealtimeNotification) => {
        if (Number(event.organizationId) !== organizationId || !event.notification) return;
        void invalidate();
        toast({
          title: event.notification.title,
          description: event.notification.body,
          ...(event.notification.href ? {
            action: (
              <ToastAction
                altText="View notification"
                variant="primary"
                onClick={() => handleRead(event.notification as AppNotification)}
              >
                View
              </ToastAction>
            ),
          } : {}),
        });
      });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
    // Reconnect only when the active organization changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, toast]);

  const trigger = (
    <AppHeaderIconButton
      className="relative"
      aria-label={unseenCount > 0
        ? `Notifications, ${unseenCount} new`
        : 'Notifications'}
    >
      <Bell className="h-4 w-4" />
      {unseenCount > 0 && (
        <span data-badge className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {unseenCount > 99 ? '99+' : unseenCount}
        </span>
      )}
    </AppHeaderIconButton>
  );

  const renderPanel = (reserveCloseSpace = false) => (
    <NotificationPanel
      reserveCloseSpace={reserveCloseSpace}
      filter={filter}
      setFilter={setFilter}
      notifications={notifications}
      unreadCount={unreadCount}
      isLoading={query.isLoading}
      isError={query.isError}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={Boolean(query.hasNextPage)}
      fetchNextPage={() => { void query.fetchNextPage(); }}
      onRetry={() => { void query.refetch(); }}
      onRead={handleRead}
      onMarkAllRead={() => markAllMutation.mutate()}
      isMarkingAllRead={markAllMutation.isPending}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="right" className="w-full max-w-none p-0 sm:max-w-sm">
          <VisuallyHidden>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>
              Review recent account activity and unread notifications.
            </SheetDescription>
          </VisuallyHidden>
          {renderPanel(true)}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="h-[min(620px,calc(100vh-5rem))] w-[400px] overflow-hidden p-0"
      >
        {renderPanel()}
      </PopoverContent>
    </Popover>
  );
}
