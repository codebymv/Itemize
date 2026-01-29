import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useHeader } from '@/contexts/HeaderContext';
import { useSubscriptionState } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { type Plan, PLAN_METADATA } from '@/lib/subscription';
import { TemplateSelectorDialog, EmailComposeDialog, EmailTemplate } from '@/components/admin';
import {
    ShieldCheck,
    Users,
    Mail,
    Search,
    RefreshCw,
    Loader2,
    BarChart3,
    Zap,
    User as UserIcon,
    Crown,
    Building2,
    Check,
    X,
    Send
} from 'lucide-react';
import * as adminApi from '@/services/adminApi';
import { getEmailLogs, EmailLog } from '@/services/adminEmailApi';
import { cn } from '@/lib/utils';

// Plan icons mapping
const PLAN_ICONS = {
    free: UserIcon,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

// Admin navigation items - Communications is now the default
const adminNav = [
    { title: 'Communications', path: '/admin', icon: Mail },
    { title: 'Statistics', path: '/admin/stats', icon: BarChart3 },
    { title: 'Change Tier', path: '/admin/change-tier', icon: Zap },
];

const ITEMS_PER_PAGE = 50;

function AdminNav() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <nav className="flex flex-col gap-1">
            {adminNav.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path === '/admin' && location.pathname === '/admin/');
                return (
                    <Button
                        key={item.path}
                        variant={isActive ? 'secondary' : 'ghost'}
                        className="justify-start text-muted-foreground hover:text-foreground"
                        onClick={() => navigate(item.path)}
                        style={{ fontFamily: '"Raleway", sans-serif' }}
                    >
                        <item.icon className={`mr-2 h-4 w-4 ${isActive ? 'text-blue-600' : ''}`} />
                        {item.title}
                    </Button>
                );
            })}
        </nav>
    );
}

