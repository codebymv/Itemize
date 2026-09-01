import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Node,
  Edge,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  MarkerType,
  NodeTypes,
  Panel,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
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
  ListPlus,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageLoading } from '@/components/ui/page-loading';
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
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { ErrorState } from '@/components/ErrorState';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { OrganizationEmailTemplateBrowserDialog } from '@/components/email/OrganizationEmailTemplateBrowserDialog';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import {
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  Workflow,
  WorkflowStep,
  EmailTemplate,
} from '@/services/automationsApi';
import {
  WORKFLOW_STEP_LABELS,
  WORKFLOW_TRIGGER_OPTIONS,
} from '@/domain/workflowRegistry';
import { WorkflowEnrollmentsDialog } from './WorkflowEnrollmentsDialog';
import { getWorkflowStatusVisual } from './constants/workflowConstants';
import { cn } from '@/lib/utils';
import { serializeWorkflowNodes } from './workflowEditorModel';
import { CanvasViewControls } from '@/components/Canvas/CanvasViewControls';
import { workflowQueryKeys } from '@/services/workflowQueryKeys';

function WorkflowCanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();

  return (
    <CanvasViewControls
      zoom={zoom}
      onZoomOut={() => void zoomOut({ duration: 200 })}
      onResetView={() => void fitView({ padding: 0.2, duration: 200 })}
      onZoomIn={() => void zoomIn({ duration: 200 })}
      ariaLabel="Automation canvas view controls"
      className="nodrag nopan nowheel"
    />
  );
}

