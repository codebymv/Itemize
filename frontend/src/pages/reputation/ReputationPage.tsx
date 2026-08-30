import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileText, Loader2, MessageSquare, MoreHorizontal, Send, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { HeaderAction, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { OnboardingModal } from '@/components/OnboardingModal';
import { StatCard } from '@/components/StatCard';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getReputationAnalytics, getReviews, updateReview, type ReputationAnalytics, type Review } from '@/services/reputationApi';
import { ReputationPlatformMark } from './components/ReputationPlatformMark';
import { getReputationPlatformLabel, getReviewSentimentVisual, getReviewStatusVisual } from './constants/reputationVisuals';

const RATING_OPTIONS = [5, 4, 3, 2, 1] as const;

export function ReputationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('reputation');
  const { organizationId, error: initError } = useOrganization({ onError: () => 'Failed to initialize.' });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [analytics, setAnalytics] = useState<ReputationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [responseReview, setResponseReview] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);

  useEffect(() => { if (initError) setLoading(false); }, [initError]);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [reviewsResult, analyticsResult] = await Promise.all([
        getReviews({ rating: ratingFilter === 'all' ? undefined : Number(ratingFilter) }, organizationId),
        getReputationAnalytics(30, organizationId),
      ]);
      setReviews(reviewsResult.reviews ?? []);
      setAnalytics(analyticsResult);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId, ratingFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const filteredReviews = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return reviews;
    return reviews.filter(review => [review.reviewer_name, review.review_text, review.platform]
      .some(value => value?.toLowerCase().includes(query)));
  }, [reviews, searchQuery]);

  const openResponse = (review: Review) => {
    setResponseReview(review);
    setResponseText(review.response_text ?? '');
  };

  const saveResponse = async () => {
    if (!organizationId || !responseReview || !responseText.trim()) return;
    setResponding(true);
    try {
      const updated = await updateReview(responseReview.id, { status: 'responded', response_text: responseText.trim() }, organizationId);
      setReviews(current => current.map(review => review.id === updated.id ? updated : review));
      setResponseReview(null);
      toast({ title: 'Response saved' });
    } catch {
      toast({ title: 'Could not save response', variant: 'destructive' });
    } finally {
      setResponding(false);
    }
  };

  const ratingSelect = (className = 'w-32') => (
    <Select value={ratingFilter} onValueChange={setRatingFilter}>
      <SelectTrigger className={cn('h-11', className)} aria-label="Filter reviews by rating"><SelectValue placeholder="Rating" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All ratings</SelectItem>
        {RATING_OPTIONS.map(rating => <SelectItem key={rating} value={String(rating)}>{rating} stars</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (initError) {
    return (
      <PageLayout title="REVIEWS" icon={<Star className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}>
        <OrganizationErrorState title="Unable to load reviews" icon={Star} />
      </PageLayout>
    );
  }

  const totals = analytics?.overall;
  const totalReviews = totals?.total_reviews ?? 0;
  const neutralReviews = Math.max(0, totalReviews - (totals?.positive_reviews ?? 0) - (totals?.negative_reviews ?? 0));
  const positivePercent = totalReviews > 0 ? Math.round(((totals?.positive_reviews ?? 0) / totalReviews) * 100) : 0;

  return (
    <PageLayout
      title="REVIEWS"
      icon={<Star className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: <HeaderSearch value={searchQuery} onChange={setSearchQuery} label="Search reviews" placeholder="Search reviews..." />,
        filters: <HeaderFilters label="Review filters" activeCount={ratingFilter === 'all' ? 0 : 1} preferExpanded>{ratingSelect()}</HeaderFilters>,
        primaryAction: <HeaderAction label="Request review" icon={<Send className="h-4 w-4" />} onClick={() => navigate('/review-requests?compose=1')} />,
      }}
    >
      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} onComplete={completeOnboarding} onDismiss={dismissOnboarding} content={ONBOARDING_CONTENT.reputation} />

      {!loadError ? <ResponsiveCardRail label="Reputation summary" desktopColumns="md:grid-cols-5" className="responsive-stat-summary">
        <StatCard title="Total reviews" badgeText="Total" value={totalReviews} icon={FileText} description="Across all sources" colorTheme="blue" isLoading={loading} />
        <StatCard title="Average rating" badgeText="Average" value={Number(totals?.average_rating ?? 0).toFixed(1)} icon={Star} description="Out of 5" colorTheme="blue" isLoading={loading} />
        <StatCard title="Positive reviews" badgeText="Positive" value={totals?.positive_reviews ?? 0} icon={ThumbsUp} description={`${positivePercent}% of reviews`} colorTheme="green" isLoading={loading} />
        <StatCard title="Neutral reviews" badgeText="Neutral" value={neutralReviews} icon={MessageSquare} description="Neutral sentiment" colorTheme="gray" isLoading={loading} />
        <StatCard title="Negative reviews" badgeText="Negative" value={totals?.negative_reviews ?? 0} icon={ThumbsDown} description="Needs attention" colorTheme="red" isLoading={loading} />
      </ResponsiveCardRail> : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-4 p-6">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div>
          ) : loadError ? (
            <ErrorState
              kind="section"
              icon={Star}
              title="Unable to load reviews"
              description="We couldn't load your reviews. Try again."
              onRetry={() => void fetchData()}
            />
          ) : filteredReviews.length === 0 ? (
            <EmptyState
              icon={Star}
              kind={searchQuery || ratingFilter !== 'all' ? 'results' : 'passive'}
              title={searchQuery || ratingFilter !== 'all' ? 'No matching reviews' : 'No reviews yet'}
              description={searchQuery || ratingFilter !== 'all' ? undefined : 'Customer reviews will appear here.'}
              actionLabel={searchQuery || ratingFilter !== 'all' ? 'Clear filters' : 'Request review'}
              onAction={() => {
                if (searchQuery || ratingFilter !== 'all') { setSearchQuery(''); setRatingFilter('all'); }
                else navigate('/review-requests?compose=1');
              }}
              className="p-12"
            />
          ) : (
            <div className="divide-y">
              {filteredReviews.map(review => {
                const statusVisual = getReviewStatusVisual(review.status);
                const sentimentVisual = getReviewSentimentVisual(review.sentiment);
                const StatusIcon = statusVisual.icon;
                return (
                  <article key={review.id} className="flex items-start gap-3 px-3 py-4 sm:px-4">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', statusVisual.iconBackgroundClass)}><StatusIcon className={cn('h-5 w-5', statusVisual.iconClass)} aria-hidden="true" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate font-medium">{review.reviewer_name || 'Anonymous'}</h3>
                        <Badge className={cn('text-xs', statusVisual.badgeClass)}>{statusVisual.label}</Badge>
                        <Badge className={cn('text-xs', sentimentVisual.badgeClass)}>{sentimentVisual.label}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><ReputationPlatformMark platform={review.platform} />{getReputationPlatformLabel(review.platform)}</span>
                        <span className="inline-flex items-center gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                          {Array.from({ length: 5 }, (_, index) => <Star key={index} className={cn('h-3.5 w-3.5', index < review.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />)}
                        </span>
                        <time dateTime={review.review_date || review.created_at}>{new Date(review.review_date || review.created_at).toLocaleDateString()}</time>
                      </div>
                      {review.review_text ? <p className="mt-3 text-sm text-muted-foreground">{review.review_text}</p> : null}
                      {review.response_text ? <div className="mt-3 border-l-2 border-blue-600 pl-3"><p className="text-xs font-medium text-foreground">Your response</p><p className="mt-1 text-sm text-muted-foreground">{review.response_text}</p></div> : null}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More actions for ${review.reviewer_name || 'review'}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openResponse(review)}><MessageSquare className="mr-2 h-4 w-4" />{review.response_text ? 'Edit response' : 'Respond'}</DropdownMenuItem>
                        {review.review_url ? <DropdownMenuItem onClick={() => window.open(review.review_url, '_blank', 'noopener,noreferrer')}><ExternalLink className="mr-2 h-4 w-4" />View original</DropdownMenuItem> : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(responseReview)} onOpenChange={open => { if (!open && !responding) setResponseReview(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Respond to {responseReview?.reviewer_name || 'review'}</DialogTitle></DialogHeader>
          <Textarea aria-label="Review response" value={responseText} onChange={event => setResponseText(event.target.value)} placeholder="Write a public response..." className="min-h-36" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseReview(null)} disabled={responding}>Cancel</Button>
            <Button onClick={() => void saveResponse()} disabled={responding || !responseText.trim()}>{responding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}Save response</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

export default ReputationPage;
