import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, isThisWeek, isToday } from 'date-fns';
import {
  AlertTriangle,
  Bell,
  BadgeCheck,
  Check,
  CircleDollarSign,
  FileCheck2,
  FileSignature,
  Inbox,
  Loader2,
  Eye,
  Sparkles,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrganization } from '@/hooks/useOrganization';
import { getApiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  AppNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsSeen,
} from '@/services/notificationsGraphql';

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
  if (notification.eventType === 'account.welcome') {
    return <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />;
  }
  if (notification.eventType === 'subscription.plan_changed') {
    return <BadgeCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />;
  }
  if (notification.eventType.endsWith('.viewed')) {
    return <Eye className="h-4 w-4 text-blue-600" aria-hidden="true" />;
  }
  if (notification.eventType === 'invoice.paid') {
    return <CircleDollarSign className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  }
  if (notification.entityType === 'signature') {
    return <FileSignature className="h-4 w-4 text-blue-600" aria-hidden="true" />;
  }
  if (notification.eventType.endsWith('.declined')) {
    return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  }
  if (notification.entityType === 'estimate') {
    return <FileCheck2 className="h-4 w-4 text-blue-600" aria-hidden="true" />;
  }
  return <Bell className="h-4 w-4 text-blue-600" aria-hidden="true" />;
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className={cn(
        'flex items-center justify-between border-b px-4 py-3',
        reserveCloseSpace && 'pr-12',
      )}>
        <ResponsivePageHeading
          title="Notifications"
          icon={<Bell className="h-4 w-4 text-blue-600" aria-hidden="true" />}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="gap-1.5 text-xs"
        >
          <Check className="h-3.5 w-3.5" />
          Mark all read
        </Button>
      </div>

      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as NotificationFilter)}
        className="border-b px-4 py-2"
      >
        <TabsList className="h-8">
          <TabsTrigger value="all" className="h-7 px-3 text-xs">All</TabsTrigger>
          <TabsTrigger value="unread" className="h-7 px-3 text-xs">Unread</TabsTrigger>
        </TabsList>
      </Tabs>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading notifications" />
          </div>
        ) : isError ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="rounded-full bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium">Notifications unavailable</p>
              <p className="mt-1 max-w-64 text-xs text-muted-foreground">
                We could not load your activity. Please try again.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="rounded-full bg-muted p-3">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">
              {filter === 'unread' ? 'No unread notifications' : 'Nothing new yet'}
            </p>
            <p className="max-w-64 text-xs text-muted-foreground">
              Important activity from estimates, invoices, signatures, and your account will appear here.
            </p>
          </div>
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
                      'group flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600',
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
                          {notification.title}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                          {notification.body}
                        </span>
                      </span>
                      <span className="flex min-h-full flex-col items-end justify-between gap-2">
                        {!notification.readAt && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                        )}
                        <span className="whitespace-nowrap text-right text-[11px] leading-4 text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
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
    refetchInterval: 60_000,
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
    onSuccess: invalidate,
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
    const socket = io(getApiUrl(), {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socket.on('connect', () => socket.emit('joinUserNotifications'));
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
    return () => socket.disconnect();
    // Reconnect only when the active organization changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, toast]);

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-8 w-8 shrink-0"
      aria-label={unseenCount > 0
        ? `Notifications, ${unseenCount} new`
        : 'Notifications'}
    >
      <Bell className="h-4 w-4" />
      {unseenCount > 0 && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {unseenCount > 99 ? '99+' : unseenCount}
        </span>
      )}
    </Button>
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
      <PopoverContent align="end" sideOffset={8} className="h-[min(620px,calc(100vh-5rem))] w-[400px] overflow-hidden p-0">
        {renderPanel()}
      </PopoverContent>
    </Popover>
  );
}
