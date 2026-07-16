import type {
  WorkflowStepType,
  WorkflowTriggerType,
} from '@/domain/workflowRegistry';

export interface WorkflowAction {
  id: string;
  type: WorkflowStepType;
  config: Record<string, unknown>;
}

export interface WorkflowTrigger {
  id: string;
  type: WorkflowTriggerType;
  config?: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'onboarding' | 'sales' | 'billing' | 'engagement';
  icon: string;
  color: string;
  triggers: WorkflowTrigger[];
  actions: WorkflowAction[];
  enabled?: boolean;
  isActive?: boolean;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'form-follow-up',
    name: 'Form Follow-up',
    description: 'Tag a form contact, send a configured email, and create a follow-up task.',
    category: 'onboarding',
    icon: 'Users',
    color: 'bg-green-100 text-green-600',
    triggers: [
      {
        id: 'form-submitted',
        type: 'form_submitted',
      },
    ],
    actions: [
      {
        id: 'tag-contact',
        type: 'add_tag',
        config: { tag_name: 'form-submission' },
      },
      {
        id: 'welcome-email',
        type: 'send_email',
        config: { template_id: null },
      },
      {
        id: 'follow-up-task',
        type: 'create_task',
        config: { title: 'Follow up on form submission' },
      },
    ],
  },
  {
    id: 'contract-handoff',
    name: 'Contract Handoff',
    description: 'Tag the contact and create an internal handoff task after signature.',
    category: 'sales',
    icon: 'TrendingUp',
    color: 'bg-blue-100 text-blue-600',
    triggers: [
      {
        id: 'contract-signed',
        type: 'contract_signed',
      },
    ],
    actions: [
      {
        id: 'tag-signed',
        type: 'add_tag',
        config: { tag_name: 'contract-signed' },
      },
      {
        id: 'handoff-task',
        type: 'create_task',
        config: { title: 'Complete signed-contract handoff' },
      },
    ],
  },
  {
    id: 'invoice-paid-follow-up',
    name: 'Payment Follow-up',
    description: 'Wait seven days, then send a configured follow-up email after payment.',
    category: 'billing',
    icon: 'Star',
    color: 'bg-yellow-100 text-yellow-600',
    triggers: [
      {
        id: 'invoice-paid',
        type: 'invoice_paid',
      },
    ],
    actions: [
      {
        id: 'wait-seven-days',
        type: 'wait',
        config: { delay_days: 7 },
      },
      {
        id: 'follow-up-email',
        type: 'send_email',
        config: { template_id: null },
      },
    ],
  },
  {
    id: 'booking-confirmation',
    name: 'Booking Confirmation',
    description: 'Send a configured confirmation and create an internal preparation task.',
    category: 'engagement',
    icon: 'Clock',
    color: 'bg-purple-100 text-purple-600',
    triggers: [
      {
        id: 'booking-created',
        type: 'booking_created',
      },
    ],
    actions: [
      {
        id: 'confirmation-email',
        type: 'send_email',
        config: { template_id: null },
      },
      {
        id: 'preparation-task',
        type: 'create_task',
        config: { title: 'Prepare for new booking' },
      },
    ],
  },
];