// Custom node component for workflow steps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StepNode = ({ data, selected }: { data: Record<string, any>; selected: boolean }) => {
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

  return (
    <div 
      className={cn(
        'min-w-[180px] rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/50',
        selected && 'ring-2 ring-blue-600 dark:ring-blue-400',
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      <div className="flex items-center gap-2">
        <span className="text-blue-600 dark:text-blue-400">{iconMap[data.step_type] || <Zap className="h-4 w-4" />}</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
      {data.description && (
        <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
    </div>
  );
};

// Trigger node component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TriggerNode = ({ data, selected }: { data: Record<string, any>; selected: boolean }) => {
  return (
    <div 
      className={cn(
        'min-w-[180px] rounded-lg border-2 border-blue-300 bg-blue-100 px-4 py-3 dark:border-blue-700 dark:bg-blue-900/70',
        selected && 'ring-2 ring-blue-600 dark:ring-blue-400',
      )}
    >
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="font-medium text-sm">Trigger</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  step: StepNode,
  trigger: TriggerNode,
};

const buildLinearEdges = (stepNodes: Node[]): Edge[] => {
  const ordered = [...stepNodes].sort((a, b) => a.position.y - b.position.y);
  if (ordered.length === 0) return [];
  return [
    {
      id: `trigger-to-${ordered[0].id}`,
      source: 'trigger',
      target: ordered[0].id,
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    ...ordered.slice(1).map((node, index) => ({
      id: `${ordered[index].id}-to-${node.id}`,
      source: ordered[index].id,
      target: node.id,
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  ];
};

const TRIGGER_TYPES = WORKFLOW_TRIGGER_OPTIONS.map(({ type, label }) => ({
  value: type,
  label,
}));

const STEP_TYPES = [
  { value: 'send_email', label: WORKFLOW_STEP_LABELS.send_email, icon: Mail },
  { value: 'add_tag', label: WORKFLOW_STEP_LABELS.add_tag, icon: Tag },
  { value: 'remove_tag', label: WORKFLOW_STEP_LABELS.remove_tag, icon: Tag },
  { value: 'wait', label: WORKFLOW_STEP_LABELS.wait, icon: Clock },
  { value: 'create_task', label: WORKFLOW_STEP_LABELS.create_task, icon: CheckSquare },
  { value: 'condition', label: WORKFLOW_STEP_LABELS.condition, icon: GitBranch },
  { value: 'webhook', label: WORKFLOW_STEP_LABELS.webhook, icon: Webhook },
  { value: 'update_contact', label: WORKFLOW_STEP_LABELS.update_contact, icon: Users },
];

export function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
  const [loading, setLoading] = useState(true);
  const { pending: saving, run: runMutation } = useSingleFlightAction();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  
  // Workflow form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<string>('contact_added');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [isActive, setIsActive] = useState(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showStepConfig, setShowStepConfig] = useState(false);
  const [showEnrollments, setShowEnrollments] = useState(false);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [showStepPalette, setShowStepPalette] = useState(false);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);

  // Email templates for email step config
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

  const isNewWorkflow = !id || id === 'new';
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEmailTemplate = emailTemplates.find(
    template => template.id === selectedNode?.data.step_config?.template_id,
  );

  const workflowDraft = useMemo(() => ({
    name,
    description,
    triggerType,
    triggerConfig,
    steps: nodes
      .filter((node) => node.type === 'step')
      .map((node) => ({
        id: node.id,
        y: node.position.y,
        stepType: node.data.step_type,
        stepConfig: node.data.step_config || {},
        conditionConfig: node.data.condition_config ?? null,
        trueBranchStep: node.data.true_branch_step ?? null,
        falseBranchStep: node.data.false_branch_step ?? null,
      })),
  }), [description, name, nodes, triggerConfig, triggerType]);
  const { isDirty, markClean } = useDirtyState({
    value: workflowDraft,
    ready: !loading,
    resetKey: id || 'new',
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: isDirty || saving,
    message: 'This workflow has unsaved changes. Leave this page anyway?',
  });


  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
    }
  }, [organizationId]);

  const validateForActivation = useCallback((): string | null => {
    const orderedSteps = nodes
      .filter(node => node.type === 'step')
      .sort((a, b) => a.position.y - b.position.y);
    if (orderedSteps.length === 0) return 'Add at least one step before activating this automation.';
    for (const node of orderedSteps) {
      const config = node.data.step_config || {};
      const label = getStepLabel(node.data.step_type);
      if (node.data.step_type === 'send_email' && !config.template_id) return `${label} needs an email template.`;
      if ((node.data.step_type === 'add_tag' || node.data.step_type === 'remove_tag') && !String(config.tag_name || '').trim()) {
        return `${label} needs a tag name.`;
      }
      if (node.data.step_type === 'webhook' && !String(config.url || '').trim()) return `${label} needs a URL.`;
      if (node.data.step_type === 'condition') {
        const condition = node.data.condition_config || {};
        if (!String(condition.field || '').trim() || !String(condition.operator || '').trim()) {
          return `${label} needs a field and operator.`;
        }
      }
      if (node.data.step_type === 'update_contact' && !config.status && !config.custom_fields) {
        return `${label} needs a status or custom-field update.`;
      }
    }
    return null;
  }, [nodes]);

  const persistWorkflow = useCallback(async (): Promise<Workflow | null> => {
    if (!organizationId || !name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a workflow name',
        variant: 'destructive',
      });
      return null;
    }

    try {
      // Convert nodes to steps
      const steps = serializeWorkflowNodes(nodes);

      if (isNewWorkflow) {
        const newWorkflow = await createWorkflow({
          organization_id: organizationId,
          name,
          description,
          trigger_type: triggerType as Workflow['trigger_type'],
          trigger_config: triggerConfig,
          steps,
        });
        await queryClient.invalidateQueries({ queryKey: workflowQueryKeys.queues(organizationId) });
        toast({ title: 'Created', description: 'Workflow created successfully' });
        navigate(`/automations/${newWorkflow.id}`);
        return newWorkflow;
      } else if (id) {
        const updatedWorkflow = await updateWorkflow(parseInt(id), {
          organization_id: organizationId,
          name,
          description,
          trigger_type: triggerType as Workflow['trigger_type'],
          trigger_config: triggerConfig,
          steps,
        });
        await queryClient.invalidateQueries({ queryKey: workflowQueryKeys.queues(organizationId) });
        markClean();
        toast({ title: 'Saved', description: 'Workflow saved successfully' });
        return updatedWorkflow;
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save workflow',
        variant: 'destructive',
      });
      return null;
    }
    return null;
  }, [organizationId, name, description, triggerType, triggerConfig, nodes, isNewWorkflow, id, navigate, toast, markClean, queryClient]);

  const handleSave = useCallback(
    async (): Promise<Workflow | null | undefined> => runMutation(persistWorkflow),
    [persistWorkflow, runMutation],
  );

  const handleToggleActive = useCallback(async () => {
    if (!organizationId || !id) return;

    await runMutation(async () => {
      try {
        if (isActive) {
          await deactivateWorkflow(parseInt(id), organizationId);
          setIsActive(false);
          toast({ title: 'Deactivated', description: 'Workflow deactivated successfully' });
        } else {
          const validationError = validateForActivation();
          if (validationError) {
            toast({ title: 'Automation not ready', description: validationError, variant: 'destructive' });
            return;
          }
          if (isDirty) {
            const saved = await persistWorkflow();
            if (!saved) return;
          }
          await activateWorkflow(parseInt(id), organizationId);
          setIsActive(true);
          toast({ title: 'Activated', description: 'Workflow activated successfully' });
        }
        await queryClient.invalidateQueries({ queryKey: workflowQueryKeys.queues(organizationId) });
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        toast({
          title: 'Error',
          description: error.response?.data?.error || 'Failed to update workflow',
          variant: 'destructive',
        });
      }
    });
  }, [organizationId, id, isActive, isDirty, persistWorkflow, toast, validateForActivation, queryClient, runMutation]);

  // Fetch workflow. Template discovery is owned by the lazy template browser.
  useEffect(() => {
    const fetchData = async () => {
      if (!organizationId) return;

      setLoading(true);
      setLoadError(null);
      try {
        // Fetch workflow if editing
        if (!isNewWorkflow && id) {
          const workflowData = await getWorkflow(parseInt(id), organizationId);
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
              condition_config: step.condition_config ?? null,
              true_branch_step: step.true_branch_step ?? null,
              false_branch_step: step.false_branch_step ?? null,
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
          setEdges([]);
        }
      } catch (error) {
        console.error('Error fetching workflow:', error);
        setLoadError('We could not load this automation. No workflow data has been changed.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId, id, isNewWorkflow, loadVersion, setEdges, setNodes]);

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
      case 'wait': {
        const days = step.step_config?.delay_days || 0;
        const hours = step.step_config?.delay_hours || 0;
        const mins = step.step_config?.delay_minutes || 0;
        return `Wait ${days}d ${hours}h ${mins}m`;
      }
      case 'create_task':
        return step.step_config?.title || 'Create task';
      case 'condition':
        return step.condition_config?.field
          ? `${step.condition_config.field} ${step.condition_config.operator || ''} · true → ${step.true_branch_step || 'next'} · false → ${step.false_branch_step || 'next'}`.trim()
          : 'Configure condition';
      case 'update_contact':
        return step.step_config?.status ? `Set status: ${step.step_config.status}` : 'Update contact';
      case 'webhook':
        return step.step_config?.url || 'Configure webhook';
      default:
        return '';
    }
  };

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    if (node.type === 'step') {
      setShowStepConfig(true);
    }
  }, []);

  const handleAddStep = (stepType: string) => {
    const stepNodes = nodes.filter(n => n.type === 'step');
    const lastNode = stepNodes[stepNodes.length - 1] || nodes.find(n => n.id === 'trigger');
    
    const newNode: Node = {
      id: `step-${Date.now()}-${stepNodes.length + 1}`,
      type: 'step',
      position: { 
        x: lastNode?.position.x || 250, 
        y: (lastNode?.position.y || 0) + 120 
      },
      data: {
        label: getStepLabel(stepType),
        step_type: stepType,
        step_config: {},
        condition_config: stepType === 'condition' ? {} : null,
        true_branch_step: null,
        false_branch_step: null,
        description: '',
      },
    };

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setEdges(buildLinearEdges(nextNodes.filter(node => node.type === 'step')));
    setShowStepPalette(false);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === 'trigger') return; // Can't delete trigger
    const orderedSteps = nodes
      .filter(node => node.type === 'step')
      .sort((a, b) => a.position.y - b.position.y);
    const removedIndex = orderedSteps.findIndex(node => node.id === nodeId) + 1;
    const remainingSteps = orderedSteps
      .filter(node => node.id !== nodeId)
      .map((node, index) => {
        const remapBranch = (value: unknown) => {
          const branch = Number(value);
          if (!Number.isInteger(branch) || branch === removedIndex) return null;
          return branch > removedIndex ? branch - 1 : branch;
        };
        return {
          ...node,
          position: { ...node.position, y: 100 + index * 120 },
          data: {
            ...node.data,
            true_branch_step: remapBranch(node.data.true_branch_step),
            false_branch_step: remapBranch(node.data.false_branch_step),
          },
        };
      });
    const trigger = nodes.find(node => node.id === 'trigger');
    const nextNodes = trigger ? [trigger, ...remainingSteps] : remainingSteps;
    setNodes(nextNodes);
    setEdges(buildLinearEdges(remainingSteps));
    setSelectedNodeId(null);
    setShowStepConfig(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const handleUpdateNodeData = (data: Record<string, unknown>) => {
    if (!selectedNode) return;
    setNodes(current => current.map(node => {
      if (node.id !== selectedNode.id) return node;
      const nextData = { ...node.data, ...data };
      if (nextData.step_type === 'condition') {
        const condition = nextData.condition_config || {};
        const field = String(condition.field || '').trim();
        nextData.description = field
          ? `${field} ${condition.operator || ''} · true → ${nextData.true_branch_step || 'next'} · false → ${nextData.false_branch_step || 'next'}`
          : 'Configure condition';
      }
      return { ...node, data: nextData };
    }));
  };

  const handleTriggerTypeChange = (value: string) => {
    setTriggerType(value);
    const label = TRIGGER_TYPES.find(trigger => trigger.value === value)?.label || 'Trigger';
    setNodes(current => current.map(node => (
      node.id === 'trigger'
        ? { ...node, data: { ...node.data, label, trigger_type: value } }
        : node
    )));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStepDescriptionFromConfig = (stepType: string, config: Record<string, any>) => {
    switch (stepType) {
      case 'send_email': {
        const template = emailTemplates.find(t => t.id === config.template_id);
        return template?.name || config.template_name || 'Select template';
      }
      case 'add_tag':
        return `Add: ${config.tag_name || 'tag'}`;
      case 'remove_tag':
        return `Remove: ${config.tag_name || 'tag'}`;
      case 'wait':
        return `Wait ${config.delay_days || 0}d ${config.delay_hours || 0}h ${config.delay_minutes || 0}m`;
      case 'create_task':
        return config.title || 'Create task';
      case 'update_contact':
        return config.status ? `Set status: ${config.status}` : 'Update contact';
      case 'webhook':
        return config.url || 'Configure webhook';
      default:
        return '';
    }
  };

  const workflowSettings = (
    <div className="space-y-4">
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">Name</Label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Automation name"
          className="h-11 bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:h-8"
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">Description</Label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional description"
          rows={3}
          className="resize-none bg-background text-sm shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        />
      </div>
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">Trigger</Label>
        <Select value={triggerType} onValueChange={handleTriggerTypeChange}>
          <SelectTrigger className="h-11 bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_TYPES.map(trigger => (
              <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {triggerType === 'scheduled' && (
        <>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Contact ID</Label>
            <Input
              type="number"
              min={1}
              value={String(triggerConfig.contact_id || '')}
              onChange={(event) => setTriggerConfig(current => ({
                ...current,
                contact_id: event.target.value ? Number(event.target.value) : undefined,
              }))}
              className="h-11 bg-background shadow-none lg:h-8"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Run at</Label>
            <Input
              type="datetime-local"
              value={triggerConfig.scheduled_at
                ? new Date(String(triggerConfig.scheduled_at)).toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16)
                : ''}
              onChange={(event) => setTriggerConfig(current => ({
                ...current,
                scheduled_at: event.target.value ? new Date(event.target.value).toISOString() : undefined,
              }))}
              className="h-11 bg-background shadow-none lg:h-8"
            />
          </div>
        </>
      )}
    </div>
  );

  const stepPalette = (
    <ul className="flex w-full min-w-0 flex-col gap-1">
      {STEP_TYPES.map(step => (
        <li key={step.value}>
          <button
            type="button"
            className="group/menu-button interaction-navigation flex h-11 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm font-raleway text-sidebar-foreground outline-none ring-sidebar-ring focus-visible:ring-2 active:bg-sidebar-accent lg:h-9"
            onClick={() => handleAddStep(step.value)}
          >
            <step.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/menu-button:text-blue-600 dark:group-hover/menu-button:text-blue-400" />
            <span className="truncate">{step.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const statusVisual = getWorkflowStatusVisual(isActive);
  const orderedStepNodes = nodes.filter(node => node.type === 'step').sort((a, b) => a.position.y - b.position.y);
  const selectedStepOrder = selectedNode
    ? orderedStepNodes.findIndex(node => node.id === selectedNode.id) + 1
    : 0;
  const laterStepOptions = orderedStepNodes.slice(selectedStepOrder);


  if (loading) {
    return (
      <PageLayout
        title={isNewWorkflow ? 'NEW AUTOMATION' : 'AUTOMATION'}
        icon={<Zap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
        leading={
          <ShellBackButton
            label="Back to automations"
            onClick={() => { if (confirmLeave()) navigate('/automations'); }}
          />
        }
        frame="flush"
      >
        <PageLoading message="Loading workflow..." className="h-full" />
      </PageLayout>
    );
  }

  if (loadError) {
    return (
      <PageLayout
        title={isNewWorkflow ? 'NEW AUTOMATION' : 'AUTOMATION'}
        icon={<Zap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
        leading={(
          <ShellBackButton label="Back to automations" onClick={() => navigate('/automations')} />
        )}
      >
        <ErrorState
          title="Automation unavailable"
          description={loadError}
          icon={Zap}
          onAction={() => setLoadVersion(version => version + 1)}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={isNewWorkflow ? 'NEW AUTOMATION' : 'AUTOMATION'}
      icon={<Zap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={
        <ShellBackButton
          label="Back to automations"
          onClick={() => { if (confirmLeave()) navigate('/automations'); }}
        />
      }
      headerTools={{
        status: !isNewWorkflow ? (
          <Badge className={cn('pointer-events-none whitespace-nowrap', statusVisual.badgeClass)}>
            {statusVisual.label}
          </Badge>
        ) : undefined,
        secondaryAction: !isNewWorkflow ? (
          <div className="flex items-center gap-2">
            <HeaderAction
              prominence="secondary"
              label="Runs"
              icon={<Users className="h-4 w-4" />}
              onClick={() => setShowEnrollments(true)}
            />
            <HeaderAction
              prominence="secondary"
              label={isActive ? 'Deactivate' : 'Activate'}
              icon={isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              onClick={handleToggleActive}
              disabled={saving}
              busy={saving}
            />
          </div>
        ) : undefined,
        primaryAction: (
          <HeaderAction
            label={saving ? 'Saving...' : 'Save automation'}
            icon={<Save className="h-4 w-4" />}
            onClick={() => void handleSave()}
            disabled={saving || !isDirty}
            busy={saving}
          />
        ),
      }}
      frame="flush"
    >
      <div className="relative flex h-[calc(100dvh-12.75rem)] min-h-0 min-w-0 flex-col overflow-hidden md:h-[calc(100dvh-3.5rem)]">
      <aside className="absolute left-0 top-0 z-20 hidden max-h-[calc(100%_-_5.75rem)] w-64 overflow-y-auto rounded-br-xl border-b border-r bg-sidebar p-3 text-sidebar-foreground shadow-sm xl:block">
        <div className="mb-6">
          <div className="flex h-8 items-center px-2">
            <span className="font-raleway text-sm font-semibold text-foreground">Automation settings</span>
          </div>
          <div className="mt-2 px-2">{workflowSettings}</div>
        </div>
        <div className="flex h-8 items-center px-2">
          <span className="font-raleway text-sm font-semibold text-foreground">Add steps</span>
        </div>
        <div className="mt-1">{stepPalette}</div>
      </aside>

      <div className="flex shrink-0 items-center gap-2 border-b bg-background p-3 xl:hidden">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setShowWorkflowSettings(true)}>
          <Settings className="mr-2 h-4 w-4" /> Settings
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setShowStepPalette(true)}>
          <ListPlus className="mr-2 h-4 w-4" /> Add step
        </Button>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          connectOnClick={false}
          className="bg-muted/10"
        >
          <Panel position="bottom-left" className="m-4">
            <WorkflowCanvasControls />
          </Panel>
          <Background />
        </ReactFlow>
      </div>

      <Sheet open={showWorkflowSettings} onOpenChange={setShowWorkflowSettings}>
        <SheetContent side="left" className="w-[min(22rem,calc(100vw-1rem))] overflow-y-auto">
          <SheetHeader><SheetTitle>Automation settings</SheetTitle></SheetHeader>
          <div className="mt-6">{workflowSettings}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={showStepPalette} onOpenChange={setShowStepPalette}>
        <SheetContent side="left" className="w-[min(22rem,calc(100vw-1rem))] overflow-y-auto">
          <SheetHeader><SheetTitle>Add a step</SheetTitle></SheetHeader>
          <div className="mt-6">{stepPalette}</div>
        </SheetContent>
      </Sheet>

      {/* Right sidebar - Step configuration */}
      <Sheet open={showStepConfig} onOpenChange={setShowStepConfig}>
        <SheetContent className="overflow-y-auto">
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
                  aria-label={`Delete ${getStepLabel(selectedNode.data.step_type)} step`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Step-specific configuration */}
              {selectedNode.data.step_type === 'send_email' && (
                <div className="space-y-2">
                  <Label>Email template</Label>
                  <div className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{selectedEmailTemplate?.name || selectedNode.data.step_config?.template_name || 'No template selected'}</p>
                      <p className="truncate text-xs text-muted-foreground">{selectedEmailTemplate?.subject || (selectedNode.data.step_config?.template_id ? 'Published automation email' : 'Choose a published automation email.')}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setShowTemplateBrowser(true)}>
                      {selectedNode.data.step_config?.template_id ? 'Change' : 'Browse'}
                    </Button>
                  </div>
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
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {selectedNode.data.step_type === 'condition' && (
                <div className="space-y-3">
                  <div>
                    <Label>Contact field</Label>
                    <Input
                      value={selectedNode.data.condition_config?.field || ''}
                      onChange={(event) => handleUpdateNodeData({
                        condition_config: {
                          ...selectedNode.data.condition_config,
                          field: event.target.value,
                        },
                      })}
                      placeholder="status, tags, or custom field key"
                    />
                  </div>
                  <div>
                    <Label>Operator</Label>
                    <Select
                      value={selectedNode.data.condition_config?.operator || ''}
                      onValueChange={(operator) => handleUpdateNodeData({
                        condition_config: { ...selectedNode.data.condition_config, operator },
                      })}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose an operator" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="not_equals">Does not equal</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="not_contains">Does not contain</SelectItem>
                        <SelectItem value="is_empty">Is empty</SelectItem>
                        <SelectItem value="is_not_empty">Is not empty</SelectItem>
                        <SelectItem value="greater_than">Greater than</SelectItem>
                        <SelectItem value="less_than">Less than</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!['is_empty', 'is_not_empty'].includes(selectedNode.data.condition_config?.operator) && (
                    <div>
                      <Label>Value</Label>
                      <Input
                        value={String(selectedNode.data.condition_config?.value ?? '')}
                        onChange={(event) => handleUpdateNodeData({
                          condition_config: {
                            ...selectedNode.data.condition_config,
                            value: event.target.value,
                          },
                        })}
                        placeholder="Expected value"
                      />
                    </div>
                  )}
                  {laterStepOptions.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(['true_branch_step', 'false_branch_step'] as const).map((branchKey) => (
                        <div key={branchKey}>
                          <Label>{branchKey === 'true_branch_step' ? 'If true' : 'If false'}</Label>
                          <Select
                            value={selectedNode.data[branchKey]?.toString() || 'next'}
                            onValueChange={(value) => handleUpdateNodeData({
                              [branchKey]: value === 'next' ? null : Number(value),
                            })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="next">Next step</SelectItem>
                              {laterStepOptions.map((node, optionIndex) => {
                                const order = selectedStepOrder + optionIndex + 1;
                                return (
                                  <SelectItem key={`${branchKey}-${node.id}`} value={String(order)}>
                                    Step {order} · {getStepLabel(node.data.step_type)}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedNode.data.step_type === 'update_contact' && (
                <div className="space-y-3">
                  <div>
                    <Label>Contact status</Label>
                    <Select
                      value={selectedNode.data.step_config?.status || 'unchanged'}
                      onValueChange={(status) => handleUpdateNodeConfig({
                        ...selectedNode.data.step_config,
                        ...(status === 'unchanged' ? { status: undefined } : { status }),
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unchanged">Leave unchanged</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedNode.data.step_config?.custom_fields && (
                    <p className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300">
                      Existing custom-field updates are preserved when this automation is saved.
                    </p>
                  )}
                </div>
              )}

              {!['send_email', 'add_tag', 'remove_tag', 'wait', 'create_task', 'webhook', 'condition', 'update_contact'].includes(selectedNode.data.step_type) && (
                <div className="flex gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>This step is preserved exactly when saved, but its settings are not editable here yet.</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      {organizationId && <OrganizationEmailTemplateBrowserDialog
        organizationId={organizationId}
        open={showTemplateBrowser}
        onOpenChange={setShowTemplateBrowser}
        title="Choose an automation template"
        description="Active templates available to this organization."
        activeOnly
        getMeta={template => `${template.variables.length} variable${template.variables.length === 1 ? '' : 's'}`}
        selectedId={selectedNode?.data.step_config?.template_id || null}
        onSelect={template => {
          if (!selectedNode) return;
          setEmailTemplates(current => current.some(item => item.id === template.id)
            ? current.map(item => item.id === template.id ? template : item)
            : [...current, template]);
          handleUpdateNodeConfig({ ...selectedNode.data.step_config, template_id: template.id, template_name: template.name });
        }}
        renderPreview={template => <EmailPreviewPane organizationId={organizationId} content={{ subject: template.subject, preheader: template.preheader || '', bodyHtml: template.body_html, bodyText: template.body_text || '' }} className="h-full" />}
        emptyTitle="No active automation templates"
        emptyDescription="Create and publish an email template before selecting it here."
      />}
      {!isNewWorkflow && organizationId && id && (
        <WorkflowEnrollmentsDialog
          open={showEnrollments}
          onOpenChange={setShowEnrollments}
          organizationId={organizationId}
          workflowId={Number(id)}
        />
      )}
    </div>
    </PageLayout>
  );
}

export default WorkflowBuilderPage;
