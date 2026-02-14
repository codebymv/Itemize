-- Migration 004: Add performance indexes
-- Improves query performance on frequently queried columns

CREATE INDEX IF NOT EXISTS idx_invoices_status 
  ON invoices(status);

CREATE INDEX IF NOT EXISTS idx_invoices_organization_status 
  ON invoices(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_created_at 
  ON invoices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signature_documents_status 
  ON signature_documents(status);

CREATE INDEX IF NOT EXISTS idx_signature_documents_status_created 
  ON signature_documents(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_organization 
  ON contacts(organization_id);

CREATE INDEX IF NOT EXISTS idx_contacts_name_email 
  ON contacts(first_name, last_name, email);

CREATE INDEX IF NOT EXISTS idx_signature_recipients_contact 
  ON signature_recipients(contact_id);

CREATE INDEX IF NOT EXISTS idx_signature_recipients_document 
  ON signature_recipients(document_id);

CREATE INDEX IF NOT EXISTS idx_workflows_organization_active 
  ON workflows(organization_id, is_active);