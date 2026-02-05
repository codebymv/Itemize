import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  NodeTypes,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Plus,
  Mail,
  Tag,
  Clock,
  Users,
  Zap,
  GitBranch,
  Webhook,
  CheckSquare,
  Trash2,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageLoading } from '@/components/ui/page-loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { useOrganization } from '@/hooks/useOrganization';
import {
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  Workflow,
  WorkflowStep,
  getEmailTemplates,
  EmailTemplate,
} from '@/services/automationsApi';
import { MobileControlsBar } from '@/components/MobileControlsBar';

// Custom node component for workflow steps
const StepNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const iconMap: Record<string, React.ReactNode> = {
    send_email: <Mail className="h-4 w-4" />,
    add_tag: <Tag className="h-4 w-4" />,
    remove_tag: <Tag className="h-4 w-4" />,
    wait: <Clock className="h-4 w-4" />,
    create_task: <CheckSquare className="h-4 w-4" />,
    condition: <GitBranch className="h-4 w-4" />,
    webhook: <Webhook className="h-4 w-4" />,
    update_contact: <Users className="h-4 w-4" />,
  };

  const colorMap: Record<string, string> = {
    send_email: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300',
    add_tag: 'bg-green-100 dark:bg-green-900/30 border-green-300',
    remove_tag: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300',
    wait: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300',
    create_task: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300',
    condition: 'bg-pink-100 dark:bg-pink-900/30 border-pink-300',
    webhook: 'bg-gray-100 dark:bg-gray-900/30 border-gray-300',
    update_contact: 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-300',
  };

  return (
    <div 
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] ${colorMap[data.step_type] || 'bg-muted border-border'} ${selected ? 'ring-2 ring-blue-600' : ''}`}
    >
      <div className="flex items-center gap-2">
        {iconMap[data.step_type] || <Zap className="h-4 w-4" />}
        <span className="font-medium text-sm">{data.label}</span>
      </div>
      {data.description && (
        <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
      )}
    </div>
  );
};

// Trigger node component
const TriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  return (
    <div 
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 ${selected ? 'ring-2 ring-blue-600' : ''}`}
    >
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4" />
        <span className="font-medium text-sm">Trigger</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{data.label}</p>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  step: StepNode,
  trigger: TriggerNode,
};

const TRIGGER_TYPES = [
  { value: 'contact_added', label: 'Contact Added' },
  { value: 'tag_added', label: 'Tag Added' },
  { value: 'tag_removed', label: 'Tag Removed' },
  { value: 'deal_stage_changed', label: 'Deal Stage Changed' },
  { value: 'manual', label: 'Manual Trigger' },
  { value: 'scheduled', label: 'Scheduled' },
];

const STEP_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: Mail },
  { value: 'add_tag', label: 'Add Tag', icon: Tag },
  { value: 'remove_tag', label: 'Remove Tag', icon: Tag },
  { value: 'wait', label: 'Wait / Delay', icon: Clock },
  { value: 'create_task', label: 'Create Task', icon: CheckSquare },
  { value: 'condition', label: 'Condition', icon: GitBranch },
  { value: 'webhook', label: 'Webhook', icon: Webhook },
  { value: 'update_contact', label: 'Update Contact', icon: Users },
];

