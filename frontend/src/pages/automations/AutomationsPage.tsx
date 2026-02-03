import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { 
  Plus, Search, Zap, Play, Pause, MoreHorizontal, Copy, Trash2, 
  Mail, Tag, Clock, Users, TrendingUp, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

// Color helper functions for stat cards (matching dashboard/invoice page visual language)
const getStatBadgeClasses = (theme: string) => {
    switch (theme) {
        case 'green': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'orange': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
        case 'blue': return 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300';
        case 'purple': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
        case 'red': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
};

const getStatIconBgClasses = (theme: string) => {
    switch (theme) {
        case 'green': return 'bg-green-100 dark:bg-green-900';
        case 'orange': return 'bg-orange-100 dark:bg-orange-900';
        case 'blue': return 'bg-sky-100 dark:bg-sky-900';
        case 'purple': return 'bg-purple-100 dark:bg-purple-900';
        case 'red': return 'bg-red-100 dark:bg-red-900';
        default: return 'bg-gray-100 dark:bg-gray-800';
    }
};

const getStatValueColor = (theme: string) => {
    switch (theme) {
        case 'green': return 'text-green-600';
        case 'orange': return 'text-orange-600';
        case 'blue': return 'text-sky-600';
        case 'purple': return 'text-purple-600';
        case 'red': return 'text-red-600';
        default: return 'text-gray-600';
    }
};

const getStatIconColor = (theme: string) => {
    switch (theme) {
        case 'green': return 'text-green-600 dark:text-green-400';
        case 'orange': return 'text-orange-600 dark:text-orange-400';
        case 'blue': return 'text-sky-600 dark:text-sky-400';
        case 'purple': return 'text-purple-600 dark:text-purple-400';
        case 'red': return 'text-red-600 dark:text-red-400';
        default: return 'text-gray-400 dark:text-gray-500';
    }
};
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
import { usePageHeader } from '@/hooks/usePageHeader';
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
import { MobileControlsBar } from '@/components/MobileControlsBar';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  contact_added: 'Contact Added',
  tag_added: 'Tag Added',
  tag_removed: 'Tag Removed',
  deal_stage_changed: 'Deal Stage Changed',
  form_submitted: 'Form Submitted',
  manual: 'Manual',
  scheduled: 'Scheduled',
  contact_updated: 'Contact Updated',
};

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
  const { theme } = useTheme();

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

  usePageHeader(
    {
      title: 'Workflows',
      icon: <Zap className="h-5 w-5 text-blue-600 flex-shrink-0" />,
      leftClassName: 'min-w-0 flex-1',
      rightClassName: 'flex-shrink-0',
      titleClassName: 'min-w-0',
      rightContent: (
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
              <SelectItem value="contact_added">Contact Added</SelectItem>
              <SelectItem value="tag_added">Tag Added</SelectItem>
              <SelectItem value="deal_stage_changed">Deal Stage Changed</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
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
      ),
      theme
    },
    [searchQuery, triggerFilter, statusFilter, theme, navigate]
  );

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
        trigger_type: triggerFilter !== 'all' ? triggerFilter : undefined,
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
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update workflow',
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
      <PageContainer>
        <PageSurface className="max-w-lg mx-auto mt-12" contentClassName="pt-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-medium mb-2">Automations Not Ready</h3>
          <p className="text-muted-foreground mb-4">{initError}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </PageSurface>
      </PageContainer>
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
    <>
      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={completeOnboarding}
        onDismiss={dismissOnboarding}
        content={ONBOARDING_CONTENT.automations}
      />

      <MobileControlsBar className="flex-col items-stretch">
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
              <SelectItem value="contact_added">Contact Added</SelectItem>
              <SelectItem value="tag_added">Tag Added</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
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
      </MobileControlsBar>
      <PageContainer>
        <PageSurface>
        {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        {loading ? (
          <>
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Skeleton className="h-5 w-20 mb-2" />
                      <Skeleton className="h-8 w-24 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            {/* Critical - Red (Needs Attention) */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('red')}`}>Inactive</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('red')}`}>{stats.inactive}</p>
                    <p className="text-xs text-muted-foreground">Inactive Workflows</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('red')}`}>
                    <Pause className={`h-5 w-5 ${getStatIconColor('red')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* General Overview - Blue (Primary Metrics) */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('blue')}`}>Total</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('blue')}`}>{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total Workflows</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('blue')}`}>
                    <Zap className={`h-5 w-5 ${getStatIconColor('blue')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Warning - Orange (Attention Needed) */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('orange')}`}>Enrolled</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('orange')}`}>{stats.totalEnrolled}</p>
                    <p className="text-xs text-muted-foreground">Total Enrolled</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('orange')}`}>
                    <Users className={`h-5 w-5 ${getStatIconColor('orange')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Success - Green (Positive Outcome) */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('green')}`}>Active</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('green')}`}>{stats.active}</p>
                    <p className="text-xs text-muted-foreground">Active Workflows</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('green')}`}>
                    <Play className={`h-5 w-5 ${getStatIconColor('green')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Success - Green (Positive Outcome) */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className={`text-xs mb-2 ${getStatBadgeClasses('green')}`}>Completed</Badge>
                    <p className={`text-2xl font-bold ${getStatValueColor('green')}`}>{stats.totalCompleted}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getStatIconBgClasses('green')}`}>
                    <CheckCircle className={`h-5 w-5 ${getStatIconColor('green')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
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
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first automation workflow to get started
              </p>
              <Button 
                onClick={() => navigate('/automations/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            </div>
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
                          <span className="truncate">{TRIGGER_TYPE_LABELS[workflow.trigger_type]}</span>
                          <Badge className={`text-xs ${getStatBadgeClasses(workflow.is_active ? 'green' : 'red')}`}>
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
                            className="text-destructive"
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
    </PageSurface>
    </PageContainer>
    </>
  );
}

export default AutomationsPage;
