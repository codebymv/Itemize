-- Migration 003: Create workflow_triggers table
-- Stores event triggers for workflow automation processing

CREATE TABLE IF NOT EXISTS workflow_triggers (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow 
  ON workflow_triggers(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_entity 
  ON workflow_triggers(entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_triggers_unique 
  ON workflow_triggers(trigger_type, entity_id, workflow_id) 
  WHERE status = 'pending';

COMMENT ON TABLE workflow_triggers IS 
  'Stores event triggers for workflow automation processing';

COMMENT ON COLUMN workflow_triggers.status IS 
  'pending|processing|completed|failed';

COMMENT ON COLUMN workflow_triggers.trigger_type IS 
  'contract_signed|invoice_paid|form_submitted|contact_created';