import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Plus, Search, Send, MoreHorizontal, Trash2, Users, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getReviewRequests, deleteReviewRequest, sendReviewRequest } from '@/services/reputationApi';
import { SendReviewRequestModal } from './SendReviewRequestModal';

interface ReviewRequest {
    id: number;
    contact_id: number;
    contact_name: string;
    contact_email?: string;
    contact_phone?: string;
    method: 'email' | 'sms';
    status: 'pending' | 'sent' | 'clicked' | 'completed';
    sent_at?: string;
    clicked_at?: string;
    completed_at?: string;
    created_at: string;
}

export function ReputationRequestsPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [requests, setRequests] = useState<ReviewRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [showSendModal, setShowSendModal] = useState(false);

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Send className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        REPUTATION | Requests
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search requests..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[120px] h-9 hidden sm:flex">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="clicked">Clicked</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-light"
                        onClick={() => setShowSendModal(true)}
                    >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Send Request</span>
                    </Button>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, statusFilter, theme, setHeaderContent]);

    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error: any) {
                setInitError('Failed to initialize.');
                setLoading(false);
            }
        };
        initOrg();
    }, []);

    const fetchRequests = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const response = await getReviewRequests(
                { status: statusFilter !== 'all' ? statusFilter as any : undefined },
                organizationId
            );
            setRequests(response.requests || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load requests', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, statusFilter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleResend = async (id: number) => {
        // TODO: Implement resend functionality when backend endpoint is available
        toast({ title: 'Coming soon', description: 'Resend functionality will be available soon' });
    };

    const handleDelete = async (id: number) => {
        if (!organizationId) return;
        try {
            await deleteReviewRequest(id, organizationId);
            setRequests(prev => prev.filter(r => r.id !== id));
            toast({ title: 'Deleted', description: 'Request deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'clicked': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'sent': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
            case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            default: return '';
        }
    };

    const filteredRequests = requests.filter(r =>
        r.contact_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (initError) {
        return (
            <div className="container mx-auto p-6 max-w-7xl">
                <Card className="max-w-lg mx-auto mt-12">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">{initError}</p>
                        <Button onClick={() => window.location.reload()} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
                        </div>
                    ) : filteredRequests.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Send className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No review requests yet</h3>
                            <p className="text-muted-foreground mb-4">Send review requests to your customers to collect feedback</p>
                            <Button onClick={() => setShowSendModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />Send First Request
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredRequests.map((request) => (
                                <div key={request.id} className="p-4 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                                <Users className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium">{request.contact_name}</p>
                                                    <Badge className={`text-xs ${getStatusBadge(request.status)}`}>
                                                        {request.status}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    {request.method === 'email' ? (
                                                        <><Mail className="h-3 w-3" />{request.contact_email}</>
                                                    ) : (
                                                        <><MessageSquare className="h-3 w-3" />{request.contact_phone}</>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {request.sent_at ? `Sent ${new Date(request.sent_at).toLocaleDateString()}` : 'Not sent'}
                                            </span>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleResend(request.id)}>
                                                        <Send className="h-4 w-4 mr-2" />Resend
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handleDelete(request.id)} className="text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {showSendModal && organizationId && (
                <SendReviewRequestModal
                    organizationId={organizationId}
                    onClose={() => setShowSendModal(false)}
                    onSent={() => {
                        setShowSendModal(false);
                        fetchRequests();
                    }}
                />
            )}
        </div>
    );
}

export default ReputationRequestsPage;
