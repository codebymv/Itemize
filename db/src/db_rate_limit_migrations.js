/**
 * Shared fixed-window rate-limit buckets. Every API replica counts hits for
 * the ingress ceiling, the authentication throttle and the AI throttle in
 * this table, so a client cannot multiply its allowance by spreading requests
 * across replicas. Rows are keyed by limiter namespace + client identity and
 * are swept once their window has lapsed for an hour.
 */
async function runRateLimitBucketsMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx ON rate_limit_buckets(reset_at);
  `);
  return true;
}

module.exports = { runRateLimitBucketsMigration };
