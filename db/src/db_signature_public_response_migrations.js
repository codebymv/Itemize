async function runSignaturePublicResponseMigration(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signature_public_response_receipts (
      token_hash CHAR(64) PRIMARY KEY,
      action VARCHAR(16) NOT NULL CHECK (action IN ('signed', 'declined')),
      request_fingerprint CHAR(64) NOT NULL,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES signature_documents(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES signature_recipients(id) ON DELETE CASCADE,
      completion_queued BOOLEAN,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (
        (action = 'signed' AND completion_queued IS NOT NULL)
        OR (action = 'declined' AND completion_queued IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_signature_public_response_receipts_document
      ON signature_public_response_receipts(document_id);

    CREATE INDEX IF NOT EXISTS idx_signature_public_response_receipts_recipient
      ON signature_public_response_receipts(recipient_id);
  `);
  return true;
}

module.exports = { runSignaturePublicResponseMigration };
