export const WORKFLOW_TRIGGER_TYPES = [
  'contact_added', 'contact_updated', 'tag_added', 'tag_removed',
  'deal_stage_changed', 'deal_won', 'deal_lost', 'deal_reopened',
  'form_submitted', 'booking_created', 'booking_cancelled',
  'booking_rescheduled', 'invoice_paid', 'contract_signed', 'manual', 'scheduled',
] as const;

export const WORKFLOW_STEP_TYPES = [
  'send_email', 'send_sms', 'add_tag', 'remove_tag', 'wait',
  'create_task', 'move_deal', 'webhook', 'condition', 'update_contact',
] as const;

const TRIGGER_ALIASES: Record<string, string> = {
  contact_created: 'contact_added',
  deal_status_changed: 'deal_stage_changed',
};

export const normalizeWorkflowTrigger = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return WORKFLOW_TRIGGER_TYPES.includes(normalized as never)
    ? normalized
    : TRIGGER_ALIASES[normalized] ?? null;
};

export const isWorkflowStep = (value: unknown): value is typeof WORKFLOW_STEP_TYPES[number] =>
  typeof value === 'string' && WORKFLOW_STEP_TYPES.includes(value as never);
