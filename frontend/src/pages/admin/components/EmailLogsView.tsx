import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mail, RefreshCw, Loader2 } from 'lucide-react';
import { getEmailLogs, EmailLog } from '@/services/adminEmailApi';

export function EmailLogsView() {
    const [logs, setLogs] = useState<EmailLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);
    const { toast } = useToast();

    const fetchLogs = async (pageNum = 0) => {
        setLoading(true);
        try {
            const response = await getEmailLogs({ page: pageNum, limit: 25 });
            setLogs(response.logs);
            setTotal(response.total);
            setHasMore(response.hasMore);
        } catch (error: any) {
            toast({ title: 'Error', description: 'Failed to load email logs', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

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
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Email Logs</CardTitle>
                        <CardDescription>
                            {total} emails sent
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => fetchLogs(page)}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No emails sent yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {logs.map(log => (
                            <div
                                key={log.id}
                                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                                onClick={() => setSelectedLog(log)}
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
            </CardContent>

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
        </Card>
    );
}

export default EmailLogsView;