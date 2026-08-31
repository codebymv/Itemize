import React from 'react'
import { DollarSign, Calendar, CheckCircle2, PieChart } from 'lucide-react'
import { StatCard } from '@/components/StatCard'
import { ResponsiveMoneyValue } from '@/components/ui/responsive-value'
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail'
import { FramedSection } from '@/components/ui/framed-section'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClientPayment } from '../../design-system/types/client.types'

interface ClientPaymentsTabProps {
  payments: ClientPayment[]
}

export function ClientPaymentsTab({ payments }: ClientPaymentsTabProps) {
  const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const totalInvoicesPaid = new Set(payments.map(p => p.invoiceId)).size

  return (
    <div className="space-y-6">
      <FramedSection title="Overview" icon={PieChart}>
        <ResponsiveCardRail
          label="Client payment summary"
          desktopColumns="md:grid-cols-3"
          className="responsive-stat-summary mb-0"
        >
        <StatCard
          title="Total Paid"
          badgeText="Total Paid"
          value={<ResponsiveMoneyValue amount={totalPayments} currency="USD" locale="en-US" />}
          icon={DollarSign}
          colorTheme="green"
        />
        <StatCard
          title="Invoices Paid"
          badgeText="Invoices Paid"
          value={totalInvoicesPaid}
          icon={CheckCircle2}
          colorTheme="blue"
        />
        <StatCard
          title="Transactions"
          badgeText="Transactions"
          value={payments.length}
          icon={Calendar}
          colorTheme="gray"
        />
        </ResponsiveCardRail>
      </FramedSection>

      <Card className="bg-muted/10">
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent surface="inset">
          {payments.length === 0 ? (
            <EmptyState icon={DollarSign} kind="inline" title="No payments yet" />
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
