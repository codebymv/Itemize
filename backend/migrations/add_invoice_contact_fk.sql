-- Migration 001: Add contact_id FK to invoices
-- Enables cross-linking between invoices and contacts for unified client profiles

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN contact_id INTEGER;
    
    ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_contact_id
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
    
    UPDATE invoices i
    SET contact_id = (
      SELECT co.id FROM contacts co
      WHERE co.email = i.recipient_email
      LIMIT 1
    )
    WHERE contact_id IS NULL AND i.recipient_email IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_invoices_contact_id ON invoices(contact_id);
    
    RAISE NOTICE 'Invoice contact_id FK and index added';
  END IF;
END $$;