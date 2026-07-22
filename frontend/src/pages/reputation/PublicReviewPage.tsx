import { FormEvent, useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  getPublicReviewRequest,
  PublicReviewRequest,
  submitPublicReview,
} from '@/services/reputationApi';
import { safePublicReviewRedirect } from './publicReviewBehavior';

export default function PublicReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<PublicReviewRequest | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!token) {
      setError('This review request is unavailable.');
      setLoading(false);
      return;
    }
    getPublicReviewRequest(token)
      .then((value) => { if (active) setRequest(value); })
      .catch(() => { if (active) setError('This review request is unavailable or has expired.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || submitting || rating < 1 || rating > 5) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await submitPublicReview(token, {
        rating,
        review_text: reviewText.trim() || undefined,
        platform: request?.preferred_platform || undefined,
      });
      setSubmitted(true);
      const redirect = safePublicReviewRedirect(result.redirect_url);
      if (redirect) window.location.assign(redirect);
    } catch {
      setError('We could not save your feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading review request" />
      </main>
    );
  }

  if (!request) {
    return (
      <main className="min-h-screen grid place-items-center bg-muted/20 px-4">
        <section className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Review request unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen grid place-items-center bg-muted/20 px-4">
        <section className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">Thank you</h1>
          <p className="mt-2 text-muted-foreground">Your feedback has been received.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-10">
      <form onSubmit={submit} className="mx-auto w-full max-w-xl rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <header className="text-center">
          <p className="text-sm font-medium text-primary">{request.organization_name}</p>
          <h1 className="mt-2 text-2xl font-semibold">How was your experience?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {request.contact_name ? `Hi ${request.contact_name}, ` : ''}your feedback helps us improve.
          </p>
        </header>

        <fieldset className="mt-8">
          <legend className="sr-only">Rating</legend>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
                className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star className={`h-9 w-9 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-8 block text-sm font-medium" htmlFor="review-text">
          Tell us more <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="review-text"
          value={reviewText}
          maxLength={5000}
          onChange={(event) => setReviewText(event.target.value)}
          className="mt-2 min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Share your experience"
        />

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={submitting || rating === 0}
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit feedback
        </button>
      </form>
    </main>
  );
}
