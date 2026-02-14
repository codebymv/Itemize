import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Phone, MessageSquare, Plus, ArrowRight } from 'lucide-react'
import type { ClientCommunication } from '../../design-system/types/client.types'

interface ClientCommunicationsTabProps {
  communications: ClientCommunication[]
  onSendEmail?: () => void
  onAddCall?: () => void
  onAddNote?: () => void
}

export function ClientCommunicationsTab({
  communications,
  onSendEmail,
  onAddCall,
  onAddNote,
}: ClientCommunicationsTabProps) {
  const getCommunicationIcon = (type: ClientCommunication['type']) => {
    switch (type) {
      case 'email':
        return Mail
      case 'sms':
        return MessageSquare
      case 'note':
        return Plus
      case 'call':
        return Phone
      default:
        return MessageSquare
    }
  }

  const getCommunicationBg = (type: ClientCommunication['type']) => {
    switch (type) {
      case 'email':
        return 'bg-blue-100 dark:bg-blue-900/30'
      case 'sms':
        return 'bg-purple-100 dark:bg-purple-900/30'
      case 'note':
        return 'bg-gray-100 dark:bg-gray-900'
      case 'call':
        return 'bg-green-100 dark:bg-green-900/30'
      default:
        return 'bg-gray-100 dark:bg-gray-900'
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card className="bg-muted/10">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {onSendEmail && (
            <Button variant="outline" className="w-full justify-start" onClick={onSendEmail}>
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          )}
          {onAddCall && (
            <Button variant="outline" className="w-full justify-start" onClick={onAddCall}>
              <Phone className="h-4 w-4 mr-2" />
              Add Call Note
            </Button>
          )}
          {onAddNote && (
            <Button variant="outline" className="w-full justify-start" onClick={onAddNote}>
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Communications History */}
      <Card className="bg-muted/10">
        <CardHeader>
          <CardTitle className="text-base">Communication History</CardTitle>
        </CardHeader>
        <CardContent>
          {communications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No communication history yet</p>
          ) : (
            <div className="space-y-3">
              {communications.map((comm) => {
                const Icon = getCommunicationIcon(comm.type)
                return (
                  <div
                    key={comm.id}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                  >
                    <div className={`p-2 rounded-lg flex-shrink-0 ${getCommunicationBg(comm.type)}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {comm.subject && (
                        <div className="font-medium text-sm mb-1">{comm.subject}</div>
                      )}
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {comm.content}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(comm.date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}