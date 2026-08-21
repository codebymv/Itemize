import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  XCircle,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useParams } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PUBLIC_SHELL_WIDTH } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  acceptPublicEstimate,
  declinePublicEstimate,
  getPublicEstimate,
  PublicEstimateData,
} from '@/services/publicEstimatesApi';

const date = (value: string): string => {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
};

function RecipientHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className={`${PUBLIC_SHELL_WIDTH} flex h-16 items-center justify-between gap-4`}>
        <a href="https://itemize.cloud" className="group flex items-center gap-2.5" aria-label="Itemize home">
          <img
            src="/icon.png"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0 transition-transform group-hover:-translate-y-0.5"
          />
          <img src="/textblack.png" alt="Itemize" className="h-6 w-auto dark:hidden" />
          <img src="/textwhite.png" alt="" aria-hidden="true" className="hidden h-6 w-auto dark:block" />
        </a>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button asChild size="sm" className="h-9 px-3 sm:px-4">
            <a href="/register?mode=trial">Try Itemize</a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={`Use ${dark ? 'light' : 'dark'} theme`}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function RecipientPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <RecipientHeader />
      {children}
    </main>
  );
}

export default function PublicEstimatePage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicEstimateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [confirming, setConfirming] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (!token) {
      setError('This estimate link is invalid or expired.');
      setLoading(false);
      return;
    }
    getPublicEstimate(token)
      .then(setData)
      .catch((requestError) => setError(
        requestError instanceof Error ? requestError.message : 'This estimate is unavailable.',
      ))
      .finally(() => setLoading(false));
  }, [token]);

  const currency = useMemo(() => new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: data?.estimate.currency || 'USD',
  }), [data?.estimate.currency]);

  const respond = async (action: 'accept' | 'decline') => {
    if (!token || pending) return;
    setConfirming(null);
    setPending(action);
    setError(null);
    try {
      setData(action === 'accept'
        ? await acceptPublicEstimate(token)
        : await declinePublicEstimate(token));
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : 'Your response could not be saved. Please try again.');
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return (
      <RecipientPage>
        <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
          <div className="flex items-center gap-3 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading estimate…
          </div>
        </div>
      </RecipientPage>
    );
  }

  if (!data) {
    return (
      <RecipientPage>
        <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h1 className="text-xl font-semibold">Estimate unavailable</h1>
              <p className="text-sm text-muted-foreground">
                {error || 'This estimate link is invalid or expired.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </RecipientPage>
    );
  }

  const estimate = data.estimate;
  const terminal = estimate.status === 'accepted' || estimate.status === 'declined';

  return (
    <RecipientPage>
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        {terminal && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              estimate.status === 'accepted'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
            role="status"
          >
            {estimate.status === 'accepted'
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              <p className="font-semibold">
                Estimate {estimate.status === 'accepted' ? 'accepted' : 'declined'}
              </p>
              <p className="text-sm opacity-80">Your response has been recorded.</p>
            </div>
          </div>
        )}

        <Card className="overflow-hidden shadow-sm">
          <div className="h-1 bg-primary" aria-hidden="true" />
          <CardContent className="p-0">
            <section className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-border bg-muted/25 p-6 sm:gap-x-8 sm:p-8">
              <p className="self-end text-xs uppercase tracking-wider text-muted-foreground">Prepared by</p>
              <div className="flex flex-col items-end text-right">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground shadow-sm sm:text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Estimate</span>
                  <span aria-hidden="true" className="opacity-70">·</span>
                  <span className="tabular-nums">{estimate.number}</span>
                </div>
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data.business.name}</h1>
                {data.business.email && (
                  <a
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                    href={`mailto:${data.business.email}`}
                  >
                    <Mail className="h-4 w-4" />{data.business.email}
                  </a>
                )}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dl className="mt-3 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-1 text-sm sm:mt-1 sm:justify-end">
                  <dt className="text-muted-foreground">Issued</dt><dd>{date(estimate.issue_date)}</dd>
                  <dt className="text-muted-foreground">Valid until</dt><dd>{date(estimate.valid_until)}</dd>
                </dl>
              </div>
            </section>

            {data.customer.name && (
              <section className="border-b border-border px-6 py-5 sm:px-8">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Prepared for</p>
                <p className="mt-1 font-medium">{data.customer.name}</p>
              </section>
            )}

            <section className="divide-y divide-border sm:hidden" aria-label="Estimate line items">
              <div className="bg-muted/50 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Items
              </div>
              {data.items.map((item, index) => (
                <article className="space-y-4 px-6 py-5" key={`mobile-${item.name}-${index}`}>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">Qty</dt>
                      <dd className="mt-1 tabular-nums">{Number(item.quantity).toLocaleString()}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">Rate</dt>
                      <dd className="mt-1 tabular-nums">{currency.format(Number(item.unit_price))}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">Amount</dt>
                      <dd className="mt-1 font-medium tabular-nums">{currency.format(Number(item.total))}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </section>

            <section className="hidden overflow-x-auto sm:block" aria-label="Estimate line items table">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium sm:px-8">Item</th>
                    <th className="px-4 py-3 text-right font-medium">Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-6 py-3 text-right font-medium sm:px-8">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`}>
                      <td className="px-6 py-4 sm:px-8">
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums">{Number(item.quantity).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{currency.format(Number(item.unit_price))}</td>
                      <td className="px-6 py-4 text-right font-medium tabular-nums sm:px-8">{currency.format(Number(item.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="flex justify-end border-t border-border px-6 py-6 sm:px-8">
              <dl className="w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{currency.format(Number(estimate.subtotal))}</dd>
                </div>
                {Number(estimate.discount_amount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="tabular-nums">−{currency.format(Number(estimate.discount_amount))}</dd>
                  </div>
                )}
                {Number(estimate.tax_amount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tax</dt>
                    <dd className="tabular-nums">{currency.format(Number(estimate.tax_amount))}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-3 text-lg font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{currency.format(Number(estimate.total))}</dd>
                </div>
              </dl>
            </section>

            {(estimate.notes || estimate.terms_and_conditions) && (
              <section className="grid gap-6 border-t border-border bg-muted/20 px-6 py-6 text-sm sm:grid-cols-2 sm:px-8">
                {estimate.notes && (
                  <div>
                    <h2 className="mb-2 font-semibold">Notes</h2>
                    <p className="whitespace-pre-wrap text-muted-foreground">{estimate.notes}</p>
                  </div>
                )}
                {estimate.terms_and_conditions && (
                  <div>
                    <h2 className="mb-2 font-semibold">Terms</h2>
                    <p className="whitespace-pre-wrap text-muted-foreground">{estimate.terms_and_conditions}</p>
                  </div>
                )}
              </section>
            )}
          </CardContent>
        </Card>

        {!terminal && (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <h2 className="text-lg font-semibold">Ready to respond?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  your response is shared immediately
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:shrink-0 sm:flex-row">
                <Button variant="outline" onClick={() => setConfirming('decline')} disabled={!!pending}>
                  {pending === 'decline' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Decline
                </Button>
                <Button onClick={() => setConfirming('accept')} disabled={!!pending}>
                  {pending === 'accept' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Accept estimate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {error && data && <p className="text-center text-sm text-destructive" role="alert">{error}</p>}
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          This private link provides access to this estimate. Please do not forward it.
        </p>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'accept' ? 'Accept this estimate?' : 'Decline this estimate?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'accept'
                ? `This records your approval of estimate ${estimate.number} for ${currency.format(Number(estimate.total))}.`
                : `This records that you do not approve estimate ${estimate.number}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirming === 'decline'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined}
              onClick={() => confirming && void respond(confirming)}
            >
              {confirming === 'accept' ? 'Accept estimate' : 'Decline estimate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RecipientPage>
  );
}
