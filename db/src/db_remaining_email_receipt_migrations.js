async function runRemainingEmailReceiptMigration(pool) {
  await pool.query(`
    ALTER TABLE delivery_provider_receipts DROP CONSTRAINT IF EXISTS delivery_provider_receipts_source_check;
    ALTER TABLE delivery_provider_receipts ADD CONSTRAINT delivery_provider_receipts_source_check
      CHECK (source IN ('invoice','signature','workflow','estimate','review_request','trial_reminder'));
    WITH candidates AS (
      SELECT organization_id,'workflow'::text AS source,id AS delivery_id,idempotency_key,provider_id,created_at
        FROM workflow_side_effect_outbox WHERE effect_type='email' AND (attempt_count>0 OR provider_id IS NOT NULL)
      UNION ALL SELECT organization_id,'estimate',id,'estimate-email:' || organization_id || ':' || id,provider_id,created_at
        FROM estimate_email_deliveries WHERE attempt_count>0 OR provider_id IS NOT NULL
      UNION ALL SELECT organization_id,'review_request',id,'review-request-email:' || organization_id || ':' || id,provider_id,created_at
        FROM review_request_deliveries WHERE channel='email' AND (attempt_count>0 OR provider_id IS NOT NULL)
      UNION ALL SELECT organization_id,'trial_reminder',id,
        'trial-reminder:' || organization_id || ':' || to_char(trial_ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),provider_id,created_at
        FROM trial_reminder_deliveries WHERE attempt_count>0 OR provider_id IS NOT NULL
    ), ranked AS (
      SELECT candidates.*,COUNT(*) OVER (PARTITION BY provider_id) AS provider_matches FROM candidates
    )
    INSERT INTO delivery_provider_receipts
      (organization_id,source,delivery_id,idempotency_key,provider_id,first_attempt_at,review_required)
      SELECT organization_id,source,delivery_id,idempotency_key,
        CASE WHEN provider_matches=1 AND NOT EXISTS (SELECT 1 FROM delivery_provider_receipts existing WHERE existing.provider_id=ranked.provider_id)
          THEN provider_id ELSE NULL END,created_at,
        provider_id IS NULL OR provider_matches>1 OR EXISTS (SELECT 1 FROM delivery_provider_receipts existing WHERE existing.provider_id=ranked.provider_id)
      FROM ranked ON CONFLICT DO NOTHING;
    UPDATE email_webhook_events event SET reconciliation_status='retry',reconciliation_next_attempt_at=CURRENT_TIMESTAMP
      WHERE processing_status='pending' AND reconciliation_status IN ('pending','retry','dead_letter')
      AND EXISTS (SELECT 1 FROM delivery_provider_receipts receipt WHERE receipt.provider_id=event.external_id);
  `);
  return true;
}
module.exports = { runRemainingEmailReceiptMigration };
