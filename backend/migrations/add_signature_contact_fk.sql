-- Migration 002: Add contact_id FK to signatures
-- Enables cross-linking between signatures (contracts) and contacts

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signatures' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE signatures ADD COLUMN contact_id INTEGER;
    
    ALTER TABLE signatures
    ADD CONSTRAINT fk_signatures_contact_id
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    
    UPDATE signatures s
    SET contact_id = (
      SELECT co.id FROM contacts co
      WHERE co.email = s.recipient_email
      LIMIT 1
    )
    WHERE contact_id IS NULL AND s.recipient_email IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_signatures_contact_id ON signatures(contact_id);
    
    RAISE NOTICE 'Signature contact_id FK and index added';
  END IF;
END $$;