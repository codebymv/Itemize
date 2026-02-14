import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, Play, Pause, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowTemplate } from './workflow-templates'

interface WorkflowTemplateCardProps {
  template: WorkflowTemplate
  onActivate?: () => void
  onDeactivate?: () => void
  onConfigure?: () => void
}

export function WorkflowTemplateCard({
  template,
  onActivate,
  onDeactivate,
  onConfigure,
}: WorkflowTemplateCardProps) {
  const triggerIcons: Record<string, string> = {
    contract_signed: 'Contract Signed',
    invoice_paid: 'Invoice Paid',
    deal_status_changed: 'Deal Updated',
    form_submitted: 'Form Submitted',
    contact_created: 'Contact Created',
  }

  const actionLabels: Record<string, string> = {
    send_invoice: 'Create Invoice',
    update_deal: 'Update Deal',
    send_email: 'Send Email',
    create_task: 'Create Task',
    send_review_request: 'Send Review',
    add_segment: 'Add to Segment',
    update_contact_status: 'Update Contact',
  }

  return (
    <Card className="bg-muted/10 hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('p-2 rounded-lg', template.color, 'inline-block')}>
                <span className="text-2xl">{template.icon}</span>
              </div>
              <CardTitle className="text-base">{template.name}</CardTitle>
              {template.isActive && (
                <Badge variant="outline" className="ml-2 bg-green-50 text-green-600 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              {template.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Triggers */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Triggers
          </div>
          <div className="space-y-1">
            {template.triggers.map((trigger) => (
              <div key={trigger.id} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="text-xs">
                  {triggerIcons[trigger.type] || trigger.type}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Actions</div>
          <div className="flex flex-wrap gap-2">
            {template.actions.map((action) => (
              <Badge key={action.id} variant="outline" className="text-xs">
                {actionLabels[action.type] || action.type}
              </Badge>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t">
          {template.isActive ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onDeactivate}
            >
              <Pause className="h-4 w-4 mr-1" />
              Pause
            </Button>
          ) : (
            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={onActivate}>
              <Play className="h-4 w-4 mr-1" />
              Activate
            </Button>
          )}
          {onConfigure && (
            <Button variant="outline" size="sm" onClick={onConfigure}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}