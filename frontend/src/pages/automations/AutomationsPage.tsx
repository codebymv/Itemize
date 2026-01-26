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
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { 
  getWorkflows, 
  activateWorkflow, 
  deactivateWorkflow, 
  deleteWorkflow,
  duplicateWorkflow,
  Workflow 
} from '@/services/automationsApi';

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
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Set header content following workspace pattern
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2">
          <Zap className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 
            className="text-xl font-semibold italic truncate" 
            style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            AUTOMATIONS | All
          </h1>
        </div>
        <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
          {/* Desktop search */}
          <div className="relative hidden md:block w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            />
          </div>
          {/* Trigger filter */}
          <Select value={triggerFilter} onValueChange={setTriggerFilter}>
            <SelectTrigger className="w-[150px] h-9 bg-muted/20 border-border/50 hidden sm:flex">
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
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 bg-muted/20 border-border/50 hidden sm:flex">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {/* Create Workflow Button */}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap font-light"
            onClick={() => navigate('/automations/new')}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Create Workflow</span>
          </Button>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [searchQuery, triggerFilter, statusFilter, theme, navigate, setHeaderContent]);

  // Initialize organization
  useEffect(() => {
    const initOrg = async () => {
      try {
        const org = await ensureDefaultOrganization();
        setOrganizationId(org.id);
        setInitError(null);
      } catch (error: any) {
        console.error('Error initializing organization:', error);
        setInitError('Failed to initialize. Please check your connection.');
        setLoading(false);
      }
    };
    initOrg();
  }, []);

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    if (!organizationId) return;

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
  }, [organizationId, triggerFilter, statusFilter, searchQuery]);

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
      <div className="container mx-auto p-6 max-w-7xl">
        <Card className="max-w-lg mx-auto mt-12">
          <CardContent className="pt-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-medium mb-2">Automations Not Ready</h3>
            <p className="text-muted-foreground mb-4">{initError}</p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats calculation
  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.is_active).length,
    totalEnrolled: workflows.reduce((sum, w) => sum + (w.stats?.enrolled || 0), 0),
    totalCompleted: workflows.reduce((sum, w) => sum + (w.stats?.completed || 0), 0),
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Mobile controls */}
      <div className="sm:hidden flex flex-col gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={triggerFilter} onValueChange={setTriggerFilter}>
            <SelectTrigger className="flex-1">
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
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Workflows</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Zap className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <Play className="h-8 w-8 text-green-600/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Enrolled</p>
                <p className="text-2xl font-bold">{stats.totalEnrolled}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalCompleted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-600/50" />
            </div>
          </CardContent>
        </Card>
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
                      <div className={`p-2 rounded-lg ${workflow.is_active ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                        {TRIGGER_TYPE_ICONS[workflow.trigger_type] || <Zap className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">{workflow.name}</h3>
                          <Badge variant={workflow.is_active ? 'default' : 'secondary'} className={workflow.is_active ? 'bg-green-500' : ''}>
                            {workflow.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{TRIGGER_TYPE_LABELS[workflow.trigger_type]}</span>
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
    </div>
  );
}

export default AutomationsPage;
