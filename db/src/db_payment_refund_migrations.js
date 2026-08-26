async function runPaymentRefundMigration(pool) {
  await pool.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS stripe_refund_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS refund_reason TEXT;

    ALTER TABLE payments
      ALTER COLUMN stripe_refund_id TYPE VARCHAR(255);

    CREATE TABLE IF NOT EXISTS payment_refunds (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(128) NOT NULL,
      stripe_refund_id VARCHAR(255),
      amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'processing'
        CHECK (status IN (
          'processing', 'pending', 'requires_action', 'succeeded', 'failed', 'canceled'
        )),
      reason TEXT,
      provider_failure_code VARCHAR(100),
      provider_failure_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP WITH TIME ZONE,
      UNIQUE (organization_id, payment_id, idempotency_key)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_refunds_stripe_refund
      ON payment_refunds(stripe_refund_id)
      WHERE stripe_refund_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
      ON payment_refunds(organization_id, payment_id, created_at DESC);
  `);
  return true;
}

module.exports = { runPaymentRefundMigration };
