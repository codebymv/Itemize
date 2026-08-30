import { type FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { BrandedPublicCard, BrandedPublicContainer, BrandedPublicPage } from '@/components/public/BrandedPublicPage';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getPublicReviewRequest, submitPublicReview, type PublicReviewRequest } from '@/services/reputationApi';
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
      .then(value => { if (active) setRequest(value); })
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
      <BrandedPublicPage>
        <BrandedPublicContainer className="grid min-h-[calc(100vh-4rem)] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading review request" /></BrandedPublicContainer>
      </BrandedPublicPage>
    );
  }

  if (!request) {
    return (
      <BrandedPublicPage>
        <BrandedPublicContainer className="grid min-h-[calc(100vh-4rem)] place-items-center">
          <BrandedPublicCard className="w-full max-w-lg" contentClassName="p-8 text-center"><h1 className="text-xl font-semibold">Review request unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></BrandedPublicCard>
        </BrandedPublicContainer>
      </BrandedPublicPage>
    );
  }

  if (submitted) {
    return (
      <BrandedPublicPage>
        <BrandedPublicContainer className="grid min-h-[calc(100vh-4rem)] place-items-center">
          <BrandedPublicCard className="w-full max-w-lg" contentClassName="p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-green-600" /><h1 className="mt-4 text-2xl font-semibold">Thank you</h1><p className="mt-2 text-muted-foreground">Your feedback has been received.</p></BrandedPublicCard>
        </BrandedPublicContainer>
      </BrandedPublicPage>
    );
  }

  return (
    <BrandedPublicPage>
      <BrandedPublicContainer className="max-w-xl">
        <BrandedPublicCard>
          <form onSubmit={submit} className="p-6 sm:p-8">
            <header className="text-center">
              <p className="text-sm font-medium text-primary">{request.organization_name}</p>
              <h1 className="mt-2 text-2xl font-semibold">How was your experience?</h1>
              {request.contact_name ? <p className="mt-2 text-sm text-muted-foreground">Hi {request.contact_name}, your feedback helps us improve.</p> : null}
            </header>

            <fieldset className="mt-8">
              <legend className="sr-only">Rating</legend>
              <div className="flex justify-center gap-1 sm:gap-2">
                {[1, 2, 3, 4, 5].map(value => (
                  <button key={value} type="button" aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={rating === value} onClick={() => setRating(value)} className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Star className={`h-9 w-9 sm:h-10 sm:w-10 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/35'}`} />
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-8 block text-sm font-medium" htmlFor="review-text">Tell us more <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Textarea id="review-text" value={reviewText} maxLength={5000} onChange={event => setReviewText(event.target.value)} className="mt-2 min-h-32" placeholder="Share your experience" />
            {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting || rating === 0} className="mt-6 h-11 w-full">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Submit feedback
            </Button>
          </form>
        </BrandedPublicCard>
      </BrandedPublicContainer>
    </BrandedPublicPage>
  );
}
