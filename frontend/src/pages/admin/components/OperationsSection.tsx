import { Fragment, useCallback, useEffect, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
    CreditCard,
    Database,
    HardDrive,
    Loader2,
    Mail,
    MessageSquare,
    RefreshCw,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import * as adminApi from '@/services/adminApi';

const providerIcons: Record<string, typeof Activity> = {
    database: Database,
    resend: Mail,
    stripe: CreditCard,
    s3: HardDrive,
    twilio: MessageSquare,
    clamav: ShieldCheck,
    gemini: Sparkles,
};

const labels: Record<string, string> = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    action_required: 'Action required',
    operational: 'Operational',
    configured: 'Configured',
    incomplete: 'Incomplete',
    disabled: 'Disabled',
    queued: 'Queued',
    pending: 'Pending',
    processing: 'Processing',
    retry: 'Retrying',
    failed: 'Failed',
    dead_letter: 'Needs review',
    reconciliation_required: 'Reconciliation required',
};

const detailBuckets: { id: adminApi.JobQueueBucket; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'queued', label: 'Queued' },
    { id: 'processing', label: 'Processing' },
    { id: 'retrying', label: 'Retrying' },
    { id: 'action_required', label: 'Needs review' },
];

function badgeVariant(
    status: adminApi.AdminOperationalStatus,
    required = false,
): BadgeProps['variant'] {
    if (status === 'healthy' || status === 'operational' || status === 'configured') return 'success';
    if (status === 'action_required' || (status === 'incomplete' && required)) return 'destructive';
    if (status === 'degraded' || status === 'incomplete') return 'warning';
    return 'secondary';
}

function jobBadgeVariant(status: string): BadgeProps['variant'] {
    if (status === 'failed' || status === 'dead_letter' || status === 'reconciliation_required') {
        return 'destructive';
    }
    if (status === 'retry') return 'warning';
    if (status === 'processing') return 'default';
    return 'secondary';
}

function pendingAge(value: string | null): string {
    if (!value) return '—';
    const elapsed = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(elapsed) || elapsed < 0) return 'Just now';
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return 'Under a minute';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function timestamp(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '—';
}

function compactTimestamp(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(value));
}

function bucketCount(queue: adminApi.JobQueueHealth, bucket: adminApi.JobQueueBucket): number {
    if (bucket === 'queued') return queue.queued;
    if (bucket === 'processing') return queue.processing;
    if (bucket === 'retrying') return queue.retrying;
    if (bucket === 'action_required') return queue.actionRequired;
    return queue.active + queue.actionRequired;
}

function kindLabel(value: string): string {
    return value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricCard({
    label,
    value,
    icon: Icon,
    tone,
}: {
    label: string;
    value: string | number;
    icon: typeof Activity;
    tone: 'blue' | 'green' | 'orange' | 'red';
}) {
    const tones = {
        blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
        green: 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-300',
        orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300',
        red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300',
    };
    return (
        <Card>
            <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tones[tone])}>
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}

