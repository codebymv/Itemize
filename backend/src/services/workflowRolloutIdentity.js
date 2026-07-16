const { createHash, timingSafeEqual } = require('node:crypto');

function workflowRolloutDatabaseIdentity(environment = process.env) {
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  let url;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL is invalid');
  }
  const port = url.port || (url.protocol === 'postgresql:' || url.protocol === 'postgres:'
    ? '5432'
    : 'unknown');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const canonical = `${url.hostname.toLowerCase()}:${port}/${database}`;
  return {
    database,
    fingerprint: createHash('sha256').update(canonical).digest('hex'),
    host: url.hostname.toLowerCase(),
    port,
  };
}

function assertRolloutDatabaseIdentity(environment = process.env) {
  const identity = workflowRolloutDatabaseIdentity(environment);
  const expected = String(environment.WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT || '')
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT must be the 64-character identity fingerprint');
  }
  const actualBuffer = Buffer.from(identity.fingerprint, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('DATABASE_URL does not match WORKFLOW_ROLLOUT_DATABASE_FINGERPRINT');
  }
  return identity;
}

module.exports = {
  assertRolloutDatabaseIdentity,
  workflowRolloutDatabaseIdentity,
};
