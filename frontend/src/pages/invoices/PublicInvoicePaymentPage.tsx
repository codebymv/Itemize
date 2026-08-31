import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, ReceiptText, RotateCcw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {
  BrandedPublicCard,
  BrandedPublicContainer,
  BrandedPublicPage,
} from '@/components/public/BrandedPublicPage';
import { CardContent } from '@/components/ui/card';
import {
  getPublicInvoicePaymentResult,
  PublicInvoicePaymentResult,
} from '@/services/publicInvoicePaymentsApi';

const POLL_INTERVAL_MS = 1_500;
const MAX_POLLS = 8;

export default function PublicInvoicePaymentPage() {
  const location = useLocation();
  const cancelled = location.pathname.endsWith('/cancelled');
  const sessionId = useMemo(
    () => new URLSearchParams(location.search).get('session_id')?.trim() || '',
    [location.search],
  );
  const [result, setResult] = useState<PublicInvoicePaymentResult | null>(null);
  const [loading, setLoading] = useState(!cancelled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cancelled) return;
    if (!sessionId) {
      setError('This payment confirmation link is incomplete.');
      setLoading(false);
      return;
    }
    let active = true;
    let poll = 0;
    const load = async () => {
      try {
        const data = await getPublicInvoicePaymentResult(sessionId);
        if (!active) return;
        setResult(data);
        setError(null);
        if (data.status === 'processing' && poll < MAX_POLLS) {
          poll += 1;
          window.setTimeout(load, POLL_INTERVAL_MS);
          return;
        }
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error
          ? requestError.message
          : 'Payment confirmation is unavailable.');
      }
      if (active) setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [cancelled, sessionId]);

  const currency = useMemo(() => new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: result?.currency || 'USD',
  }), [result?.currency]);

  if (cancelled) {
    return (
      <PaymentResultShell
        icon={<RotateCcw className="h-7 w-7 text-muted-foreground" />}
        title="Payment not completed"
        description="No payment recorded. Return to the invoice to retry."
      />
    );
  }

  if (loading && !result) {
    return (
      <PaymentResultShell
        icon={<Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-primary" />}
        title="Confirming your payment"
        description="Processing payment. Keep this page open."
        busy
      />
    );
  }

  if (!result) {
    return (
      <PaymentResultShell
        icon={<ReceiptText className="h-7 w-7 text-muted-foreground" />}
        title="Confirmation unavailable"
        description={error || 'Payment unconfirmed. Check your receipt or contact the sender.'}
      />
    );
  }

  const paid = result.status === 'paid';
  const refunded = result.status === 'refunded';
  return (
    <BrandedPublicPage>
      <BrandedPublicContainer className="max-w-2xl">
        <BrandedPublicCard>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className={`grid h-14 w-14 place-items-center rounded-full ${
                paid ? 'bg-emerald-500/10' : refunded ? 'bg-muted' : 'bg-primary/10'
              }`}>
                {paid
                  ? <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  : refunded
                    ? <RotateCcw className="h-7 w-7 text-muted-foreground" />
                    : <Clock3 className="h-7 w-7 text-primary" />}
              </div>
              <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
                {paid ? 'Payment received' : refunded ? 'Payment refunded' : 'Payment processing'}
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {paid
                  ? `${result.businessName} has been notified that your payment was received.`
                  : refunded
                    ? 'This payment has been refunded by the sender.'
                    : 'Payment accepted. Recording final confirmation.'}
              </p>
            </div>

            <dl className="mt-8 divide-y divide-border rounded-xl border border-border bg-muted/20 px-4 sm:px-5">
              <ResultRow label="Invoice" value={result.invoiceNumber} />
              <ResultRow label="Paid to" value={result.businessName} />
              <ResultRow label="Amount" value={currency.format(Number(result.amount))} strong />
            </dl>
          </CardContent>
        </BrandedPublicCard>
        <p className="text-center text-xs text-muted-foreground">
          You may safely close this page.
        </p>
      </BrandedPublicContainer>
    </BrandedPublicPage>
  );
}

function ResultRow({ label, value, strong = false }: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'text-right font-medium'}>{value}</dd>
    </div>
  );
}

function PaymentResultShell({ icon, title, description, busy = false }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  busy?: boolean;
}) {
  return (
    <BrandedPublicPage>
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
        <BrandedPublicCard className="w-full max-w-md">
          <CardContent
            className="p-8 text-center"
            role={busy ? 'status' : undefined}
            aria-live={busy ? 'polite' : undefined}
            aria-busy={busy ? 'true' : undefined}
          >
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">{icon}</div>
            <h1 className="mt-5 text-xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </CardContent>
        </BrandedPublicCard>
      </div>
    </BrandedPublicPage>
  );
}
