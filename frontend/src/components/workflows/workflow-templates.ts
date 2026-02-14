export interface WorkflowAction {
  id: string
  type: 'send_invoice' | 'update_deal' | 'send_email' | 'create_task' | 'send_review_request' | 'add_segment' | 'update_contact_status'
  config: {
    [key: string]: any
  }
}

export interface WorkflowTrigger {
  id: string
  type: 'contract_signed' | 'invoice_paid' | 'deal_status_changed' | 'form_submitted' | 'contact_created'
  config?: {
    [key: string]: any
  }
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'onboarding' | 'sales' | 'billing' | 'engagement'
  icon: string
  color: string
  triggers: WorkflowTrigger[]
  actions: WorkflowAction[]
  enabled?: boolean
  isActive?: boolean
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'onboarding-client',
    name: 'Client Onboarding',
    description: 'Form submission creates contact, adds to segment, sends welcome email, and creates follow-up task',
    category: 'onboarding',
    icon: 'Users',
    color: 'bg-green-100 text-green-600',
    triggers: [
      {
        id: 'form-submitted',
        type: 'form_submitted',
        config: { formId: 'contact-form' }
      }
    ],
    actions: [
      {
        id: 'create-contact',
        type: 'create_task',
        config: { title: 'Send welcome email to {contact.email}' }
      },
      {
        id: 'welcome-email',
        type: 'send_email',
        config: { templateId: 'welcome-email', to: '{contact.email}' }
      }
    ]
  },
  {
    id: 'deal-lifecycle',
    name: 'Deal Lifecycle',
    description: 'Contract signed creates invoice; Invoice paid marks deal won and sends review request',
    category: 'sales',
    icon: 'TrendingUp',
    color: 'bg-blue-100 text-blue-600',
    triggers: [
      {
        id: 'contract-signed',
        type: 'contract_signed'
      },
      {
        id: 'invoice-paid',
        type: 'invoice_paid'
      }
    ],
    actions: [
      {
        id: 'create-invoice',
        type: 'send_invoice',
        config: { amount: '{contract.amount}', contactId: '{contract.contact_id}' }
      },
      {
        id: 'update-deal',
        type: 'update_deal',
        config: { status: 'won', stage: 'Won' }
      },
      {
        id: 'send-review',
        type: 'send_review_request',
        config: { delayDays: 7, contactId: '{contact.id}' }
      },
      {
        id: 'update-contact',
        type: 'update_contact_status',
        config: { status: 'customer' }
      }
    ]
  },
  {
    id: 'review-request',
    name: 'Review Request',
    description: 'After payment, send automatic review request 7 days later',
    category: 'engagement',
    icon: 'Star',
    color: 'bg-yellow-100 text-yellow-600',
    triggers: [
      {
        id: 'invoice-paid',
        type: 'invoice_paid'
      }
    ],
    actions: [
      {
        id: 'schedule-review',
        type: 'send_review_request',
        config: { delayDays: 7, templateId: 'review-request' }
      }
    ]
  }
]