// Unified Communications Section with User Selection
function CommunicationsSection() {
    const { toast } = useToast();
    
    // Tab state
    const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
    
    // Filter state
    const [planFilter, setPlanFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Loading states
    const [usersLoading, setUsersLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Data state
    const [users, setUsers] = useState<adminApi.AdminUser[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(0);
    
    // Selection state
    const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
    const [allFilteredSelected, setAllFilteredSelected] = useState(false);
    const [loadingAllIds, setLoadingAllIds] = useState(false);
    
    // Dialog state
    const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [composeRecipients, setComposeRecipients] = useState<adminApi.AdminUser[]>([]);
    
    // Refs
    const isLoadingRef = useRef(false);
    
    // Fetch total user count on mount
    useEffect(() => {
        const fetchCount = async () => {
            try {
                const response = await adminApi.getUserCount();
                setTotalUsers(response.count || 0);
            } catch (e) {
                console.error('Failed to fetch user count:', e);
            }
        };
        fetchCount();
    }, []);

    // Initial load - fetch all users on mount
    useEffect(() => {
        fetchUsers(0, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    // Fetch users
    const fetchUsers = useCallback(async (currentPage: number, append: boolean = false, isRefresh: boolean = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else if (currentPage === 0) {
            setUsersLoading(true);
        } else {
            setLoadingMore(true);
        }
        isLoadingRef.current = true;

        try {
            const response = await adminApi.searchUsers({
                query: searchQuery || undefined,
                page: currentPage,
                limit: ITEMS_PER_PAGE,
                plan: planFilter || undefined,
            });

            if (append) {
                setUsers(prev => [...prev, ...response.users]);
            } else {
                setUsers(response.users);
                setFilteredTotal(response.total || 0);
            }
            setHasMore(response.hasMore || false);
        } catch (error) {
            console.error('Error fetching users:', error);
            toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
        } finally {
            setUsersLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
            isLoadingRef.current = false;
        }
    }, [searchQuery, planFilter, toast]);

    // Reset and fetch when filter or search changes (skip initial mount)
    const isInitialMount = useRef(true);
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        setPage(0);
        setSelectedUsers(new Set());
        setAllFilteredSelected(false);

        const timer = setTimeout(() => {
            fetchUsers(0, false);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, planFilter, fetchUsers]);

    // Load more handler
    const handleLoadMore = useCallback(() => {
        if (isLoadingRef.current || !hasMore) return;

        const nextPage = page + 1;
        setPage(nextPage);
        fetchUsers(nextPage, true);
    }, [page, hasMore, fetchUsers]);

    // Selection handlers
    const handleSelectUser = (userId: number, checked: boolean) => {
        setSelectedUsers(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(userId);
            } else {
                newSet.delete(userId);
                if (allFilteredSelected) {
                    setAllFilteredSelected(false);
                }
            }
            return newSet;
        });
    };

    const handleSelectAllVisible = () => {
        if (selectedUsers.size === users.length && !allFilteredSelected) {
            setSelectedUsers(new Set());
        } else {
            setSelectedUsers(new Set(users.map(u => u.id)));
            setAllFilteredSelected(false);
        }
    };

    const handleSelectAllFiltered = async () => {
        if (allFilteredSelected) {
            setSelectedUsers(new Set());
            setAllFilteredSelected(false);
            return;
        }

        setLoadingAllIds(true);
        try {
            const response = await adminApi.getUserIds(searchQuery || undefined);
            setSelectedUsers(new Set(response.ids || []));
            setAllFilteredSelected(true);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to select all users', variant: 'destructive' });
        } finally {
            setLoadingAllIds(false);
        }
    };

    const handleClearSelection = () => {
        setSelectedUsers(new Set());
        setAllFilteredSelected(false);
    };

    // Get selected users with email for compose
    const selectedUsersWithEmail = users.filter(u => selectedUsers.has(u.id));

    // Handle opening compose
    const handleOpenCompose = async () => {
        if (allFilteredSelected && selectedUsers.size > users.length) {
            setLoadingRecipients(true);
            try {
                const allIds = Array.from(selectedUsers);
                const chunkSize = 100;
                const allUsers: adminApi.AdminUser[] = [];

                for (let i = 0; i < allIds.length; i += chunkSize) {
                    const chunk = allIds.slice(i, i + chunkSize);
                    const response = await adminApi.getUsersByIds(chunk);
                    allUsers.push(...(response.users || []));
                }

                setComposeRecipients(allUsers);
                setTemplateSelectorOpen(true);
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to load recipient details', variant: 'destructive' });
            } finally {
                setLoadingRecipients(false);
            }
        } else {
            setComposeRecipients(selectedUsersWithEmail);
            setTemplateSelectorOpen(true);
        }
    };

    // Handle template selection
    const handleSelectTemplate = (template: EmailTemplate | null) => {
        setSelectedTemplate(template);
        setTemplateSelectorOpen(false);
        setComposeOpen(true);
    };

    // Handle compose from scratch
    const handleComposeFromScratch = () => {
        setSelectedTemplate(null);
        setTemplateSelectorOpen(false);
        setComposeOpen(true);
    };

    // Handle sent
    const handleEmailSent = () => {
        setComposeOpen(false);
        setSelectedUsers(new Set());
        setAllFilteredSelected(false);
        toast({ title: 'Success', description: 'Emails sent successfully!' });
    };

    // Get plan badge styles - standard neutral colors for all tiers
    const getPlanBadgeClass = (plan: string) => {
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    };

    // Determine what to show
    const showNoResultsState = !usersLoading && users.length === 0;
    const showResults = users.length > 0;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Communications
                </h2>
                <p className="text-sm text-muted-foreground">
                    Select users and send emails
                </p>
            </div>

            <Separator />

            {/* Tab Navigation */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'users' | 'logs')}>
                <TabsList>
                    <TabsTrigger value="users">
                        <Users className={cn("h-4 w-4 mr-2", activeTab === 'users' && "text-blue-600")} />
                        Users
                    </TabsTrigger>
                    <TabsTrigger value="logs">
                        <Mail className={cn("h-4 w-4 mr-2", activeTab === 'logs' && "text-blue-600")} />
                        Email Logs
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {activeTab === 'users' && (
                <>
                    {/* Search and Filter */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                <div className="flex-1 max-w-md">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search by name or email..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                {/* Filter Buttons */}
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant={planFilter === null ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setPlanFilter(null)}
                                        className={planFilter === null ? 'bg-blue-600 hover:bg-blue-700' : ''}
                                    >
                                        <Users className="h-3 w-3 mr-1" />
                                        All
                                    </Button>
                                    {Object.entries(PLAN_METADATA).map(([planId, planMeta]) => {
                                        const PlanIcon = PLAN_ICONS[planId as Plan];
                                        return (
                                            <Button
                                                key={planId}
                                                variant={planFilter === planId ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setPlanFilter(planFilter === planId ? null : planId)}
                                                className={planFilter === planId ? 'bg-blue-600 hover:bg-blue-700' : ''}
                                            >
                                                <PlanIcon className="h-3 w-3 mr-1" />
                                                {planMeta.displayName}
                                            </Button>
                                        );
                                    })}
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                                        {(planFilter || searchQuery) && filteredTotal > 0
                                            ? `${users.length} of ${filteredTotal} users`
                                            : `${totalUsers} users`
                                        }
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => fetchUsers(0, false, true)}
                                        disabled={refreshing}
                                    >
                                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Results */}
                    <Card>
                        <CardContent className="pt-6">
                            {/* Select all row */}
                            {(totalUsers > 0 || filteredTotal > 0) && (
                                <div className="flex items-center justify-between pb-3 mb-3 border-b">
                                    <div className="flex items-center gap-4">
                                        {/* Select all visible */}
                                        {users.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleSelectAllVisible}
                                                    disabled={loadingAllIds}
                                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                        selectedUsers.size >= users.length && users.length > 0 && !allFilteredSelected
                                                            ? 'bg-blue-600 border-blue-600'
                                                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'
                                                    }`}
                                                >
                                                    {selectedUsers.size >= users.length && users.length > 0 && !allFilteredSelected && (
                                                        <Check className="h-3 w-3 text-white" />
                                                    )}
                                                </button>
                                                <label className="text-sm text-muted-foreground cursor-pointer" onClick={handleSelectAllVisible}>
                                                    Select visible ({users.length})
                                                </label>
                                            </div>
                                        )}

                                        {/* Select all total */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleSelectAllFiltered}
                                                disabled={loadingAllIds}
                                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    allFilteredSelected
                                                        ? 'bg-blue-600 border-blue-600'
                                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'
                                                }`}
                                            >
                                                {allFilteredSelected && <Check className="h-3 w-3 text-white" />}
                                            </button>
                                            <label
                                                className={`text-sm cursor-pointer ${allFilteredSelected ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-muted-foreground'}`}
                                                onClick={handleSelectAllFiltered}
                                            >
                                                {loadingAllIds ? (
                                                    <span className="flex items-center gap-1">
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                        Loading...
                                                    </span>
                                                ) : (
                                                    `Select all (${planFilter || searchQuery ? filteredTotal : totalUsers})`
                                                )}
                                            </label>
                                        </div>
                                    </div>

                                    {/* Selection actions */}
                                    {selectedUsers.size > 0 && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                                                {selectedUsers.size} selected{allFilteredSelected && ' (all)'}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleClearSelection}
                                                disabled={loadingRecipients}
                                                className="h-7 px-2 text-xs text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200"
                                            >
                                                <X className="h-3 w-3 mr-1" />
                                                Clear
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={handleOpenCompose}
                                                disabled={loadingRecipients}
                                                className="bg-blue-600 hover:bg-blue-700"
                                            >
                                                {loadingRecipients ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                        Loading...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send className="h-4 w-4 mr-1" />
                                                        Email Selected
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* User list */}
                            {usersLoading && page === 0 ? (
                                <div className="flex items-center justify-center h-64">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                                </div>
                            ) : showNoResultsState ? (
                                <div className="text-center py-12">
                                    <Users className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                    <p className="text-slate-600 dark:text-slate-400 font-medium">No users found</p>
                                    <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
                                </div>
                            ) : showResults ? (
                                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                    {users.map((user) => (
                                        <div
                                            key={user.id}
                                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                selectedUsers.has(user.id)
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                                            }`}
                                            onClick={() => handleSelectUser(user.id, !selectedUsers.has(user.id))}
                                        >
                                            {/* Checkbox */}
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                selectedUsers.has(user.id)
                                                    ? 'bg-blue-600 border-blue-600'
                                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                            }`}>
                                                {selectedUsers.has(user.id) && (
                                                    <Check className="h-3 w-3 text-white" />
                                                )}
                                            </div>

                                            {/* Avatar */}
                                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                                                {(user.name || user.email)?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>

                                            {/* User info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                                    {user.name || 'Unnamed User'}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                            </div>

                                            {/* Admin badge */}
                                            {user.role === 'ADMIN' && (
                                                <Badge variant="default" className="bg-blue-600">
                                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                                    Admin
                                                </Badge>
                                            )}
                                            {/* Plan badge */}
                                            {user.plan && (() => {
                                                const PlanIcon = PLAN_ICONS[user.plan as Plan] || UserIcon;
                                                return (
                                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${getPlanBadgeClass(user.plan)}`}>
                                                        <PlanIcon className="h-3 w-3" />
                                                        {PLAN_METADATA[user.plan as Plan]?.displayName || user.plan}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    ))}

                                    {/* Load more */}
                                    {hasMore && (
                                        <div className="py-4 text-center">
                                            {loadingMore ? (
                                                <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600" />
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleLoadMore}
                                                    className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                >
                                                    Load More
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    {/* Template Selector Dialog */}
                    <TemplateSelectorDialog
                        open={templateSelectorOpen}
                        onOpenChange={setTemplateSelectorOpen}
                        onSelectTemplate={handleSelectTemplate}
                        onComposeEmail={handleComposeFromScratch}
                    />

                    {/* Email Compose Dialog */}
                    <EmailComposeDialog
                        open={composeOpen}
                        onOpenChange={setComposeOpen}
                        recipients={composeRecipients.map(u => ({
                            id: u.id,
                            email: u.email,
                            name: u.name
                        }))}
                        onSent={handleEmailSent}
                        initialTemplate={selectedTemplate}
                        onBrowseTemplates={() => {
                            setComposeOpen(false);
                            setTemplateSelectorOpen(true);
                        }}
                    />
                </>
            )}

            {activeTab === 'logs' && (
                <EmailLogsView />
            )}
        </div>
    );
}

// Email Logs View
function EmailLogsView() {
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

// Statistics Section
function StatisticsSection() {
    const [stats, setStats] = useState<adminApi.SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await adminApi.getStats();
                setStats(response);
            } catch (error) {
                toast({
                    title: 'Error',
                    description: 'Failed to load statistics',
                    variant: 'destructive'
                });
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [toast]);

    const StatCard = ({ title, value, icon: Icon }: { title: string; value: number; icon: any }) => (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{title}</p>
                        <p className="text-3xl font-bold">{value?.toLocaleString() || 0}</p>
                    </div>
                    <Icon className="h-8 w-8 text-blue-600 opacity-50" />
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    System Statistics
                </h2>
                <p className="text-sm text-muted-foreground">
                    Overview of system metrics
                </p>
            </div>

            <Separator />

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-3">
                    <StatCard title="Total Users" value={stats?.users || 0} icon={Users} />
                    <StatCard title="Contacts" value={stats?.contacts || 0} icon={Users} />
                    <StatCard title="Invoices" value={stats?.invoices || 0} icon={BarChart3} />
                </div>
            )}
        </div>
    );
}

// Change Tier Section (Admin Testing)
function ChangeTierSection() {
    const { subscription } = useSubscriptionState();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const { toast } = useToast();

    const currentPlan = (subscription?.planName?.toLowerCase() as Plan) || 'free';

    const plans: { id: Plan; label: string; icon: typeof UserIcon }[] = [
        { id: 'free', label: PLAN_METADATA.free.displayName, icon: PLAN_ICONS.free },
        { id: 'starter', label: PLAN_METADATA.starter.displayName, icon: PLAN_ICONS.starter },
        { id: 'unlimited', label: PLAN_METADATA.unlimited.displayName, icon: PLAN_ICONS.unlimited },
        { id: 'pro', label: PLAN_METADATA.pro.displayName, icon: PLAN_ICONS.pro }
    ];

    const handleChangePlan = async (planId: Plan) => {
        if (loadingPlan) return;
        
        setLoadingPlan(planId);
        try {
            await adminApi.updateMyPlan(planId);
            const planDisplayName = PLAN_METADATA[planId]?.displayName || planId;
            toast({
                title: 'Plan Updated',
                description: `Your plan has been changed to ${planDisplayName}`,
            });
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to update plan',
                variant: 'destructive'
            });
            setLoadingPlan(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Change Tier
                </h2>
                <p className="text-sm text-muted-foreground">
                    Testing and development tools
                </p>
            </div>

            <Separator />

            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                        {plans.map((plan) => {
                            const PlanIcon = plan.icon;
                            const isSelected = currentPlan === plan.id;
                            const isLoading = loadingPlan === plan.id;
                            
                            return (
                                <Button
                                    key={plan.id}
                                    variant={isSelected ? 'default' : 'outline'}
                                    className={`h-auto py-4 flex items-center justify-center gap-2 ${isSelected ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                    onClick={() => handleChangePlan(plan.id)}
                                    disabled={loadingPlan !== null}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <PlanIcon className="h-4 w-4" />
                                    )}
                                    {plan.label}
                                </Button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function AdminPage() {
    const { currentUser } = useAuthState();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    // Find the active nav item based on current path
    const activeNavItem = adminNav.find(item => item.path === location.pathname) || adminNav[0];

    // Check admin access
    useEffect(() => {
        if (currentUser && currentUser.role !== 'ADMIN') {
            navigate('/dashboard');
        }
    }, [currentUser, navigate]);

    // Set header content with icon and title
    useEffect(() => {
        setHeaderContent(
            <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full min-w-0 gap-3 md:gap-2">
                <div className="flex items-center gap-2 ml-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        ADMIN | {activeNavItem.title}
                    </h1>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent, activeNavItem.title]);

    // Show loading or redirect if not admin
    if (!currentUser) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (currentUser.role !== 'ADMIN') {
        return null;
    }

    return (
        <div className="container mx-auto p-6 max-w-8xl">
            <div className="grid gap-8 md:grid-cols-[200px_1fr]">
                <AdminNav />

                <div className="min-w-0">
                    <Routes>
                        <Route index element={<CommunicationsSection />} />
                        <Route path="stats" element={<StatisticsSection />} />
                        <Route path="change-tier" element={<ChangeTierSection />} />
                    </Routes>
                </div>
            </div>
        </div>
    );
}

export default AdminPage;
