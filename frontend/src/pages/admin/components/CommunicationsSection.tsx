import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconTabsList, IconTabsTrigger, Tabs } from '@/components/ui/tabs';
import {
    HeaderCombinedQuery,
    HeaderFilters,
    HeaderRefreshAction,
    HeaderSearch,
    type DesktopHeaderToolsProps,
} from '@/components/layout/DesktopHeaderTools';
import { useToast } from '@/hooks/use-toast';
import { type Plan, PLAN_METADATA } from '@/lib/subscription';
import { TemplateSelectorDialog, EmailComposeDialog, EmailTemplate } from '@/components/admin';
import {
    ShieldCheck,
    Users,
    Mail,
    Loader2,
    User as UserIcon,
    Zap,
    Crown,
    Building2,
    Check,
    X,
    Send,
    Globe2
} from 'lucide-react';
import * as adminApi from '@/services/adminApi';
import { EmailLogsView, type EmailLogsViewHandle } from './EmailLogsView';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

const PLAN_ICONS = {
    free: UserIcon,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

const ITEMS_PER_PAGE = 50;

function PlanFilterControls({
    planFilter,
    onChange,
    compact = false,
}: {
    planFilter: string | null;
    onChange: (plan: string | null) => void;
    compact?: boolean;
}) {
    return (
        <div className={compact ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
            <Button
                variant={planFilter === null ? 'default' : 'outline'}
                onClick={() => onChange(null)}
                className={`${compact ? 'col-span-2 w-full justify-start' : ''} ${planFilter === null
                    ? 'h-11 bg-blue-600 interaction-button--primary'
                    : 'h-11'}`}
            >
                <Globe2 className={`mr-1 h-4 w-4 ${planFilter === null ? 'text-white' : 'icon-accent'}`} />
                All
            </Button>
            {Object.entries(PLAN_METADATA).map(([planId, planMeta]) => {
                const PlanIcon = PLAN_ICONS[planId as Plan];
                return (
                    <Button
                        key={planId}
                        variant={planFilter === planId ? 'default' : 'outline'}
                        onClick={() => onChange(planFilter === planId ? null : planId)}
                        className={`${compact ? 'w-full justify-start' : ''} ${planFilter === planId
                            ? 'h-11 bg-blue-600 interaction-button--primary'
                            : 'h-11'}`}
                    >
                        <PlanIcon className={`mr-1 h-4 w-4 ${planFilter === planId ? 'text-white' : 'icon-accent'}`} />
                        {planMeta.displayName}
                    </Button>
                );
            })}
        </div>
    );
}

interface CommunicationsSectionProps {
    onDesktopToolsChange?: (tools?: DesktopHeaderToolsProps) => void;
    onMobileActionsChange?: (actions?: React.ReactNode) => void;
}

export default function CommunicationsSection({
    onDesktopToolsChange,
    onMobileActionsChange,
}: CommunicationsSectionProps) {
    const { toast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab: 'users' | 'logs' = searchParams.get('view') === 'email-logs' ? 'logs' : 'users';
    const emailLogsRef = useRef<EmailLogsViewHandle>(null);
    const [emailLogTotal, setEmailLogTotal] = useState(0);
    const [emailLogsRefreshing, setEmailLogsRefreshing] = useState(false);
    const [planFilter, setPlanFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersLoadError, setUsersLoadError] = useState(false);
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

    const handleTabChange = (value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value === 'logs') next.set('view', 'email-logs');
        else next.delete('view');
        setSearchParams(next);
    };
    
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

    const fetchUsers = useCallback(async (currentPage: number, append: boolean = false, isRefresh: boolean = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else if (currentPage === 0) {
            setUsersLoading(true);
        } else {
            setLoadingMore(true);
        }
        isLoadingRef.current = true;
        setUsersLoadError(false);

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
            setUsersLoadError(true);
        } finally {
            setUsersLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
            isLoadingRef.current = false;
        }
    }, [searchQuery, planFilter]);

    const isInitialMount = useRef(true);
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            void fetchUsers(0, false);
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
            const response = await adminApi.getUserIds(searchQuery || undefined, planFilter || undefined);
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
    };

    const getPlanBadgeClass = (plan: string) => {
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    };

    const showNoResultsState = !usersLoading && !usersLoadError && users.length === 0;
    const showResults = users.length > 0;
    const resultCountLabel = (planFilter || searchQuery) && filteredTotal > 0
        ? `${users.length} of ${filteredTotal} users`
        : `${totalUsers} users`;

    useEffect(() => {
        if (!onDesktopToolsChange) return;
        if (activeTab === 'logs') {
            onDesktopToolsChange({
                secondaryAction: (
                    <HeaderRefreshAction
                        prominence="secondary"
                        onClick={() => emailLogsRef.current?.refresh()}
                        refreshing={emailLogsRefreshing}
                    />
                ),
            });
            return () => onDesktopToolsChange(undefined);
        }

        onDesktopToolsChange({
            search: (
                <HeaderSearch
                    value={searchQuery}
                    onChange={setSearchQuery}
                    label="Search users"
                    placeholder="Search users..."
                />
            ),
            filters: (
                <HeaderFilters
                    label="Filter users by plan"
                    activeCount={planFilter ? 1 : 0}
                    compactChildren={(
                        <PlanFilterControls compact planFilter={planFilter} onChange={setPlanFilter} />
                    )}
                >
                    <PlanFilterControls planFilter={planFilter} onChange={setPlanFilter} />
                </HeaderFilters>
            ),
            combinedQuery: (
                <HeaderCombinedQuery
                    value={searchQuery}
                    onChange={setSearchQuery}
                    label="Search and filter users"
                    placeholder="Search users..."
                    activeCount={(searchQuery ? 1 : 0) + (planFilter ? 1 : 0)}
                >
                    <PlanFilterControls compact planFilter={planFilter} onChange={setPlanFilter} />
                </HeaderCombinedQuery>
            ),
            secondaryAction: (
                <HeaderRefreshAction
                    prominence="secondary"
                    onClick={() => void fetchUsers(0, false, true)}
                    refreshing={refreshing}
                />
            ),
        });

        return () => onDesktopToolsChange(undefined);
    }, [
        activeTab,
        emailLogsRefreshing,
        fetchUsers,
        onDesktopToolsChange,
        planFilter,
        refreshing,
        searchQuery,
    ]);

    useEffect(() => {
        if (!onMobileActionsChange) return;
        if (activeTab === 'logs') {
            onMobileActionsChange(
                <div className="flex w-full items-center justify-end">
                    <HeaderRefreshAction
                        prominence="secondary"
                        onClick={() => emailLogsRef.current?.refresh()}
                        refreshing={emailLogsRefreshing}
                    />
                </div>,
            );
            return () => onMobileActionsChange(undefined);
        }

        onMobileActionsChange(
            <div className="flex w-full items-center justify-end gap-2">
                <HeaderCombinedQuery
                    value={searchQuery}
                    onChange={setSearchQuery}
                    label="Search and filter users"
                    placeholder="Search users..."
                    activeCount={(searchQuery ? 1 : 0) + (planFilter ? 1 : 0)}
                >
                    <PlanFilterControls compact planFilter={planFilter} onChange={setPlanFilter} />
                </HeaderCombinedQuery>
                <HeaderRefreshAction
                    prominence="secondary"
                    onClick={() => void fetchUsers(0, false, true)}
                    refreshing={refreshing}
                />
            </div>,
        );

        return () => onMobileActionsChange(undefined);
    }, [
        activeTab,
        emailLogsRefreshing,
        fetchUsers,
        onMobileActionsChange,
        planFilter,
        refreshing,
        searchQuery,
    ]);

    return (
        <div className="space-y-4" data-communications-section>
            <div
                className="flex flex-col gap-3 min-[1000px]:flex-row min-[1000px]:items-center min-[1000px]:justify-between"
                data-communications-header
            >
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <IconTabsList>
                        <IconTabsTrigger value="users">
                            <Users className="mr-2 h-4 w-4" />
                            Users
                        </IconTabsTrigger>
                        <IconTabsTrigger value="logs">
                            <Mail className="mr-2 h-4 w-4" />
                            Email Logs
                        </IconTabsTrigger>
                    </IconTabsList>
                </Tabs>
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 min-[1000px]:justify-end">
                    <span className="whitespace-nowrap text-sm text-muted-foreground" data-communications-count>
                        {activeTab === 'users'
                            ? resultCountLabel
                            : `${emailLogTotal} ${emailLogTotal === 1 ? 'email' : 'emails'} sent`}
                    </span>
                    {activeTab === 'users' && (totalUsers > 0 || filteredTotal > 0) && (
                        <>
                            {users.length > 0 && (
                                <div className="flex min-h-11 items-center gap-2">
                                    <button
                                        type="button"
                                        aria-label={`Select visible (${users.length})`}
                                        aria-pressed={selectedUsers.size >= users.length && users.length > 0 && !allFilteredSelected}
                                        onClick={handleSelectAllVisible}
                                        disabled={loadingAllIds}
                                        className="interaction-control inline-flex h-11 w-11 items-center justify-center rounded-md disabled:opacity-50"
                                    >
                                        <span className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                                            selectedUsers.size >= users.length && users.length > 0 && !allFilteredSelected
                                                ? 'border-blue-600 bg-blue-600'
                                                : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                                        }`}>
                                            {selectedUsers.size >= users.length && users.length > 0 && !allFilteredSelected && (
                                                <Check className="h-3 w-3 text-white" />
                                            )}
                                        </span>
                                    </button>
                                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                                        Select visible ({users.length})
                                    </span>
                                </div>
                            )}

                            <div className="flex min-h-11 items-center gap-2">
                                <button
                                    type="button"
                                    aria-label={`Select all (${planFilter || searchQuery ? filteredTotal : totalUsers})`}
                                    aria-pressed={allFilteredSelected}
                                    onClick={handleSelectAllFiltered}
                                    disabled={loadingAllIds}
                                    className="interaction-control inline-flex h-11 w-11 items-center justify-center rounded-md disabled:opacity-50"
                                >
                                    <span className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                                        allFilteredSelected
                                            ? 'border-blue-600 bg-blue-600'
                                            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                                    }`}>
                                        {allFilteredSelected && <Check className="h-3 w-3 text-white" />}
                                    </span>
                                </button>
                                <span className={`whitespace-nowrap text-sm ${allFilteredSelected ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-muted-foreground'}`}>
                                    {loadingAllIds ? (
                                        <span className="flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Loading...
                                        </span>
                                    ) : (
                                        `Select all (${planFilter || searchQuery ? filteredTotal : totalUsers})`
                                    )}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {activeTab === 'users' && (
                <>
                    <div data-communications-content>
                        {selectedUsers.size > 0 && (
                            <div className="mb-3 flex flex-wrap items-center justify-end gap-2 border-b pb-3">
                                <span className="whitespace-nowrap text-sm text-muted-foreground">
                                    {selectedUsers.size} selected{allFilteredSelected && ' (all)'}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearSelection}
                                    disabled={loadingRecipients}
                                    className="h-11 px-3 text-sm text-muted-foreground hover:text-slate-700 dark:hover:text-slate-200"
                                >
                                    <X className="mr-1 h-3 w-3" />
                                    Clear
                                </Button>
                                <Button
                                    onClick={handleOpenCompose}
                                    disabled={loadingRecipients}
                                    className="h-11 bg-blue-600 interaction-button--primary"
                                >
                                    {loadingRecipients ? (
                                        <>
                                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                            Loading...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="mr-1 h-4 w-4" />
                                            Email Selected
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {usersLoading && page === 0 ? (
                                <div className="flex items-center justify-center h-64">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                                </div>
                            ) : usersLoadError ? (
                                <ErrorState
                                    kind="section"
                                    icon={Users}
                                    title="Unable to load users"
                                    description="We couldn't load the user list. Try again."
                                    onRetry={() => void fetchUsers(0, false)}
                                />
                            ) : showNoResultsState ? (
                                <EmptyState
                                    icon={Users}
                                    kind={searchQuery || planFilter ? 'results' : 'passive'}
                                    title={searchQuery || planFilter ? 'No matching users' : 'No users yet'}
                                    actionLabel={searchQuery || planFilter ? 'Clear filters' : undefined}
                                    onAction={searchQuery || planFilter ? () => { setSearchQuery(''); setPlanFilter(null); } : undefined}
                                />
                            ) : showResults ? (
                                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                    {users.map((user) => (
                                        <button
                                            type="button"
                                            key={user.id}
                                            aria-pressed={selectedUsers.has(user.id)}
                                            className={`interaction-row flex w-full items-center gap-3 rounded-lg border p-3 text-left ${
                                                selectedUsers.has(user.id)
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
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
                                                <Badge>
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
                                        </button>
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
                                                    className="border-blue-600 text-blue-600"
                                                >
                                                    Load More
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                        ) : null}
                    </div>

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
                <EmailLogsView
                    ref={emailLogsRef}
                    onLoadingChange={setEmailLogsRefreshing}
                    onTotalChange={setEmailLogTotal}
                />
            )}
        </div>
    );
}
