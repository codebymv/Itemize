export interface SearchResult {
  id: string
  type: 'contact' | 'invoice' | 'signature' | 'document' | 'note' | 'list' | 'campaign' | 'workflow' | 'booking' | 'form'
  title: string
  description?: string
  url: string
  icon?: string
  metadata?: {
    [key: string]: any
  }
}

export interface SearchFilters {
  types?: SearchResult['type'][]
  organizationId?: number
}