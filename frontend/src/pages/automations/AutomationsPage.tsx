import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Zap, Play, MoreHorizontal, Copy, Trash2,
  Mail, Tag, Clock, Users, TrendingUp, CheckCircle, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import {
  HeaderAction,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
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
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { 
  getWorkflows, 
  activateWorkflow, 
  deactivateWorkflow, 
  deleteWorkflow,
  duplicateWorkflow,
  Workflow 
} from '@/services/automationsApi';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import {
  WORKFLOW_TRIGGER_LABELS,
  WORKFLOW_TRIGGER_OPTIONS,
  type WorkflowTriggerType,
} from '@/domain/workflowRegistry';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { getWorkflowStatusVisual } from './constants/workflowConstants';
import { cn } from '@/lib/utils';

const TRIGGER_TYPE_ICONS: Partial<Record<WorkflowTriggerType, LucideIcon>> = {
  contact_added: Users,
  contact_updated: Users,
  tag_added: Tag,
  tag_removed: Tag,
  deal_stage_changed: TrendingUp,
  deal_won: TrendingUp,
  deal_lost: TrendingUp,
  deal_reopened: TrendingUp,
  form_submitted: Mail,
  manual: Play,
  scheduled: Clock,
};

export function AutomationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Onboarding
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('automations');

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
    onError: () => 'Failed to initialize. Please check your connection.'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workingWorkflowId, setWorkingWorkflowId] = useState<number | null>(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (orgLoading) {
      setLoading(true);
      return;
    }

    if (!organizationId) {
      setLoading(false);
    }
  }, [organizationId, initError, orgLoading]);

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    if (!organizationId) {
      if (!orgLoading) {
        setWorkflows([]);
        setLoading(false);
      }
      return;
    }

    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getWorkflows(organizationId, {
        trigger_type: triggerFilter !== 'all'
          ? triggerFilter as WorkflowTriggerType
          : undefined,
        is_active: statusFilter !== 'all' ? statusFilter === 'active' : undefined,
        search: debouncedSearchQuery || undefined,
      });

      if (requestId === loadRequestRef.current) setWorkflows(response.workflows);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      if (requestId === loadRequestRef.current) {
        setLoadError('We could not load your automations. Your existing workflows have not been changed.');
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [organizationId, orgLoading, triggerFilter, statusFilter, debouncedSearchQuery]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const getApiErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { data?: { error?: unknown } } }).response;
      if (typeof response?.data?.error === 'string') {
        return response.data.error;
      }
    }
    return fallback;
  };

  // Handle workflow toggle
  const handleToggleWorkflow = async (workflow: Workflow) => {
    if (!organizationId) return;

    setWorkingWorkflowId(workflow.id);
    try {
      if (workflow.is_active) {
        await deactivateWorkflow(workflow.id, organizationId);
        toast({ title: 'Deactivated', description: 'Workflow deactivated successfully' });
      } else {
        await activateWorkflow(workflow.id, organizationId);
        toast({ title: 'Activated', description: 'Workflow activated successfully' });
      }
      await fetchWorkflows();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to update workflow'),
        variant: 'destructive',
      });
    } finally {
      setWorkingWorkflowId(null);
    }
  };

  // Handle delete
  const handleDeleteWorkflow = async (): Promise<boolean> => {
    if (!organizationId || !workflowToDelete) return false;

    try {
      await deleteWorkflow(workflowToDelete.id, organizationId);
      setWorkflows((prev) => prev.filter((workflow) => workflow.id !== workflowToDelete.id));
      setWorkflowToDelete(null);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Handle duplicate
  const handleDuplicateWorkflow = async (workflow: Workflow) => {
    if (!organizationId) return;

    setWorkingWorkflowId(workflow.id);
    try {
      await duplicateWorkflow(workflow.id, organizationId);
      toast({ title: 'Duplicated', description: 'Workflow duplicated successfully' });
      await fetchWorkflows();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to duplicate workflow',
        variant: 'destructive',
      });
    } finally {
      setWorkingWorkflowId(null);
    }
  };

  // Show error state
  if (initError) {
    return (
      <PageLayout
        title="AUTOMATIONS"
        icon={<Zap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      >
        <ErrorState
          title="Automations Not Ready"
          description={initError}
          icon={Zap}
          onAction={() => void fetchWorkflows()}
        />
      </PageLayout>
    );
  }

  // Stats calculation
  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.is_active).length,
    inactive: workflows.filter(w => !w.is_active).length,
    running: workflows.reduce((sum, w) => sum + (w.enrollment_stats?.active_count ?? w.active_enrollments ?? 0), 0),
    totalCompleted: workflows.reduce((sum, w) => sum + (w.stats?.completed || 0), 0),
    totalFailed: workflows.reduce((sum, w) => sum + (w.enrollment_stats?.failed_count ?? w.stats?.failed ?? 0), 0),
  };

  const hasQuery = Boolean(searchQuery.trim()) || triggerFilter !== 'all' || statusFilter !== 'all';
  const activeFilterCount = Number(triggerFilter !== 'all') + Number(statusFilter !== 'all');
  const clearQuery = () => {
    setSearchQuery('');
    setTriggerFilter('all');
    setStatusFilter('all');
  };

  const triggerSelect = (compact = false) => (
    <Select value={triggerFilter} onValueChange={setTriggerFilter}>
      <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[160px] bg-muted/20'}>
        <SelectValue placeholder="Trigger" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All triggers</SelectItem>
        {WORKFLOW_TRIGGER_OPTIONS.map(({ type, label }) => (
          <SelectItem key={type} value={type}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const statusSelect = (compact = false) => (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[130px] bg-muted/20'}>
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="inactive">Inactive</SelectItem>
      </SelectContent>
    </Select>
  );

  const filterControls = (
    <div className="flex min-w-0 flex-col items-stretch gap-2">
      {triggerSelect(true)}
      {statusSelect(true)}
    </div>
  );

  return (
    <PageLayout
      title="AUTOMATIONS"
      icon={<Zap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      mobileClassName="flex-col items-stretch"
      desktopTools={{
        search: (
          <HeaderSearch
            label="Search automations"
            placeholder="Search automations..."
            value={searchQuery}
            onChange={setSearchQuery}
            width="wide"
          />
        ),
        filters: (
          <div className="flex items-center gap-2">
            <HeaderFilters
              label="Filter automations by trigger"
              activeCount={Number(triggerFilter !== 'all')}
              compactChildren={triggerSelect(true)}
              preferExpanded="when-roomy"
            >
              {triggerSelect()}
            </HeaderFilters>
            <HeaderFilters
              label="Filter automations by status"
              activeCount={Number(statusFilter !== 'all')}
              compactChildren={statusSelect(true)}
              preferExpanded="wide-lane"
            >
              {statusSelect()}
            </HeaderFilters>
          </div>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter automations"
            placeholder="Search automations..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={activeFilterCount + Number(Boolean(searchQuery.trim()))}
          >
            {filterControls}
          </HeaderCombinedQuery>
        ),
        primaryAction: (
          <HeaderAction
            label="Create automation"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/automations/new')}
          />
        ),
      }}
      mobileActions={
        <>
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search automations"
                placeholder="Search automations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-full"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 w-full">
            <Select value={triggerFilter} onValueChange={setTriggerFilter}>
              <SelectTrigger className="flex-1 h-9">
                <SelectValue placeholder="Trigger" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All triggers</SelectItem>
                {WORKFLOW_TRIGGER_OPTIONS.map(({ type, label }) => (
                  <SelectItem key={type} value={type}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9"
              onClick={() => navigate('/automations/new')}
              aria-label="Create automation"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </>
      }
    >
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={completeOnboarding}
        onDismiss={dismissOnboarding}
        content={ONBOARDING_CONTENT.automations}
      />

        {/* Stats cards */}
      <ResponsiveCardRail
        label="Automation summary"
        desktopColumns="md:grid-cols-2 lg:grid-cols-5"
      >
            <StatCard
              title="Failed runs"
              badgeText="Failed"
              value={stats.totalFailed}
              icon={XCircle}
              description={`${stats.totalFailed} need${stats.totalFailed === 1 ? 's' : ''} attention`}
              colorTheme="red"
              isLoading={loading}
            />
            <StatCard
              title="Total automations"
              badgeText="Total"
              value={stats.total}
              icon={Zap}
              description={`${stats.total} configured`}
              colorTheme="blue"
              isLoading={loading}
            />
            <StatCard
              title="Running enrollments"
              badgeText="Running"
              value={stats.running}
              icon={Users}
              description={`${stats.running} in progress`}
              colorTheme="orange"
              isLoading={loading}
            />
            <StatCard
              title="Active automations"
              badgeText="Active"
              value={stats.active}
              icon={Play}
              description={`${stats.active} switched on`}
              colorTheme="blue"
              isLoading={loading}
            />
            <StatCard
              title="Completed runs"
              badgeText="Completed"
              value={stats.totalCompleted}
              icon={CheckCircle}
              description={`${stats.totalCompleted} successful`}
              colorTheme="green"
              isLoading={loading}
            />
      </ResponsiveCardRail>

      {/* Workflows list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <ErrorState
              title="Automations unavailable"
              description={loadError}
              icon={Zap}
              onAction={() => void fetchWorkflows()}
              className="p-12"
            />
          ) : workflows.length === 0 ? (
            <EmptyState
              icon={Zap}
              title={hasQuery ? 'No matching automations' : 'No automations yet'}
              description={hasQuery
                ? 'Try a different search or clear the current filters.'
                : 'Create your first automation to handle repeatable work.'}
              actionLabel={hasQuery ? 'Clear filters' : 'Create automation'}
              onAction={hasQuery ? clearQuery : () => navigate('/automations/new')}
              className="p-12"
            />
          ) : (
            <div className="divide-y">
              {workflows.map((workflow) => {
                const statusVisual = getWorkflowStatusVisual(workflow.is_active);
                const TriggerIcon = TRIGGER_TYPE_ICONS[workflow.trigger_type] ?? Zap;
                const working = workingWorkflowId === workflow.id;
                return (
                <div key={workflow.id} className="flex items-center gap-2 px-3 transition-colors hover:bg-muted/50 sm:px-4">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 py-4 text-left sm:gap-4"
                    onClick={() => navigate(`/automations/${workflow.id}`)}
                    aria-label={`Edit ${workflow.name}`}
                  >
                      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', statusVisual.iconBackgroundClass)}>
                        <TriggerIcon className={cn('h-5 w-5', statusVisual.iconClass)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm md:text-base truncate">{workflow.name}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                          <span className="truncate">{WORKFLOW_TRIGGER_LABELS[workflow.trigger_type]}</span>
                          <Badge className={cn('text-xs', statusVisual.badgeClass)}>
                            {statusVisual.label}
                          </Badge>
                          <span>{workflow.step_count || 0} steps</span>
                          <span>{workflow.active_enrollments || 0} active</span>
                        </div>
                      </div>
                  </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        checked={workflow.is_active}
                        onCheckedChange={() => handleToggleWorkflow(workflow)}
                        disabled={working}
                        aria-label={`${workflow.is_active ? 'Deactivate' : 'Activate'} ${workflow.name}`}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={working} aria-label={`More actions for ${workflow.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/automations/${workflow.id}`)} className="group/menu">
                            <Zap className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
                            Edit Workflow
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateWorkflow(workflow)} className="group/menu">
                            <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setWorkflowToDelete(workflow)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
      <DeleteDialog
        open={Boolean(workflowToDelete)}
        onOpenChange={(open) => !open && setWorkflowToDelete(null)}
        onConfirm={handleDeleteWorkflow}
        itemType="workflow"
        itemTitle={workflowToDelete?.name}
      />
    </PageLayout>
  );
}

export default AutomationsPage;
