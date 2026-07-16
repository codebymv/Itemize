const {
  CANARY_CONFIRMATION,
  DRAIN_CONFIRMATION,
  assertCanaryConfirmation,
  assertDrainConfirmation,
  assertRolloutDatabaseIdentity,
  assertStagingEnvironment,
  canaryConfiguration,
  validateCanaryConfiguration,
  workflowRolloutDatabaseIdentity,
} = require('../../services/workflowRolloutOperations');

describe('workflow rollout operational safety', () => {
  test('requires an explicit staging marker and rejects production deployment labels', () => {
    expect(() => assertStagingEnvironment({})).toThrow(/exactly staging/);
    expect(() => assertStagingEnvironment({
      WORKFLOW_ROLLOUT_ENVIRONMENT: 'staging',
    })).not.toThrow();
    expect(() => assertStagingEnvironment({
      APP_ENV: 'production',
      WORKFLOW_ROLLOUT_ENVIRONMENT: 'staging',
    })).toThrow(/production deployment/);
  });

  test('requires separate canary and drain confirmations', () => {
    expect(() => assertCanaryConfirmation({
      WORKFLOW_CANARY_CONFIRM: CANARY_CONFIRMATION,
    })).not.toThrow();
    expect(() => assertCanaryConfirmation({})).toThrow(CANARY_CONFIRMATION);
    expect(() => assertDrainConfirmation({
      WORKFLOW_DRAIN_CONFIRM: DRAIN_CONFIRMATION,
    })).not.toThrow();
    expect(() => assertDrainConfirmation({})).toThrow(DRAIN_CONFIRMATION);
  });

  test('pins rollout commands to the exact database host, port, and name', () => {
    const environment = {
      DATABASE_URL: 'postgresql://user:secret@staging-db.example:6543/itemize_staging',
    };
    const identity = workflowRolloutDatabaseIdentity(environment);
    expect(identity).toMatchObject({
      database: 'itemize_staging',
      host: 'staging-db.example',
      port: '6543',
    });
    expect(identity.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(assertRolloutDatabaseIdentity({
      ...environment,
      WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT: identity.fingerprint,
    })).toEqual(identity);
    expect(() => assertRolloutDatabaseIdentity({
      ...environment,
      WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT: '0'.repeat(64),
    })).toThrow(/does not match/);
  });

  test('validates tenant, operator, recipient, and sandbox provider assertions', () => {
    const environment = {
      EMAIL_FROM: 'canary@example.test',
      RESEND_API_KEY: 're_sandbox',
      WORKFLOW_CANARY_CREATED_BY_USER_ID: '12',
      WORKFLOW_CANARY_EMAIL: 'operator@example.test',
      WORKFLOW_CANARY_ORGANIZATION_ID: '34',
      WORKFLOW_CANARY_PROVIDER_MODE: 'sandbox',
    };
    expect(canaryConfiguration(environment)).toEqual({
      createdByUserId: 12,
      organizationId: 34,
      recipient: 'operator@example.test',
    });
    expect(validateCanaryConfiguration(environment)).toEqual({
      createdByUserId: 12,
      organizationId: 34,
      recipient: 'operator@example.test',
    });
    expect(() => validateCanaryConfiguration({
      ...environment,
      WORKFLOW_CANARY_PROVIDER_MODE: 'production',
    })).toThrow(/must be sandbox/);
  });
});