function QueueDetailsPanel({
    queue,
    details,
    loading,
    error,
    bucket,
    onBucketChange,
    onLoadMore,
}: {
    queue: adminApi.JobQueueHealth;
    details: adminApi.JobQueueDetails | null;
    loading: boolean;
    error: string | null;
    bucket: adminApi.JobQueueBucket;
    onBucketChange: (bucket: adminApi.JobQueueBucket) => void;
    onLoadMore: () => void;
}) {
    const noAttempts = queue.status === 'degraded'
        && queue.queued > 0
        && queue.processing === 0
        && queue.retrying === 0
        && Boolean(details?.items.length)
        && Boolean(details?.items.every((item) => item.attemptCount === 0));

    return (
        <div className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-medium">{queue.name} details</p>
                    <p className="text-xs text-muted-foreground">
                        Oldest outstanding jobs first. Payloads and recipient data are hidden.
                    </p>
                </div>
                {details && (
                    <p className="text-sm font-medium tabular-nums">
                        {details.total} {bucket === 'all' ? 'outstanding' : detailBuckets.find((item) => item.id === bucket)?.label.toLowerCase()}
                    </p>
                )}
            </div>

            <div className="responsive-card-rail flex gap-2 overflow-x-auto pb-1" aria-label={`${queue.name} detail filters`}>
                {detailBuckets.map((item) => {
                    const count = bucketCount(queue, item.id);
                    return (
                        <Button
                            key={item.id}
                            type="button"
                            size="sm"
                            variant={bucket === item.id ? 'default' : 'outline'}
                            className="shrink-0"
                            disabled={loading || count === 0}
                            onClick={() => onBucketChange(item.id)}
                        >
                            {item.label} <span className="ml-1 tabular-nums">{count}</span>
                        </Button>
                    );
                })}
            </div>

            {details && details.kindCounts.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By event type</p>
                    <div className="responsive-card-rail flex gap-2 overflow-x-auto pb-1">
                        {details.kindCounts.map((entry) => (
                            <Badge key={entry.kind} variant="outline" className="shrink-0 gap-1.5 py-1">
                                <span>{kindLabel(entry.kind)}</span>
                                <span className="tabular-nums text-muted-foreground">{entry.count}</span>
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {noAttempts && (
                <div className="flex gap-2 rounded-md border border-orange-300/70 bg-orange-50 p-3 text-sm text-orange-950 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="min-w-0">No delivery attempts are recorded. Confirm this queue&apos;s worker is enabled and running.</p>
                </div>
            )}

            {loading && !details && (
                <div className="flex h-24 items-center justify-center" aria-label={`Loading ${queue.name} details`}>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            )}

            {error && (
                <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</div>
            )}

            {!loading && details && details.items.length === 0 && (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No jobs in this state.
                </div>
            )}

            {details && details.items.length > 0 && (
                <>
                    <div className="hidden overflow-hidden rounded-md border 2xl:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Type / reference</TableHead>
                                    <TableHead>Pending</TableHead>
                                    <TableHead className="text-right">Attempts</TableHead>
                                    <TableHead>Next attempt</TableHead>
                                    <TableHead>Last error</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {details.items.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <p className="max-w-32 truncate font-mono text-xs" title={item.id}>#{item.id}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{timestamp(item.createdAt)}</p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={jobBadgeVariant(item.status)}>{labels[item.status] || item.status}</Badge>
                                        </TableCell>
                                        <TableCell className="max-w-44">
                                            <p className="truncate text-sm">{item.kind || item.reference || '—'}</p>
                                            {item.kind && item.reference && <p className="truncate text-xs text-muted-foreground">{item.reference}</p>}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{pendingAge(item.createdAt)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{item.attemptCount}</TableCell>
                                        <TableCell className="max-w-40 text-xs text-muted-foreground">{timestamp(item.nextAttemptAt)}</TableCell>
                                        <TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">
                                            {item.lastError || (item.leaseExpiresAt ? `Lease expires ${timestamp(item.leaseExpiresAt)}` : '—')}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="grid gap-2 2xl:hidden">
                        {details.items.map((item) => (
                            <div key={item.id} className="space-y-3 rounded-md border bg-background p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-mono text-xs" title={item.id}>Job #{item.id}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Pending {pendingAge(item.createdAt)}</p>
                                    </div>
                                    <Badge variant={jobBadgeVariant(item.status)}>{labels[item.status] || item.status}</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><p className="text-muted-foreground">Type / reference</p><p className="mt-0.5">{item.kind || item.reference || '—'}</p></div>
                                    <div><p className="text-muted-foreground">Attempts</p><p className="mt-0.5 tabular-nums">{item.attemptCount}</p></div>
                                    <div>
                                        <p className="text-muted-foreground">Created</p>
                                        <p className="mt-0.5" title={timestamp(item.createdAt)}>{compactTimestamp(item.createdAt)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Next attempt</p>
                                        <p className="mt-0.5" title={timestamp(item.nextAttemptAt)}>{compactTimestamp(item.nextAttemptAt)}</p>
                                    </div>
                                </div>
                                {item.lastError && <p className="break-words rounded bg-muted p-2 text-xs text-muted-foreground">{item.lastError}</p>}
                            </div>
                        ))}
                    </div>

                    {details.hasMore && (
                        <div className="flex justify-center">
                            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onLoadMore}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Load more
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function OperationsSection() {
    const [snapshot, setSnapshot] = useState<adminApi.OperationsSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedQueueId, setExpandedQueueId] = useState<string | null>(null);
    const [details, setDetails] = useState<adminApi.JobQueueDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [detailsBucket, setDetailsBucket] = useState<adminApi.JobQueueBucket>('all');

    const load = useCallback(async (refresh = false) => {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            setSnapshot(await adminApi.getOperationsSnapshot());
        } catch {
            setError('Unable to load production operations data.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const loadDetails = useCallback(async (
        queueId: string,
        bucket: adminApi.JobQueueBucket,
        append = false,
    ) => {
        setDetailsLoading(true);
        setDetailsError(null);
        try {
            const offset = append && details?.queueId === queueId && details.bucket === bucket
                ? details.items.length
                : 0;
            const next = await adminApi.getJobQueueDetails(queueId, bucket, 25, offset);
            setDetails((current) => append && current?.queueId === queueId && current.bucket === bucket
                ? { ...next, items: [...current.items, ...next.items] }
                : next);
        } catch {
            setDetailsError('Unable to load queue details.');
        } finally {
            setDetailsLoading(false);
        }
    }, [details]);

    const toggleQueue = (queueId: string) => {
        if (expandedQueueId === queueId) {
            setExpandedQueueId(null);
            return;
        }
        setExpandedQueueId(queueId);
        setDetails(null);
        setDetailsBucket('all');
        void loadDetails(queueId, 'all');
    };

    const changeBucket = (queueId: string, bucket: adminApi.JobQueueBucket) => {
        setDetailsBucket(bucket);
        setDetails(null);
        void loadDetails(queueId, bucket);
    };

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) {
        return (
            <div className="flex h-48 items-center justify-center" aria-label="Loading operations">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !snapshot) {
        return (
            <Card className="border-destructive/40">
                <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                    <div>
                        <p className="font-medium">Unable to load operations</p>
                        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                    </div>
                    <Button onClick={() => void load()} variant="outline">Try again</Button>
                </CardContent>
            </Card>
        );
    }

    const statusTone = snapshot.status === 'healthy'
        ? 'green'
        : snapshot.status === 'degraded'
            ? 'orange'
            : 'red';
    const queuePriority: Record<adminApi.AdminOperationalStatus, number> = {
        action_required: 0,
        degraded: 1,
        healthy: 2,
        operational: 3,
        configured: 3,
        incomplete: 3,
        disabled: 3,
    };
    const orderedQueues = [...snapshot.queues].sort(
        (left, right) => queuePriority[left.status] - queuePriority[right.status],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Last checked {new Date(snapshot.asOf).toLocaleString()}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={refreshing}
                    onClick={() => void load(true)}
                >
                    <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="System status"
                    value={labels[snapshot.status]}
                    icon={snapshot.status === 'healthy' ? CheckCircle2 : AlertTriangle}
                    tone={statusTone}
                />
                <MetricCard label="Outstanding jobs" value={snapshot.activeJobs} icon={Activity} tone="blue" />
                <MetricCard label="Retrying" value={snapshot.retryingJobs} icon={RefreshCw} tone="orange" />
                <MetricCard label="Needs review" value={snapshot.actionRequiredJobs} icon={AlertTriangle} tone="red" />
            </div>

            <section aria-labelledby="provider-health-heading" className="space-y-3">
                <h2 id="provider-health-heading" className="text-lg font-semibold font-raleway">Providers</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {snapshot.providers.map((provider) => {
                        const Icon = providerIcons[provider.id] || Activity;
                        return (
                            <Card key={provider.id}>
                                <CardContent className="flex gap-3 p-4">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-medium">{provider.name}</p>
                                            <Badge variant={badgeVariant(provider.status, provider.required)}>
                                                {labels[provider.status]}
                                            </Badge>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">{provider.detail}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            <section aria-labelledby="job-health-heading" className="space-y-3">
                <div>
                    <h2 id="job-health-heading" className="text-lg font-semibold font-raleway">Background jobs</h2>
                    <p className="text-sm text-muted-foreground">Outstanding work older than 15 minutes is degraded. Open a queue to inspect safe operational details.</p>
                </div>

                <Card className="hidden 2xl:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Queue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Queued</TableHead>
                                <TableHead className="text-right">Processing</TableHead>
                                <TableHead className="text-right">Retrying</TableHead>
                                <TableHead className="text-right">Needs review</TableHead>
                                <TableHead className="text-right">Oldest pending</TableHead>
                                <TableHead className="w-24"><span className="sr-only">Details</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orderedQueues.map((queue) => {
                                const expanded = expandedQueueId === queue.id;
                                return (
                                    <Fragment key={queue.id}>
                                        <TableRow>
                                            <TableCell className="font-medium">{queue.name}</TableCell>
                                            <TableCell>
                                                <Badge variant={badgeVariant(queue.status)}>{labels[queue.status]}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{queue.queued}</TableCell>
                                            <TableCell className="text-right tabular-nums">{queue.processing}</TableCell>
                                            <TableCell className="text-right tabular-nums">{queue.retrying}</TableCell>
                                            <TableCell className="text-right tabular-nums">{queue.actionRequired}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                {queue.available ? pendingAge(queue.oldestPendingAt) : 'Unavailable'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={!queue.available}
                                                    aria-expanded={expanded}
                                                    onClick={() => toggleQueue(queue.id)}
                                                >
                                                    {expanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                                                    Details
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                        {expanded && (
                                            <TableRow className="hover:bg-transparent">
                                                <TableCell colSpan={8} className="p-3">
                                                    <QueueDetailsPanel
                                                        queue={queue}
                                                        details={details?.queueId === queue.id ? details : null}
                                                        loading={detailsLoading}
                                                        error={detailsError}
                                                        bucket={detailsBucket}
                                                        onBucketChange={(bucket) => changeBucket(queue.id, bucket)}
                                                        onLoadMore={() => void loadDetails(queue.id, detailsBucket, true)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Card>

                <div className="grid gap-3 xl:grid-cols-2 2xl:hidden">
                    {orderedQueues.map((queue) => {
                        const expanded = expandedQueueId === queue.id;
                        return (
                            <Card key={queue.id} className={cn('min-w-0', expanded && 'xl:col-span-2')}>
                                <CardContent className="min-w-0 space-y-3 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium">{queue.name}</p>
                                        <Badge variant={badgeVariant(queue.status)}>{labels[queue.status]}</Badge>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                        <div><p className="font-semibold tabular-nums">{queue.queued}</p><p className="text-muted-foreground">Queued</p></div>
                                        <div><p className="font-semibold tabular-nums">{queue.processing}</p><p className="text-muted-foreground">Active</p></div>
                                        <div><p className="font-semibold tabular-nums">{queue.retrying}</p><p className="text-muted-foreground">Retry</p></div>
                                        <div><p className="font-semibold tabular-nums">{queue.actionRequired}</p><p className="text-muted-foreground">Review</p></div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Clock3 className="h-3.5 w-3.5" />
                                            Oldest: {queue.available ? pendingAge(queue.oldestPendingAt) : 'Unavailable'}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={!queue.available}
                                            aria-expanded={expanded}
                                            onClick={() => toggleQueue(queue.id)}
                                        >
                                            {expanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                                            Details
                                        </Button>
                                    </div>
                                    {expanded && (
                                        <QueueDetailsPanel
                                            queue={queue}
                                            details={details?.queueId === queue.id ? details : null}
                                            loading={detailsLoading}
                                            error={detailsError}
                                            bucket={detailsBucket}
                                            onBucketChange={(bucket) => changeBucket(queue.id, bucket)}
                                            onLoadMore={() => void loadDetails(queue.id, detailsBucket, true)}
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
