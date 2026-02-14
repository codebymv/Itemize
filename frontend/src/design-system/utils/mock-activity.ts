import type { Activity } from '@/design-system/types/activity.types'

export function createMockActivity(overrides?: Partial<Activity>): Activity {
  const id = Math.random().toString(36).substring(7)
  const itemTypes = ['invoice', 'contact', 'signature', 'campaign', 'workflow', 'note', 'list', 'contract', 'payment', 'booking', 'form', 'landing_page'] as const
  const types = ['created', 'updated', 'deleted', 'sent', 'received', 'signed', 'paid', 'viewed', 'commented', 'status_changed', 'completed'] as const
  
  const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)]
  const type = types[Math.floor(Math.random() * types.length)]
  
  return {
    id,
    type,
    itemType,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${itemLabels[itemType]}`,
    description: `This ${itemLabels[itemType].toLowerCase()} was ${type} just now`,
    timestamp: new Date(Date.now() - Math.random() * 86400000 * 7),
    actor: {
      id: 'user-1',
      name: 'John Smith',
    },
    target: {
      id: id,
      name: `${itemLabels[itemType]} #${Math.floor(Math.random() * 1000)}`,
      url: `/${itemType}s/${id}`,
    },
    metadata: {},
    ...overrides,
  }
}

const itemLabels = {
  invoice: 'Invoice',
  contact: 'Contact',
  signature: 'Signature',
  campaign: 'Campaign',
  workflow: 'Workflow',
  note: 'Note',
  list: 'List',
  contract: 'Contract',
  payment: 'Payment',
  booking: 'Booking',
  form: 'Form',
  landing_page: 'Page',
} as const

export function createMockActivities(count: number): Activity[] {
  const activities: Activity[] = []
  
  for (let i = 0; i < count; i++) {
    activities.push(createMockActivity({
      timestamp: new Date(Date.now() - Math.random() * 86400000 * 7),
    }))
  }
  
  return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function createMockTimelineData(count: number = 10): Activity[] {
  const now = new Date()
  
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(now.getTime() - i * 3600000)
    
    const scenarios = [
      {
        type: 'sent' as const,
        itemType: 'contact' as const,
        title: 'Sent welcome email',
        description: 'Email delivered successfully',
        target: { id: 'c1', name: 'John Doe', url: '/contacts/c1' },
      },
      {
        type: 'signed' as const,
        itemType: 'signature' as const,
        title: 'Contract signed',
        description: 'Client signed the service agreement',
        target: { id: 's1', name: 'Service Agreement', url: '/documents/s1' },
      },
      {
        type: 'paid' as const,
        itemType: 'invoice' as const,
        title: 'Payment received',
        description: '$500 payment received for Invoice #INV-001',
        target: { id: 'i1', name: 'Invoice #INV-001', url: '/invoices/i1' },
      },
      {
        type: 'created' as const,
        itemType: 'contact' as const,
        title: 'New contact created',
        description: 'Added Jane Smith to CRM',
        target: { id: 'c2', name: 'Jane Smith', url: '/contacts/c2' },
      },
      {
        type: 'updated' as const,
        itemType: 'invoice' as const,
        title: 'Draft updated',
        description: 'Invoice draft modified',
        target: { id: 'i2', name: 'Invoice #INV-002', url: '/invoices/i2' },
      },
    ]
    
    const scenario = scenarios[i % scenarios.length]
    
    return createMockActivity({
      ...scenario,
      timestamp,
    })
  })
}