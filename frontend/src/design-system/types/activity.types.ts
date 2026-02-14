export interface Activity {
  id: string
  type: ActivityType
  itemType: 'invoice' | 'contact' | 'signature' | 'campaign' | 'workflow' | 'note' | 'list' | 'contract' | 'payment' | 'booking' | 'form' | 'landing_page'
  title: string
  description?: string
  timestamp: Date
  actor?: {
    id: string
    name: string
    avatar?: string
  }
  target?: {
    id: string
    name: string
    url?: string
  }
  metadata?: {
    [key: string]: any
  }
  icon?: string
}

export type ActivityType = 
  | 'created'           
  | 'updated'           
  | 'deleted'           
  | 'sent'              
  | 'received'         
  | 'signed'           
  | 'paid'             
  | 'viewed'           
  | 'commented'        
  | 'mentioned'        
  | 'status_changed'    
  | 'workflow_triggered'
  | 'scheduled'        
  | 'completed'        
  | 'published'        
  | 'archived'         
  | 'restored'         
  | 'assigned'         
  | 'tagged'

export interface ActivityFilter {
  type?: ActivityType[]
  itemType?: Activity['itemType'][]
  dateRange?: {
    from: Date
    to: Date
  }
  actorId?: string
  targetId?: string
}

export interface ActivityGroup {
  date: string
  activities: Activity[]
}