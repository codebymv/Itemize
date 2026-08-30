import React, { useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2 } from 'lucide-react';
import { getEmailLog, getEmailLogs, EmailLog } from '@/services/adminEmailApi';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

export interface EmailLogsViewHandle {
    refresh: () => void;
}

interface EmailLogsViewProps {
    onLoadingChange?: (loading: boolean) => void;
    onTotalChange?: (total: number) => void;
}

export const EmailLogsView = React.forwardRef<EmailLogsViewHandle, EmailLogsViewProps>(function EmailLogsView({
    onLoadingChange,
    onTotalChange,
}, ref) {
    const [logs, setLogs] = useState<EmailLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);
    const { toast } = useToast();

    const fetchLogs = useCallback(async (pageNum = 0) => {
        setLoading(true);
        setLoadError(false);
        onLoadingChange?.(true);
        try {
            const response = await getEmailLogs({ page: pageNum, limit: 25 });
            setLogs(response.logs);
            onTotalChange?.(response.total);
            setHasMore(response.hasMore);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
            onLoadingChange?.(false);
        }
    }, [onLoadingChange, onTotalChange]);

    useEffect(() => {
        void fetchLogs();
    }, [fetchLogs]);

    useImperativeHandle(ref, () => ({
        refresh: () => void fetchLogs(page),
    }), [fetchLogs, page]);

    const selectLog = async (log: EmailLog) => {
        setSelectedLog(log);
        try {
            const detail = await getEmailLog(log.id);
            setSelectedLog(current => current?.id === log.id ? detail : current);
        } catch {
            toast({ title: 'Error', description: 'Failed to load email content', variant: 'destructive' });
        }
    };

    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case 'sent':
            case 'delivered':
                return 'default';
            case 'opened':
            case 'clicked':
                return 'secondary';
            case 'failed':
            case 'bounced':
                return 'destructive';
            default:
                return 'outline';
        }
    };

    return (
        <>
            <div data-email-logs-content>
                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : loadError ? (
                    <ErrorState
                        kind="section"
                        icon={Mail}
                        title="Unable to load email logs"
                        description="We couldn't load the email log. Try again."
                        onRetry={() => void fetchLogs(page)}
                    />
                ) : logs.length === 0 ? (
                    <EmptyState icon={Mail} kind="passive" title="No emails sent yet" />
                ) : (
                    <div className="space-y-2">
                        {logs.map(log => (
                            <div
                                key={log.id}
                                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                                onClick={() => void selectLog(log)}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{log.subject}</p>
                                    <p className="text-sm text-muted-foreground truncate">
                                        To: {log.recipientName || log.recipientEmail}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant={getStatusBadgeVariant(log.status)}>{log.status}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(log.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {hasMore && (
                            <div className="mt-4 text-center">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const nextPage = page + 1;
                                        setPage(nextPage);
                                        fetchLogs(nextPage);
                                    }}
                                >
                                    Load More
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Log Detail Dialog */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
                        <CardHeader>
                            <CardTitle>{selectedLog.subject}</CardTitle>
                            <CardDescription>
                                Sent to {selectedLog.recipientEmail} • {new Date(selectedLog.createdAt).toLocaleString()}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Status</p>
                                    <Badge variant={getStatusBadgeVariant(selectedLog.status)}>{selectedLog.status}</Badge>
                                </div>
                                {selectedLog.sentByName && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Sent by</p>
                                        <p className="font-medium">{selectedLog.sentByName}</p>
                                    </div>
                                )}
                            </div>
                            {selectedLog.bodyHtml ? (
                                <div className="border rounded overflow-hidden">
                                    <iframe
                                        srcDoc={selectedLog.bodyHtml}
                                        sandbox="allow-same-origin"
                                        className="w-full h-[300px] bg-white"
                                        title="Email Content"
                                    />
                                </div>
                            ) : (
                                <p className="text-muted-foreground italic">Email content not available</p>
                            )}
                        </CardContent>
                        <div className="flex justify-end p-4 border-t">
                            <Button variant="outline" onClick={() => setSelectedLog(null)}>Close</Button>
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
});

export default EmailLogsView;
