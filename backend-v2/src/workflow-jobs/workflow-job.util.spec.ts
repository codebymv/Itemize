import {
  boundedInteger,
  optionalPositiveInteger,
  redactWorkflowJobError,
  workflowJobBackoffMs,
  workflowTriggerMatches,
} from './workflow-job.util';

describe('workflow job utilities', () => {
  it('preserves the retained trigger-condition aliases', () => {
    expect(workflowTriggerMatches({}, {})).toBe(true);
    expect(workflowTriggerMatches({ tag_name: 'vip' }, { tag: 'vip' })).toBe(true);
    expect(workflowTriggerMatches({ stage_id: 4 }, { newStage: '4' })).toBe(true);
    expect(workflowTriggerMatches({ stage_id: '4' }, { newStageId: 4 })).toBe(true);
    expect(workflowTriggerMatches({ pipeline_id: 7 }, { deal: { pipeline_id: '7' } })).toBe(true);
    expect(workflowTriggerMatches({ source: 'form' }, { source: 'form' })).toBe(true);
    expect(workflowTriggerMatches({ form_id: 9 }, { form: { id: '9' } })).toBe(true);
    expect(workflowTriggerMatches({ form_id: '9' }, { form_id: 9 })).toBe(true);
    expect(workflowTriggerMatches({ tag_name: '', source: '' }, {})).toBe(true);
  });

  it('fails closed when configured event evidence is absent or different', () => {
    expect(workflowTriggerMatches({ tag_name: 'vip' }, {})).toBe(false);
    expect(workflowTriggerMatches({ stage_id: 4 }, { newStageId: 5 })).toBe(false);
    expect(workflowTriggerMatches({ pipeline_id: 7 }, { deal: {} })).toBe(false);
    expect(workflowTriggerMatches({ source: 'form' }, { source: 'api' })).toBe(false);
    expect(workflowTriggerMatches({ form_id: 9 }, { form: null })).toBe(false);
  });

  it('bounds runner inputs and rejects malformed targeted IDs', () => {
    expect(boundedInteger('12', 5, 1, 20)).toBe(12);
    expect(boundedInteger('0', 5, 1, 20)).toBe(5);
    expect(boundedInteger('2.5', 5, 1, 20)).toBe(5);
    expect(optionalPositiveInteger('42')).toBe(42);
    expect(optionalPositiveInteger('')).toBeNull();
    expect(() => optionalPositiveInteger('-1')).toThrow('positive integer');
  });

  it('uses bounded exponential backoff and redacts sensitive failure text', () => {
    expect(workflowJobBackoffMs(1, 1_000, 10_000)).toBe(1_000);
    expect(workflowJobBackoffMs(4, 1_000, 5_000)).toBe(5_000);
    expect(redactWorkflowJobError(new Error(
      'send user@example.com +15551234567 with sk_live_supersecret',
    ))).toBe('send [redacted-email] [redacted-phone] with [redacted-secret]');
  });
});
