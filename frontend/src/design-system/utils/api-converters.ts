import type { Invoice, Signature, Contact, Deal } from '@/types'
import type { ClientProfile } from '../types/client.types'

/**
 * Transforms API response to design system ClientProfile format
 */
export function transformApiToClientProfile(apiData: {
  contact: Contact
  invoices?: Invoice[]
  signatures?: Signature[]
  payments?: any[]
  communications?: any[]
  tasks?: any[]
  bookings?: any[]
  notes?: any[]
  lists?: any[]
  activities?: any[]
}): ClientProfile {
  const { contact, invoices = [], signatures = [], payments = [], communications = [], tasks = [], bookings = [], notes = [], lists = [], activities = [] } = apiData

  return {
    contact: {
      id: contact.id.toString(),
      firstName: contact.first_name || '',
      lastName: contact.last_name || '',
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      title: contact.title,
      city: contact.city,
      state: contact.state,
      country: contact.country,
      status: contact.status || 'active',
      notes: contact.notes,
      tags: contact.tags || [],
    },
    invoices: invoices.map((inv) => ({
      id: inv.id.toString(),
      number: inv.invoice_number || `INV-${inv.id}`,
      status: inv.status || 'draft',
      total: inv.total || 0,
      date: inv.date,
      dueDate: inv.due_date,
      url: `/invoices/${inv.id}`,
    })),
    signatures: signatures.map((sig) => ({
      id: sig.id.toString(),
      title: sig.title || 'Document',
      status: sig.status || 'draft',
      sentDate: sig.sent_at,
      signedDate: sig.signed_at,
      url: `/documents/${sig.id}`,
    })),
    payments: payments.map((pay) => ({
      id: pay.id.toString(),
      invoiceId: pay.invoice_id?.toString() || '',
      invoiceNumber: pay.invoice_number || '',
      amount: pay.amount || 0,
      date: pay.date,
      method: pay.method || 'card',
    })),
    communications: communications.map((comm) => ({
      id: comm.id.toString(),
      type: comm.type,
      direction: comm.direction || 'outbound',
      subject: comm.subject,
      content: comm.content || '',
      date: comm.date,
    })),
    tasks: tasks.map((task) => ({
      id: task.id.toString(),
      title: task.title,
      status: task.status,
      dueDate: task.due_date,
    })),
    bookings: bookings.map((booking) => ({
      id: booking.id.toString(),
      title: booking.title,
      date: booking.date,
      duration: booking.duration || 60,
      status: booking.status || 'confirmed',
    })),
    notes: notes.map((note) => ({
      id: note.id.toString(),
      title: note.title || 'Note',
      content: note.content || '',
      category: note.category,
      createdAt: note.created_at,
    })),
    lists: lists.map((list) => ({
      id: list.id.toString(),
      title: list.title || 'List',
      category: list.category,
    })),

    timeline: (activities || []).map((activity) => ({
      id: activity.id.toString(),
      type: activity.type,
      title: activity.title,
      description: activity.description,
      timestamp: new Date(activity.created_at),
      target: activity.target_id ? {
        id: activity.target_id.toString(),
        name: activity.target_name || activity.title,
        url: activity.target_url,
      } : undefined,
    })),
  }
}

/**
 * Transforms API activity to design system Activity format
 */
export function transformApiActivity(apiActivity: any) {
  return {
    id: apiActivity.id?.toString() || Math.random().toString(36),
    type: apiActivity.type || 'created',
    itemType: inferItemType(apiActivity),
    title: apiActivity.title || 'Activity',
    description: apiActivity.content,
    timestamp: new Date(apiActivity.created_at || Date.now()),
    actor: {
      id: apiActivity.actor_id || 'system',
      name: apiActivity.actor_name || 'System',
    },
    target: apiActivity.target_id ? {
      id: apiActivity.target_id.toString(),
      name: apiActivity.target_name || apiActivity.title,
      url: apiActivity.target_url,
    } : undefined,
    metadata: {
      originalApiActivity: apiActivity,
    },
  }
}

/**
 * Transforms API search result to design system SearchResult format
 */
export function transformApiSearchResult(apiResult: any) {
  return {
    id: apiResult.id?.toString() || Math.random().toString(36),
    type: apiResult.type,
    title: apiResult.title || apiResult.name,
    description: apiResult.description || apiResult.subtitle,
    url: apiResult.url || `/${apiResult.type}/${apiResult.id}`,
  }
}

function inferItemType(activity: any): string {
  const title = activity.title?.toLowerCase() || ''
  const type = activity.type?.toLowerCase() || ''

  if (title.includes('invoice') || type.includes('payment')) return 'invoice'
  if (title.includes('contract') || type.includes('signature')) return 'signature'
  if (title.includes('campaign') || type.includes('email')) return 'campaign'
  if (title.includes('deal') || type.includes('deal')) return 'contact'
  
  return 'contact'
}