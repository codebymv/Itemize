import {
  booleanEnvironmentValue,
  integerEnvironmentValue,
  validateRuntimeEnvironment,
} from './runtime-config';

describe('runtime configuration', () => {
  it('fails at boot when production shared storage is incomplete', () => {
    const environment = {
      NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/itemize',
      JWT_SECRET: 'x'.repeat(32), FRONTEND_URL: 'https://itemize.cloud',
      AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test',
      AWS_S3_BUCKET: 'test', AWS_REGION: 'us-west-2',
    };
    expect(() => validateRuntimeEnvironment(environment)).not.toThrow();
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET', 'AWS_REGION']) {
      expect(() => validateRuntimeEnvironment({ ...environment, [key]: '' })).toThrow(key);
    }
  });
  it('parses explicit booleans and bounded integers', () => {
    expect(
      booleanEnvironmentValue(
        { TRIAL_REMINDER_NEST_JOBS_ENABLED: 'true' },
        'TRIAL_REMINDER_NEST_JOBS_ENABLED',
      ),
    ).toBe(true);
    expect(integerEnvironmentValue({ PORT: '3100' }, 'PORT', 80, 1, 65_535)).toBe(3100);
  });

  it('rejects malformed values instead of silently disabling work', () => {
    expect(() =>
      booleanEnvironmentValue(
        { INVOICE_NEST_JOBS_ENABLED: 'yes' },
        'INVOICE_NEST_JOBS_ENABLED',
      ),
    ).toThrow('INVOICE_NEST_JOBS_ENABLED');
    expect(() =>
      integerEnvironmentValue({ PORT: '0' }, 'PORT', 3100, 1, 65_535),
    ).toThrow('PORT');
  });

  it('rejects two owners for the same worker in one runtime', () => {
    expect(() =>
      validateRuntimeEnvironment({
        INVOICE_NEST_JOBS_ENABLED: 'true',
        LEGACY_INVOICE_JOBS_ENABLED: 'true',
      }),
    ).toThrow('cannot both be true');
  });

  it('requires the Nest realtime host for Nest social webhook jobs', () => {
    expect(() =>
      validateRuntimeEnvironment({ SOCIAL_WEBHOOK_NEST_JOBS_ENABLED: 'true' }),
    ).toThrow('REALTIME_HOST_NESTJS_ENABLED=true');
  });

  it('requires secure core configuration in production', () => {
    expect(() => validateRuntimeEnvironment({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL',
    );
    expect(() =>
      validateRuntimeEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://example/itemize',
        JWT_SECRET: 'x'.repeat(32),
        FRONTEND_URL: 'http://itemize.cloud',
        DATABASE_SSL: 'true',
      }),
    ).toThrow('HTTPS');
  });
});
