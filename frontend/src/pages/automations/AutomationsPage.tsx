import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Zap, Play, Pause, MoreHorizontal, Copy, Trash2, 
  Mail, Tag, Clock, Users, TrendingUp, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { getStatBadgeClass } from '@/hooks/useStatStyles';
import { StatCard } from '@/components/StatCard';
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

const TRIGGER_TYPE_ICONS: Record<string, React.ReactNode> = {
  contact_added: <Users className="h-4 w-4" />,
  tag_added: <Tag className="h-4 w-4" />,
  tag_removed: <Tag className="h-4 w-4" />,
  deal_stage_changed: <TrendingUp className="h-4 w-4" />,
  form_submitted: <Mail className="h-4 w-4" />,
  manual: <Play className="h-4 w-4" />,
  scheduled: <Clock className="h-4 w-4" />,
  contact_updated: <Users className="h-4 w-4" />,
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
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

    setLoading(true);
    try {
      const response = await getWorkflows(organizationId, {
        trigger_type: triggerFilter !== 'all'
          ? triggerFilter as WorkflowTriggerType
          : undefined,
        is_active: statusFilter !== 'all' ? statusFilter === 'active' : undefined,
        search: searchQuery || undefined,
      });

      setWorkflows(response.workflows);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      toast({
        title: 'Error',
        description: 'Failed to load workflows',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, orgLoading, triggerFilter, statusFilter, searchQuery, toast]);

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

    try {
      if (workflow.is_active) {
        await deactivateWorkflow(workflow.id, organizationId);
        toast({ title: 'Deactivated', description: 'Workflow deactivated successfully' });
      } else {
        await activateWorkflow(workflow.id, organizationId);
        toast({ title: 'Activated', description: 'Workflow activated successfully' });
      }
      fetchWorkflows();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to update workflow'),
        variant: 'destructive',
      });
    }
  };

  // Handle delete
  const handleDeleteWorkflow = async (workflow: Workflow) => {
    if (!organizationId) return;

    try {
      await deleteWorkflow(workflow.id, organizationId);
      toast({ title: 'Deleted', description: 'Workflow deleted successfully' });
      fetchWorkflows();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete workflow',
        variant: 'destructive',
      });
    }
  };

  // Handle duplicate
  const handleDuplicateWorkflow = async (workflow: Workflow) => {
    if (!organizationId) return;

    try {
      await duplicateWorkflow(workflow.id, organizationId);
      toast({ title: 'Duplicated', description: 'Workflow duplicated successfully' });
      fetchWorkflows();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to duplicate workflow',
        variant: 'destructive',
      });
    }
  };

  // Show error state
  if (initError) {
    return (
      <PageLayout
        title="WORKFLOWS"
        icon={<Zap className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      >
        <ErrorState
          title="Automations Not Ready"
          description={initError}
          icon={Zap}
          onAction={() => window.location.reload()}
        />
      </PageLayout>
    );
  }

  // Stats calculation
  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.is_active).length,
    inactive: workflows.filter(w => !w.is_active).length,
    totalEnrolled: workflows.reduce((sum, w) => sum + (w.stats?.enrolled || 0), 0),
    totalCompleted: workflows.reduce((sum, w) => sum + (w.stats?.completed || 0), 0),
  };

  return (
    <PageLayout
      title="WORKFLOWS"
      icon={<Zap className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      mobileClassName="flex-col items-stretch"
      headerActions={
        <>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors font-raleway"
            />
          </div>
          <Select value={triggerFilter} onValueChange={setTriggerFilter}>
            <SelectTrigger className="w-[150px] h-9 bg-muted/20 border-border/50">
              <Zap className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triggers</SelectItem>
              {WORKFLOW_TRIGGER_OPTIONS.map(({ type, label }) => (
                <SelectItem key={type} value={type}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 bg-muted/20 border-border/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
            onClick={() => navigate('/automations/new')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </Button>
        </>
      }
      mobileActions={
        <>
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search workflows..."
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
                <SelectItem value="all">All Triggers</SelectItem>
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
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9"
              onClick={() => navigate('/automations/new')}
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
            <StatCard
              title="Inactive Workflows"
              badgeText="Inactive"
              value={stats.inactive}
              icon={Pause}
              description="Inactive Workflows"
              colorTheme="red"
              isLoading={loading}
            />
            <StatCard
              title="Total Workflows"
              badgeText="Total"
              value={stats.total}
              icon={Zap}
              description="Total Workflows"
              colorTheme="blue"
              isLoading={loading}
            />
            <StatCard
              title="Total Enrolled"
              badgeText="Enrolled"
              value={stats.totalEnrolled}
              icon={Users}
              description="Total Enrolled"
              colorTheme="orange"
              isLoading={loading}
            />
            <StatCard
              title="Active Workflows"
              badgeText="Active"
              value={stats.active}
              icon={Play}
              description="Active Workflows"
              colorTheme="green"
              isLoading={loading}
            />
            <StatCard
              title="Completed"
              badgeText="Completed"
              value={stats.totalCompleted}
              icon={CheckCircle}
              description="Completed"
              colorTheme="green"
              isLoading={loading}
            />
      </div>

      {/* Workflows list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No workflows yet"
              description="Create your first automation workflow to get started"
              actionLabel="Create Workflow"
              onAction={() => navigate('/automations/new')}
              className="p-12"
            />
          ) : (
            <div className="divide-y">
              {workflows.map((workflow) => (
                <div 
                  key={workflow.id} 
                  className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/automations/${workflow.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className={`p-2 rounded-lg ${workflow.is_active ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                        {TRIGGER_TYPE_ICONS[workflow.trigger_type] || <Zap className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm md:text-base truncate">{workflow.name}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                          <span className="truncate">{WORKFLOW_TRIGGER_LABELS[workflow.trigger_type]}</span>
                          <Badge className={`text-xs ${getStatBadgeClass(workflow.is_active ? 'green' : 'red')}`}>
                            {workflow.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <span>{workflow.step_count || 0} steps</span>
                          <span>{workflow.active_enrollments || 0} active</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={workflow.is_active}
                        onCheckedChange={() => handleToggleWorkflow(workflow)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/automations/${workflow.id}`)} className="group/menu">
                            <Zap className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                            Edit Workflow
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateWorkflow(workflow)} className="group/menu">
                            <Copy className="h-4 w-4 mr-2 transition-colors group-hover/menu:text-blue-600" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteWorkflow(workflow)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
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
    </PageLayout>
  );
}

export default AutomationsPage;
