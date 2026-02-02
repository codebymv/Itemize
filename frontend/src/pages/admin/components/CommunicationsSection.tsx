import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    User as UserIcon,
    Zap,
    Crown,
    Building2,
    Check,
    X,
    Send
} from 'lucide-react';
import * as adminApi from '@/services/adminApi';
import { cn } from '@/lib/utils';
import { EmailLogsView } from './EmailLogsView';

const PLAN_ICONS = {
    free: UserIcon,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

const ITEMS_PER_PAGE = 50;

export default function CommunicationsSection() {
    const { toast } = useToast();
    
    const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
    const [planFilter, setPlanFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [usersLoading, setUsersLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [users, setUsers] = useState<adminApi.AdminUser[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(0);
    const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
    const [allFilteredSelected, setAllFilteredSelected] = useState(false);
    const [loadingAllIds, setLoadingAllIds] = useState(false);
    const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [composeRecipients, setComposeRecipients] = useState<adminApi.AdminUser[]>([]);
    const isLoadingRef = useRef(false);
    
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

    useEffect(() => {
        fetchUsers(0, false);
    }, []);
    
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

    const handleLoadMore = useCallback(() => {
        if (isLoadingRef.current || !hasMore) return;

        const nextPage = page + 1;
        setPage(nextPage);
        fetchUsers(nextPage, true);
    }, [page, hasMore, fetchUsers]);

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

    const selectedUsersWithEmail = users.filter(u => selectedUsers.has(u.id));

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

    const handleSelectTemplate = (template: EmailTemplate | null) => {
        setSelectedTemplate(template);
        setTemplateSelectorOpen(false);
        setComposeOpen(true);
    };

    const handleComposeFromScratch = () => {
        setSelectedTemplate(null);
        setTemplateSelectorOpen(false);
        setComposeOpen(true);
    };

    const handleEmailSent = () => {
        setComposeOpen(false);
        setSelectedUsers(new Set());
        setAllFilteredSelected(false);
        toast({ title: 'Success', description: 'Emails sent successfully!' });
    };

    const getPlanBadgeClass = (plan: string) => {
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    };

    const showNoResultsState = !usersLoading && users.length === 0;
    const showResults = users.length > 0;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold font-raleway">
                    Communications
                </h2>
                <p className="text-sm text-muted-foreground">
                    Select users and send emails
                </p>
            </div>

            <Separator />

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

                    <Card>
                        <CardContent className="pt-6">
                            {(totalUsers > 0 || filteredTotal > 0) && (
                                <div className="flex items-center justify-between pb-3 mb-3 border-b">
                                    <div className="flex items-center gap-4">
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
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                selectedUsers.has(user.id)
                                                    ? 'bg-blue-600 border-blue-600'
                                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                            }`}>
                                                {selectedUsers.has(user.id) && (
                                                    <Check className="h-3 w-3 text-white" />
                                                )}
                                            </div>

                                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                                                {(user.name || user.email)?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                                    {user.name || 'Unnamed User'}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                            </div>

                                            {user.role === 'ADMIN' && (
                                                <Badge variant="default" className="bg-blue-600">
                                                    <ShieldCheck className="h-3 w-3 sm:mr-1" />
                                                    <span className="hidden sm:inline">Admin</span>
                                                </Badge>
                                            )}
                                            {user.plan && (() => {
                                                const PlanIcon = PLAN_ICONS[user.plan as Plan] || UserIcon;
                                                return (
                                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${getPlanBadgeClass(user.plan)}`}>
                                                        <PlanIcon className="h-3 w-3 flex-shrink-0" />
                                                        <span className="hidden sm:inline">{PLAN_METADATA[user.plan as Plan]?.displayName || user.plan}</span>
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    ))}

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

                    <TemplateSelectorDialog
                        open={templateSelectorOpen}
                        onOpenChange={setTemplateSelectorOpen}
                        onSelectTemplate={handleSelectTemplate}
                        onComposeEmail={handleComposeFromScratch}
                    />

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