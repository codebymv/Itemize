export interface ClientInvoice {
  id: string
  number: string
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
  total: number
  date: string
  dueDate?: string
  url: string
}

export interface ClientSignature {
  id: string
  title: string
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'expired'
  sentDate?: string
  signedDate?: string
  url: string
}

export interface ClientPayment {
  id: string
  invoiceId: string
  invoiceNumber: string
  amount: number
  date: string
  method: string
}

export interface ClientCommunication {
  id: string
  type: 'email' | 'sms' | 'note' | 'call'
  direction: 'inbound' | 'outbound'
  subject?: string
  content: string
  date: string
}

export interface ClientTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  dueDate?: string
}

export interface ClientBooking {
  id: string
  title: string
  date: string
  duration: number
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed'
}

export interface ClientNote {
  id: string
  title: string
  content: string
  category?: string
  createdAt: string
}

export interface ClientList {
  id: string
  title: string
  category?: string
}

export interface ClientProfile {
  contact: {
    id: string
    firstName: string
    lastName: string
    email?: string
    phone?: string
    company?: string
    title?: string
    city?: string
    state?: string
    country?: string
    status: 'active' | 'inactive' | 'lead' | 'customer'
    notes?: string
    tags?: string[]
  }
  invoices: ClientInvoice[]
  signatures: ClientSignature[]
  payments: ClientPayment[]
  communications: ClientCommunication[]
  tasks: ClientTask[]
  bookings: ClientBooking[]
  notes: ClientNote[]
  lists: ClientList[]
  timeline: Array<{
    id: string
    type: string
    title: string
    description?: string
    timestamp: Date
    target?: {
      id: string
      name: string
      url: string
    }
  }>
}