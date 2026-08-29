import { describe, expect, it } from 'vitest';
import type { Node } from 'reactflow';
import { serializeWorkflowNodes } from './workflowEditorModel';

const node = (id: string, y: number, data: Node['data']): Node => ({
  id,
  type: 'step',
  position: { x: 0, y },
  data,
});

describe('serializeWorkflowNodes', () => {
  it('preserves condition configuration and both branch targets', () => {
    const steps = serializeWorkflowNodes([
      node('email', 300, { step_type: 'send_email', step_config: { template_id: 12 } }),
      node('condition', 100, {
        step_type: 'condition',
        step_config: {},
        condition_config: { field: 'status', operator: 'equals', value: 'active' },
        true_branch_step: 2,
        false_branch_step: 3,
      }),
      node('wait', 200, { step_type: 'wait', step_config: { delay_days: 1 } }),
    ]);

    expect(steps).toEqual([
      {
        step_order: 1,
        step_type: 'condition',
        step_config: {},
        condition_config: { field: 'status', operator: 'equals', value: 'active' },
        true_branch_step: 2,
        false_branch_step: 3,
      },
      { step_order: 2, step_type: 'wait', step_config: { delay_days: 1 } },
      { step_order: 3, step_type: 'send_email', step_config: { template_id: 12 } },
    ]);
  });

  it('does not invent branch fields for linear steps', () => {
    expect(serializeWorkflowNodes([
      node('tag', 100, { step_type: 'add_tag', step_config: { tag_name: 'VIP' } }),
    ])[0]).toEqual({
      step_order: 1,
      step_type: 'add_tag',
      step_config: { tag_name: 'VIP' },
    });
  });
});
