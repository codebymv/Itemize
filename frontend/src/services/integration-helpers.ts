import { InvoicesWidget, SignaturesWidget, WorkspaceWidget, ContactsWidget } from '@/design-system/widgets'
import type { ClientProfile } from '@/design-system/types/client.types'
import { WorkflowTemplateCard } from '@/components/workflows/WorkflowTemplateCard'
import { WORKFLOW_TEMPLATES } from '@/components/workflows/workflow-templates'
import { transformApiToClientProfile } from '@/design-system/utils/api-converters'

export const SMART_ACTIONS = {
  sendInvoice: (contactId: string, email?: string) => {
    // Navigate to invoice editor with client pre-filled
    const state = { contactId, email }
    return {
      label: 'Send Invoice',
      onClick: () => {
        window.location.href = `/invoices/new?client_id=${contactId}`
      }
    }
  },

  sendContract: (contactId: string, email?: string) => {
    return {
      label: 'Send Contract',
      onClick: () => {
        window.location.href = `/documents/new?client_id=${contactId}`
      }
    }
  },

  scheduleMeeting: (contactId: string) => {
    return {
      label: 'Schedule Meeting',
      onClick: () => {
        window.location.href = `/bookings/new?contact_id=${contactId}`
      }
    }
  },

  sendEmail: (contactId: string, email?: string) => {
    return {
      label: 'Send Email',
      onClick: () => {
        // Open email composer modal with contact
      }
    }
  },
}

export const CROSS_LINKS = {
  fromInvoice: (invoiceId: string, contactId?: string) => {
    if (contactId) {
      return {
        label: 'View Contact',
        url: `/contacts/${contactId}`,
        icon: 'Users'
      }
    }
    return null
  },

  fromContract: (signatureId: string, contactId?: string) => {
    if (contactId) {
      return {
        label: 'View Contact',
        url: `/contacts/${contactId}`,
        icon: 'Users'
      }
    }
    return null
  },

  fromContact: (contactId: string) => {
    return {
      contracts: {
        label: 'Documents',
        url: `/documents?contact_id=${contactId}`,
        icon: 'FileText'
      },
      invoices: {
        label: 'Invoices',
        url: `/invoices?contact_id=${contactId}`,
        icon: 'FileText'
      },
      payments: {
        label: 'Payments',
        url: `/invoices/payments?contact_id=${contactId}`,
        icon: 'DollarSign'
      },
    }
  },
}

export const DASHBOARD_WIDGETS = {
  renderInvoicesWidget: (data?: any) => (
    <InvoicesWidget
      primaryStat={data?.invoiceMetrics?.pending || 0}
      primaryStatColor="text-orange-600"
      secondaryStats={[
        { label: 'Overdue', value: data?.invoiceMetrics?.overdue || 0, color: 'text-red-600' },
        { label: 'Paid This Month', value: `$${(data?.invoiceMetrics?.paidThisMonth || 0).toLocaleString()}`, color: 'text-green-600' },
      ]}
      recentItems={(data?.invoiceMetrics?.recentInvoices || []).map((inv: any) => ({
        id: inv.id,
        title: inv.number,
        subtitle: `$${inv.amount?.toLocaleString() || 0}`,
        status: { label: inv.status, color: inv.status === 'paid' ? 'text-green-600' : inv.status === 'overdue' ? 'text-red-600' : 'text-blue-600' }
      }))}
      action={{ label: 'View Invoices', onClick: () => window.location.href = '/invoices' }}
    />
  ),

  renderSignaturesWidget: (data?: any) => (
    <SignaturesWidget
      primaryStat={data?.signatureMetrics?.awaiting || 0}
      primaryStatColor="text-blue-600"
      secondaryStats={[
        { label: 'Signed This Week', value: data?.signatureMetrics?.signedThisWeek || 0, color: 'text-green-600' },
        { label: 'Total Documents', value: data?.signatureMetrics?.total || 0, color: 'text-gray-600' },
      ]}
      recentItems={(data?.signatureMetrics?.recentDocuments || []).map((sig: any) => ({
        id: sig.id,
        title: sig.title,
        status: { label: sig.status, color: sig.status === 'signed' ? 'text-green-600' : 'text-blue-600' }
      }))}
      action={{ label: 'View Documents', onClick: () => window.location.href = '/documents' }}
    />
  ),

  renderClientProfile: (apiData: any) => {
    const clientProfile = transformApiToClientProfile(apiData)
    return {
      profile: clientProfile,
      actions: {
        sendInvoice: SMART_ACTIONS.sendInvoice(clientProfile.contact.id, clientProfile.contact.email),
        sendContract: SMART_ACTIONS.sendContract(clientProfile.contact.id, clientProfile.contact.email),
        scheduleMeeting: SMART_ACTIONS.scheduleMeeting(clientProfile.contact.id),
        sendEmail: SMART_ACTIONS.sendEmail(clientProfile.contact.id, clientProfile.contact.email),
      }
    }
  },

  renderWorkflowTemplates: () => WORKFLOW_TEMPLATES.map(template => (
    <WorkflowTemplateCard
      key={template.id}
      template={template}
    />
  )),
}

export default {
  SMART_ACTIONS,
  CROSS_LINKS,
  DASHBOARD_WIDGETS,
}