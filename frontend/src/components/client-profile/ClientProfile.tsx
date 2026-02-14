import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Mail,
  Phone,
  FileText,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import { semanticColors } from '@/design-system/design-tokens'
import { ActivityTimeline } from '../activity-timeline'
import { ClientDocumentsTab } from './ClientDocumentsTab'
import { ClientCommunicationsTab } from './ClientCommunicationsTab'
import { ClientPaymentsTab } from './ClientPaymentsTab'
import type { ClientProfile } from '../../design-system/types/client.types'

interface ClientProfileProps {
  client: ClientProfile
  loading?: boolean
  onCreateInvoice?: () => void
  onCreateSignature?: () => void
  onSendEmail?: () => void
  onAddCall?: () => void
  onAddNote?: () => void
  onScheduleMeeting?: () => void
}

export function ClientProfile({
  client,
  loading,
  onCreateInvoice,
  onCreateSignature,
  onSendEmail,
  onAddCall,
  onAddNote,
  onScheduleMeeting,
}: ClientProfileProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const displayName = `${client.contact.firstName} ${client.contact.lastName}`.trim() || 'Contact'
  const initials = (client.contact.firstName?.[0] || '') + (client.contact.lastName?.[0] || '')

  return (
    <div className="space-y-6">
      {/* Client Header Card */}
      <Card className="bg-muted/10">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-2xl font-medium text-blue-700 dark:text-blue-300 flex-shrink-0">
              {initials.toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{displayName}</h1>

              {client.contact.company && (
                <div className="text-muted-foreground mb-2">{client.contact.company}</div>
              )}

              <div className="flex flex-wrap gap-3 text-sm">
                {client.contact.email && (
                  <a href={`mailto:${client.contact.email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {client.contact.email}
                  </a>
                )}
                {client.contact.phone && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {client.contact.phone}
                  </div>
                )}
              </div>

              {client.contact.city && (
                <div className="text-sm text-muted-foreground mt-2">
                  {client.contact.city}, {client.contact.state} {client.contact.country}
                </div>
              )}
            </div>

            {/* Status Badge */}
            <Badge
              className={semanticColors.status[client.contact.status]}
              variant="outline"
            >
              {client.contact.status}
            </Badge>
          </div>

          {client.contact.notes && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">{client.contact.notes}</p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {onCreateInvoice && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <FileText className="h-4 w-4 mr-2" />
                Send Invoice
              </Button>
            )}
            {onCreateSignature && (
              <Button size="sm" variant="outline" onClick={onCreateSignature}>
                <FileText className="h-4 w-4 mr-2" />
                Send Contract
              </Button>
            )}
            {onSendEmail && (
              <Button size="sm" variant="outline" onClick={onSendEmail}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
            )}
            {onScheduleMeeting && (
              <Button size="sm" variant="outline" onClick={onScheduleMeeting}>
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="timeline">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="communications">Comms</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <ActivityTimeline
            activities={client.timeline}
            empty={{
              title: 'No activity yet',
              description: 'Activity will appear here as you interact with this client'
            }}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <ClientDocumentsTab
            invoices={client.invoices}
            signatures={client.signatures}
            onCreateInvoice={onCreateInvoice}
            onCreateSignature={onCreateSignature}
          />
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          <ClientCommunicationsTab
            communications={client.communications}
            onSendEmail={onSendEmail}
            onAddCall={onAddCall}
            onAddNote={onAddNote}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <ClientPaymentsTab payments={client.payments} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card className="bg-muted/10">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {client.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks yet</p>
              ) : (
                <div className="space-y-2">
                  {client.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        task.status === 'completed' ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          task.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/30'
                            : 'bg-orange-100 dark:bg-orange-900/30'
                        }`}>
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <div className={`font-medium text-sm ${
                            task.status === 'completed' ? 'line-through' : ''
                          }`}>
                            {task.title}
                          </div>
                          {task.dueDate && (
                            <div className="text-xs text-muted-foreground">
                              Due {new Date(task.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}