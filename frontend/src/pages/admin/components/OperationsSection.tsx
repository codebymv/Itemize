import { useCallback, useEffect, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
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
};

function badgeVariant(
    status: adminApi.AdminOperationalStatus,
    required = false,
): BadgeProps['variant'] {
    if (status === 'healthy' || status === 'operational' || status === 'configured') return 'success';
    if (status === 'action_required' || (status === 'incomplete' && required)) return 'destructive';
    if (status === 'degraded' || status === 'incomplete') return 'warning';
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

export default function OperationsSection() {
    const [snapshot, setSnapshot] = useState<adminApi.OperationsSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                <MetricCard label="Active jobs" value={snapshot.activeJobs} icon={Activity} tone="blue" />
                <MetricCard label="Retrying" value={snapshot.retryingJobs} icon={RefreshCw} tone="orange" />
                <MetricCard label="Failed jobs" value={snapshot.actionRequiredJobs} icon={AlertTriangle} tone="red" />
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
                    <p className="text-sm text-muted-foreground">Current queue state; pending work older than 15 minutes is degraded.</p>
                </div>

                <Card className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Queue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Queued</TableHead>
                                <TableHead className="text-right">Processing</TableHead>
                                <TableHead className="text-right">Retrying</TableHead>
                                <TableHead className="text-right">Action required</TableHead>
                                <TableHead className="text-right">Oldest pending</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {snapshot.queues.map((queue) => (
                                <TableRow key={queue.id}>
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
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>

                <div className="grid gap-3 md:hidden">
                    {snapshot.queues.map((queue) => (
                        <Card key={queue.id}>
                            <CardContent className="space-y-3 p-4">
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
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    Oldest pending: {queue.available ? pendingAge(queue.oldestPendingAt) : 'Unavailable'}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    );
}
