export interface ClientSummaryWidgetData {
  active: number
  leads: number
  customers: number
  addedThisWeek: number
}

export interface InvoiceSummaryWidgetData {
  pending: number
  overdue: number
  paidThisMonth: number
  totalRevenue: number
  recentInvoices: Array<{
    id: string
    number: string
    amount: number
    status: string
  }>
}

export interface SignatureSummaryWidgetData {
  awaiting: number
  signedThisWeek: number
  recentSignatures: Array<{
    id: string
    title: string
    status: string
    sentDate: string
  }>
}

export interface WorkspaceSummaryWidgetData {
  activeCanvases: number
  totalLists: number
  recentItems: Array<{
    id: string
    title: string
    type: 'list' | 'note' | 'whiteboard'
  }>
}

export interface CampaignSummaryWidgetData {
  active: number
  sentThisWeek: number
  totalEmails: number
  recentCampaigns: Array<{
    id: string
    name: string
    status: string
  }>
}

export interface BookingSummaryWidgetData {
  upcomingThisWeek: number
  today: number
  completedThisMonth: number