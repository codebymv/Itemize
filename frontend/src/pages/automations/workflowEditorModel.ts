import type { Node } from 'reactflow';
import type { WorkflowStep } from '@/services/automationsApi';

export function serializeWorkflowNodes(nodes: Node[]): Omit<WorkflowStep, 'id' | 'workflow_id'>[] {
  return nodes
    .filter(node => node.type === 'step')
    .sort((a, b) => a.position.y - b.position.y)
    .map((node, index) => ({
      step_order: index + 1,
      step_type: node.data.step_type,
      step_config: node.data.step_config || {},
      ...(node.data.condition_config == null ? {} : { condition_config: node.data.condition_config }),
      ...(node.data.true_branch_step == null ? {} : { true_branch_step: Number(node.data.true_branch_step) }),
      ...(node.data.false_branch_step == null ? {} : { false_branch_step: Number(node.data.false_branch_step) }),
    }));
}
