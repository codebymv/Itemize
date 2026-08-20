import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Mail, ShieldCheck, XCircle } from 'lucide-react';
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
      <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div className="flex items-center gap-3 text-slate-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading estimate…
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center space-y-4">
            <FileText className="h-10 w-10 text-slate-400 mx-auto" />
            <h1 className="text-xl font-semibold text-slate-900">Estimate unavailable</h1>
            <p className="text-sm text-slate-600">{error || 'This estimate link is invalid or expired.'}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const estimate = data.estimate;
  const terminal = estimate.status === 'accepted' || estimate.status === 'declined';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white grid place-items-center">
              <FileText className="h-4 w-4" />
            </div>
            Itemize
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            Secure estimate
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 space-y-6">
        {terminal && (
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${
            estimate.status === 'accepted'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-slate-300 bg-slate-100 text-slate-800'
          }`} role="status">
            {estimate.status === 'accepted'
              ? <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              : <XCircle className="h-5 w-5 mt-0.5 shrink-0" />}
            <div>
              <p className="font-semibold">
                Estimate {estimate.status === 'accepted' ? 'accepted' : 'declined'}
              </p>
              <p className="text-sm opacity-80">Your response has been recorded.</p>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <section className="p-6 sm:p-8 border-b border-slate-200 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-blue-600 mb-1">Estimate from</p>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{data.business.name}</h1>
                {data.business.email && (
                  <a className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700" href={`mailto:${data.business.email}`}>
                    <Mail className="h-4 w-4" />{data.business.email}
                  </a>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-xs uppercase tracking-wider text-slate-500">Estimate</p>
                <p className="font-semibold text-lg">{estimate.number}</p>
                <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-slate-500">Issued</dt><dd>{date(estimate.issue_date)}</dd>
                  <dt className="text-slate-500">Valid until</dt><dd>{date(estimate.valid_until)}</dd>
                </dl>
              </div>
            </section>

            {data.customer.name && (
              <section className="px-6 py-5 sm:px-8 border-b border-slate-200">
                <p className="text-xs uppercase tracking-wider text-slate-500">Prepared for</p>
                <p className="mt-1 font-medium">{data.customer.name}</p>
              </section>
            )}

            <section className="overflow-x-auto" aria-label="Estimate line items">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3 sm:px-8 font-medium">Item</th>
                    <th className="px-4 py-3 text-right font-medium">Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Rate</th>
                    <th className="px-6 py-3 sm:px-8 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`}>
                      <td className="px-6 py-4 sm:px-8">
                        <p className="font-medium">{item.name}</p>
                        {item.description && <p className="mt-1 text-slate-500 whitespace-pre-wrap">{item.description}</p>}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums">{Number(item.quantity).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{currency.format(Number(item.unit_price))}</td>
                      <td className="px-6 py-4 sm:px-8 text-right font-medium tabular-nums">{currency.format(Number(item.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="px-6 py-6 sm:px-8 border-t border-slate-200 flex justify-end">
              <dl className="w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{currency.format(Number(estimate.subtotal))}</dd></div>
                {Number(estimate.discount_amount) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd className="tabular-nums">−{currency.format(Number(estimate.discount_amount))}</dd></div>}
                {Number(estimate.tax_amount) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd className="tabular-nums">{currency.format(Number(estimate.tax_amount))}</dd></div>}
                <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{currency.format(Number(estimate.total))}</dd></div>
              </dl>
            </section>

            {(estimate.notes || estimate.terms_and_conditions) && (
              <section className="px-6 py-6 sm:px-8 border-t border-slate-200 grid gap-6 sm:grid-cols-2 text-sm">
                {estimate.notes && <div><h2 className="font-semibold mb-2">Notes</h2><p className="text-slate-600 whitespace-pre-wrap">{estimate.notes}</p></div>}
                {estimate.terms_and_conditions && <div><h2 className="font-semibold mb-2">Terms</h2><p className="text-slate-600 whitespace-pre-wrap">{estimate.terms_and_conditions}</p></div>}
              </section>
            )}
          </CardContent>
        </Card>

        {!terminal && (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div>
                <h2 className="font-semibold text-lg">Ready to respond?</h2>
                <p className="text-sm text-slate-600 mt-1">Your response is shared immediately with {data.business.name}.</p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:shrink-0">
                <Button variant="outline" onClick={() => setConfirming('decline')} disabled={!!pending}>
                  {pending === 'decline' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Decline
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setConfirming('accept')} disabled={!!pending}>
                  {pending === 'accept' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Accept estimate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {error && data && <p className="text-sm text-red-700 text-center" role="alert">{error}</p>}
        <p className="text-center text-xs text-slate-500">This private link provides access to this estimate. Please do not forward it.</p>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming === 'accept' ? 'Accept this estimate?' : 'Decline this estimate?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'accept'
                ? `This records your approval of estimate ${estimate.number} for ${currency.format(Number(estimate.total))}.`
                : `This records that you do not approve estimate ${estimate.number}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirming === 'decline' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
              onClick={() => confirming && void respond(confirming)}
            >
              {confirming === 'accept' ? 'Accept estimate' : 'Decline estimate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
