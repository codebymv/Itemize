import { workflowCreationFingerprint } from './workflow-creation.idempotency';

describe('workflowCreationFingerprint', () => {
  it('canonicalizes nested trigger and step configuration', () => {
    expect(
      workflowCreationFingerprint('create', {
        triggerConfig: { event: 'created', filters: { status: 'active', source: 'form' } },
        steps: [{ stepConfig: { templateId: 9, track: true } }],
      }),
    ).toBe(
      workflowCreationFingerprint('create', {
        steps: [{ stepConfig: { track: true, templateId: 9 } }],
        triggerConfig: { filters: { source: 'form', status: 'active' }, event: 'created' },
      }),
    );
  });

  it('separates actions and duplicate sources', () => {
    expect(
      workflowCreationFingerprint('duplicate', { sourceWorkflowId: 9 }),
    ).not.toBe(
      workflowCreationFingerprint('duplicate', { sourceWorkflowId: 10 }),
    );
    expect(
      workflowCreationFingerprint('duplicate', { sourceWorkflowId: 9 }),
    ).not.toBe(
      workflowCreationFingerprint('create', { sourceWorkflowId: 9 }),
    );
  });
});