export function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { theme } = useTheme();

  const { organizationId } = useOrganization({
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to initialize',
        variant: 'destructive',
      });
      return 'Failed to initialize';
    }
  });
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Workflow form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<string>('contact_added');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [isActive, setIsActive] = useState(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showStepConfig, setShowStepConfig] = useState(false);

  // Email templates for email step config
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

  const isNewWorkflow = !id || id === 'new';

  // Set header content
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate('/automations')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Zap className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <h1 
            className="text-xl font-semibold italic truncate min-w-0" 
            style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            {(isNewWorkflow ? 'New Workflow' : name || 'Workflow').toUpperCase()}
          </h1>
        </div>
        {/* Desktop-only controls */}
        <div className="hidden md:flex items-center gap-2 mr-4 flex-shrink-0">
          {!isNewWorkflow && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleActive}
              disabled={saving}
            >
              {isActive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isActive ? 'Deactivate' : 'Activate'}
            </Button>
          )}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [name, isActive, saving, isNewWorkflow, theme, navigate, setHeaderContent]);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
    }
  }, [organizationId]);

  // Fetch workflow and email templates
  useEffect(() => {
    const fetchData = async () => {
      if (!organizationId) return;

      setLoading(true);
      try {
        // Fetch email templates
        const templatesResponse = await getEmailTemplates(organizationId);
        setEmailTemplates(templatesResponse.templates);

        // Fetch workflow if editing
        if (!isNewWorkflow && id) {
          const workflowData = await getWorkflow(parseInt(id), organizationId);
          setWorkflow(workflowData);
          setName(workflowData.name);
          setDescription(workflowData.description || '');
          setTriggerType(workflowData.trigger_type);
          setTriggerConfig(workflowData.trigger_config || {});
          setIsActive(workflowData.is_active);

          // Convert steps to nodes
          const stepNodes = (workflowData.steps || []).map((step, index) => ({
            id: `step-${step.step_order}`,
            type: 'step',
            position: { x: 250, y: 100 + index * 120 },
            data: {
              label: getStepLabel(step.step_type),
              step_type: step.step_type,
              step_config: step.step_config,
              description: getStepDescription(step),
            },
          }));

          // Add trigger node
          const triggerNode: Node = {
            id: 'trigger',
            type: 'trigger',
            position: { x: 250, y: 0 },
            data: {
              label: TRIGGER_TYPES.find(t => t.value === workflowData.trigger_type)?.label || 'Trigger',
              trigger_type: workflowData.trigger_type,
            },
          };

          setNodes([triggerNode, ...stepNodes]);

          // Create edges
          const newEdges: Edge[] = [];
          if (stepNodes.length > 0) {
            newEdges.push({
              id: 'trigger-to-step-1',
              source: 'trigger',
              target: stepNodes[0].id,
              markerEnd: { type: MarkerType.ArrowClosed },
            });
          }
          for (let i = 0; i < stepNodes.length - 1; i++) {
            newEdges.push({
              id: `edge-${i}`,
              source: stepNodes[i].id,
              target: stepNodes[i + 1].id,
              markerEnd: { type: MarkerType.ArrowClosed },
            });
          }
          setEdges(newEdges);
        } else {
          // New workflow - add trigger node
          setNodes([{
            id: 'trigger',
            type: 'trigger',
            position: { x: 250, y: 0 },
            data: {
              label: 'Contact Added',
              trigger_type: 'contact_added',
            },
          }]);
        }
      } catch (error) {
        console.error('Error fetching workflow:', error);
        toast({
          title: 'Error',
          description: 'Failed to load workflow',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId, id, isNewWorkflow]);

  const getStepLabel = (stepType: string) => {
    return STEP_TYPES.find(s => s.value === stepType)?.label || stepType;
  };

  const getStepDescription = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'send_email':
        return step.step_config?.template_name || 'Send email';
      case 'add_tag':
        return `Add: ${step.step_config?.tag_name || 'tag'}`;
      case 'remove_tag':
        return `Remove: ${step.step_config?.tag_name || 'tag'}`;
      case 'wait':
        const days = step.step_config?.delay_days || 0;
        const hours = step.step_config?.delay_hours || 0;
        const mins = step.step_config?.delay_minutes || 0;
        return `Wait ${days}d ${hours}h ${mins}m`;
      case 'create_task':
        return step.step_config?.title || 'Create task';
      default:
        return '';
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    if (node.type === 'step') {
      setShowStepConfig(true);
    }
  }, []);

  const handleAddStep = (stepType: string) => {
    const stepNodes = nodes.filter(n => n.type === 'step');
    const newStepOrder = stepNodes.length + 1;
    const lastNode = stepNodes[stepNodes.length - 1] || nodes.find(n => n.id === 'trigger');
    
    const newNode: Node = {
      id: `step-${newStepOrder}`,
      type: 'step',
      position: { 
        x: lastNode?.position.x || 250, 
        y: (lastNode?.position.y || 0) + 120 
      },
      data: {
        label: getStepLabel(stepType),
        step_type: stepType,
        step_config: {},
        description: '',
      },
    };

    setNodes((nds) => [...nds, newNode]);

    // Connect to previous node
    const sourceId = lastNode?.id || 'trigger';
    setEdges((eds) => [
      ...eds,
      {
        id: `edge-to-${newNode.id}`,
        source: sourceId,
        target: newNode.id,
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ]);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === 'trigger') return; // Can't delete trigger
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    setShowStepConfig(false);
  };

  const handleUpdateNodeConfig = (config: Record<string, any>) => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, step_config: config, description: getStepDescriptionFromConfig(n.data.step_type, config) } }
          : n
      )
    );
  };

  const getStepDescriptionFromConfig = (stepType: string, config: Record<string, any>) => {
    switch (stepType) {
      case 'send_email':
        const template = emailTemplates.find(t => t.id === config.template_id);
        return template?.name || 'Select template';
      case 'add_tag':
        return `Add: ${config.tag_name || 'tag'}`;
      case 'remove_tag':
        return `Remove: ${config.tag_name || 'tag'}`;
      case 'wait':
        return `Wait ${config.delay_days || 0}d ${config.delay_hours || 0}h ${config.delay_minutes || 0}m`;
      case 'create_task':
        return config.title || 'Create task';
      default:
        return '';
    }
  };

  const handleSave = async () => {
    if (!organizationId || !name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a workflow name',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Convert nodes to steps
      const stepNodes = nodes
        .filter(n => n.type === 'step')
        .sort((a, b) => a.position.y - b.position.y);

      const steps: Omit<WorkflowStep, 'id' | 'workflow_id'>[] = stepNodes.map((node, index) => ({
        step_order: index + 1,
        step_type: node.data.step_type,
        step_config: node.data.step_config || {},
      }));

      if (isNewWorkflow) {
        const newWorkflow = await createWorkflow({
          organization_id: organizationId,
          name,
          description,
          trigger_type: triggerType as Workflow['trigger_type'],
          trigger_config: triggerConfig,
          steps,
        });
        toast({ title: 'Created', description: 'Workflow created successfully' });
        navigate(`/automations/${newWorkflow.id}`);
      } else if (id) {
        await updateWorkflow(parseInt(id), {
          organization_id: organizationId,
          name,
          description,
          trigger_type: triggerType as Workflow['trigger_type'],
          trigger_config: triggerConfig,
          steps,
        });
        toast({ title: 'Saved', description: 'Workflow saved successfully' });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save workflow',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!organizationId || !id) return;

    try {
      if (isActive) {
        await deactivateWorkflow(parseInt(id), organizationId);
        setIsActive(false);
        toast({ title: 'Deactivated', description: 'Workflow deactivated successfully' });
      } else {
        await activateWorkflow(parseInt(id), organizationId);
        setIsActive(true);
        toast({ title: 'Activated', description: 'Workflow activated successfully' });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update workflow',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <PageLoading message="Loading workflow..." className="h-full" />;
  }

  return (
    <>
      <MobileControlsBar>
        {!isNewWorkflow && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActive}
            disabled={saving}
            className="flex-1"
          >
            {isActive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isActive ? 'Deactivate' : 'Activate'}
          </Button>
        )}
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </MobileControlsBar>
      <div className="h-full flex">
        {/* Left sidebar - Step palette */}
      <div className="w-64 border-r bg-muted/20 p-4 overflow-y-auto">
        <h3 className="font-medium mb-4">Workflow Settings</h3>
        
        <div className="space-y-4 mb-6">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>
          <div>
            <Label>Trigger</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <h3 className="font-medium mb-4">Add Steps</h3>
        <div className="space-y-2">
          {STEP_TYPES.map((step) => (
            <Button
              key={step.value}
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAddStep(step.value)}
            >
              <step.icon className="h-4 w-4 mr-2" />
              {step.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Main canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-muted/10"
        >
          <Controls />
          <Background />
          <Panel position="top-right" className="bg-background border rounded-lg p-2">
            <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-green-500' : ''}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          </Panel>
        </ReactFlow>
      </div>

      {/* Right sidebar - Step configuration */}
      <Sheet open={showStepConfig} onOpenChange={setShowStepConfig}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Configure Step</SheetTitle>
          </SheetHeader>
          {selectedNode && selectedNode.type === 'step' && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Badge>{getStepLabel(selectedNode.data.step_type)}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Step-specific configuration */}
              {selectedNode.data.step_type === 'send_email' && (
                <div>
                  <Label>Email Template</Label>
                  <Select
                    value={selectedNode.data.step_config?.template_id?.toString() || ''}
                    onValueChange={(v) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, template_id: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {emailTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(selectedNode.data.step_type === 'add_tag' || selectedNode.data.step_type === 'remove_tag') && (
                <div>
                  <Label>Tag Name</Label>
                  <Input
                    value={selectedNode.data.step_config?.tag_name || ''}
                    onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, tag_name: e.target.value })}
                    placeholder="Enter tag name"
                  />
                </div>
              )}

              {selectedNode.data.step_type === 'wait' && (
                <div className="space-y-3">
                  <div>
                    <Label>Days</Label>
                    <Input
                      type="number"
                      min="0"
                      value={selectedNode.data.step_config?.delay_days || 0}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, delay_days: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Hours</Label>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={selectedNode.data.step_config?.delay_hours || 0}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, delay_hours: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Minutes</Label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={selectedNode.data.step_config?.delay_minutes || 0}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, delay_minutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}

              {selectedNode.data.step_type === 'create_task' && (
                <div className="space-y-3">
                  <div>
                    <Label>Task Title</Label>
                    <Input
                      value={selectedNode.data.step_config?.title || ''}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, title: e.target.value })}
                      placeholder="Follow up with {{first_name}}"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={selectedNode.data.step_config?.description || ''}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, description: e.target.value })}
                      placeholder="Task description"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Due in (days)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={selectedNode.data.step_config?.due_days || 1}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, due_days: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              )}

              {selectedNode.data.step_type === 'webhook' && (
                <div className="space-y-3">
                  <div>
                    <Label>Webhook URL</Label>
                    <Input
                      value={selectedNode.data.step_config?.url || ''}
                      onChange={(e) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label>Method</Label>
                    <Select
                      value={selectedNode.data.step_config?.method || 'POST'}
                      onValueChange={(v) => handleUpdateNodeConfig({ ...selectedNode.data.step_config, method: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
    </>
  );
}

export default WorkflowBuilderPage;
