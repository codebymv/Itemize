import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, Calendar, CheckCircle2, Clock } from 'lucide-react'
import type { ClientPayment } from '../../design-system/types/client.types'

interface ClientPaymentsTabProps {
  payments: ClientPayment[]
}

export function ClientPaymentsTab({ payments }: ClientPaymentsTabProps) {
  const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const totalInvoicesPaid = new Set(payments.map(p => p.invoiceId)).size

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-muted/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">${totalPayments.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Paid</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalInvoicesPaid}</div>
                <div className="text-sm text-muted-foreground">Invoices Paid</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{payments.length}</div>
                <div className="text-sm text-muted-foreground">Transactions</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <Card className="bg-muted/10">
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                      <DollarSign className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{payment.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(payment.date).toLocaleDateString()} • {payment.method}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm">${payment.amount.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}