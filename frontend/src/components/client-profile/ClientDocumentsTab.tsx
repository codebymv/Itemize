import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight, FileText, DollarSign, Clock } from 'lucide-react'
import { semanticColors } from '@/design-system/design-tokens'
import type { ClientInvoice, ClientSignature } from '../types/client.types'

interface ClientDocumentsTabProps {
  invoices: ClientInvoice[]
  signatures: ClientSignature[]
  onCreateInvoice?: () => void
  onCreateSignature?: () => void
}

export function ClientDocumentsTab({
  invoices,
  signatures,
  onCreateInvoice,
  onCreateSignature,
}: ClientDocumentsTabProps) {
  const getInvoiceStatus = (status: ClientInvoice['status']) => {
    switch (status) {
      case 'draft':
        return { label: 'Draft', color: 'text-gray-600 border-gray-300' }
      case 'sent':
        return { label: 'Sent', color: 'text-blue-600 border-blue-300' }
      case 'viewed':
        return { label: 'Viewed', color: 'text-purple-600 border-purple-300' }
      case 'paid':
        return { label: 'Paid', color: 'text-green-600 border-green-300' }
      case 'overdue':
        return { label: 'Overdue', color: 'text-red-600 border-red-300' }
      case 'cancelled':
        return { label: 'Cancelled', color: 'text-gray-600 border-gray-400' }
      default:
        return { label: status, color: 'text-gray-600' }
    }
  }

  const getSignatureStatus = (status: ClientSignature['status']) => {
    switch (status) {
      case 'draft':
        return { label: 'Draft', color: 'text-gray-600 border-gray-300' }
      case 'sent':
        return { label: 'Awaiting', color: 'text-blue-600 border-blue-300' }
      case 'viewed':
        return { label: 'Viewed', color: 'text-purple-600 border-purple-300' }
      case 'signed':
        return { label: 'Signed', color: 'text-green-600 border-green-300' }
      case 'expired':
        return { label: 'Expired', color: 'text-red-600 border-red-300' }
      default:
        return { label: status, color: 'text-gray-600' }
    }
  }

  return (
    <div className="space-y-6">
      {/* Invoices */}
      <Card className="bg-muted/10">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoices
          </CardTitle>
          {onCreateInvoice && (
            <Button size="sm" variant="outline" onClick={onCreateInvoice}>
              Create Invoice
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => {
                const status = getInvoiceStatus(invoice.status)
                return (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{invoice.number}</span>
                        <Badge variant="outline" className={`text-xs ${status.color}`}>
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>${invoice.total.toLocaleString()}</span>
                        <span>•</span>
                        <span>{new Date(invoice.date).toLocaleDateString()}</span>
                        {invoice.dueDate && invoice.status !== 'paid' && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due {new Date(invoice.dueDate).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {invoice.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={invoice.url}>
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signatures */}
      <Card className="bg-muted/10">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </CardTitle>
          {onCreateSignature && (
            <Button size="sm" variant="outline" onClick={onCreateSignature}>
              Send Document
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {signatures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet</p>
          ) : (
            <div className="space-y-2">
              {signatures.map((signature) => {
                const status = getSignatureStatus(signature.status)
                return (
                  <div
                    key={signature.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{signature.title}</span>
                        <Badge variant="outline" className={`text-xs ${status.color}`}>
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {signature.sentDate && (
                          <>
                            <span>Sent {new Date(signature.sentDate).toLocaleDateString()}</span>
                            <span>•</span>
                          </>
                        )}
                        {signature.signedDate && (
                          <span className={semanticColors.status.active}>
                            Signed {new Date(signature.signedDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {signature.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={signature.url}>
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
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