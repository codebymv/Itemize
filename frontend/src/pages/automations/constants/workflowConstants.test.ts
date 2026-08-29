import { describe, expect, it } from 'vitest';
import { getWorkflowEnrollmentStatusVisual, getWorkflowStatusVisual } from './workflowConstants';

describe('automation status visuals', () => {
  it('uses blue for active definitions and orange for inactive definitions', () => {
    expect(getWorkflowStatusVisual(true)).toMatchObject({ label: 'Active', theme: 'blue' });
    expect(getWorkflowStatusVisual(false)).toMatchObject({ label: 'Inactive', theme: 'orange' });
  });

  it('reserves green for completion and red for runs needing attention', () => {
    expect(getWorkflowEnrollmentStatusVisual('active')).toMatchObject({ label: 'Running', theme: 'orange' });
    expect(getWorkflowEnrollmentStatusVisual('completed')).toMatchObject({ label: 'Completed', theme: 'green' });
    expect(getWorkflowEnrollmentStatusVisual('failed')).toMatchObject({ label: 'Failed', theme: 'red' });
  });
});
