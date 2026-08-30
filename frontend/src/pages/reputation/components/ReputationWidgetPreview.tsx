import { useMemo, useState } from 'react';
import { Monitor, Smartphone, Star } from 'lucide-react';
import { LiveServicePreview, ServicePreviewBrowser } from '@/components/preview/LiveServicePreview';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Review, ReviewWidget } from '@/services/reputationApi';
import { ReputationPlatformMark } from './ReputationPlatformMark';

type PreviewConfig = Pick<ReviewWidget,
  | 'widget_type'
  | 'theme'
  | 'primary_color'
  | 'background_color'
  | 'text_color'
  | 'border_radius'
  | 'show_rating_stars'
  | 'show_reviewer_photo'
  | 'show_review_date'
  | 'show_platform_icon'
  | 'max_reviews'
>;

const SAMPLE_REVIEWS: Array<Pick<Review, 'id' | 'reviewer_name' | 'review_text' | 'rating' | 'platform' | 'review_date'>> = [
  { id: -1, reviewer_name: 'Maya Patel', review_text: 'The team made everything clear and easy from start to finish.', rating: 5, platform: 'google', review_date: '2026-08-24T12:00:00.000Z' },
  { id: -2, reviewer_name: 'Jordan Lee', review_text: 'Fast, thoughtful service and a great result.', rating: 5, platform: 'facebook', review_date: '2026-08-18T12:00:00.000Z' },
  { id: -3, reviewer_name: 'Elena Rivera', review_text: 'Responsive throughout the project and very easy to work with.', rating: 4, platform: 'custom', review_date: '2026-08-09T12:00:00.000Z' },
];

function ReviewCard({ review, config }: { review: (typeof SAMPLE_REVIEWS)[number]; config: PreviewConfig }) {
  return (
    <article
      className="min-w-0 border p-4 shadow-sm"
      style={{
        backgroundColor: config.background_color,
        color: config.text_color,
        borderRadius: `${config.border_radius}px`,
      }}
    >
      <div className="flex items-center gap-2">
        {config.show_reviewer_photo ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: config.primary_color }}>
            {(review.reviewer_name || 'A').slice(0, 1)}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{review.reviewer_name || 'Anonymous'}</p>
          {config.show_review_date ? <p className="text-[11px] opacity-60">{new Date(review.review_date).toLocaleDateString()}</p> : null}
        </div>
        {config.show_platform_icon ? <ReputationPlatformMark platform={review.platform} /> : null}
      </div>
      {config.show_rating_stars ? (
        <div className="mt-3 flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
          {Array.from({ length: 5 }, (_, index) => (
            <Star key={index} className="h-4 w-4" fill={index < review.rating ? config.primary_color : 'transparent'} color={index < review.rating ? config.primary_color : '#94a3b8'} />
          ))}
        </div>
      ) : null}
      {review.review_text ? <p className="mt-3 text-sm leading-6 opacity-80">{review.review_text}</p> : null}
    </article>
  );
}

export function ReputationWidgetPreview({ config, reviews = [] }: { config: PreviewConfig; reviews?: Review[] }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const previewReviews = useMemo(() => {
    const usable = reviews
      .filter(review => review.rating >= 1)
      .map(review => ({
        id: review.id,
        reviewer_name: review.reviewer_name || 'Anonymous',
        review_text: review.review_text || '',
        rating: review.rating,
        platform: review.platform,
        review_date: review.review_date || review.created_at,
      }));
    return (usable.length > 0 ? usable : SAMPLE_REVIEWS).slice(0, Math.max(1, Math.min(config.max_reviews, 6)));
  }, [config.max_reviews, reviews]);

  const controls = (
    <div className="flex rounded-lg bg-muted/60 p-1" aria-label="Widget preview device">
      <Button type="button" size="sm" variant={device === 'desktop' ? 'default' : 'ghost'} className="h-8 px-2" aria-label="Desktop widget preview" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor className="h-4 w-4" /><span className="hidden sm:inline">Desktop</span></Button>
      <Button type="button" size="sm" variant={device === 'mobile' ? 'default' : 'ghost'} className="h-8 px-2" aria-label="Mobile widget preview" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone className="h-4 w-4" /><span className="hidden sm:inline">Mobile</span></Button>
    </div>
  );

  return (
    <LiveServicePreview controls={controls} contentClassName="p-3">
      <ServicePreviewBrowser contentClassName="overflow-auto bg-slate-100 p-4 dark:bg-slate-950/60">
        <div className={cn('mx-auto min-h-full transition-[max-width] duration-200', device === 'mobile' ? 'max-w-[22rem]' : 'max-w-4xl')}>
          <div className="rounded-xl border bg-white/70 p-4 shadow-sm dark:bg-slate-900/70 sm:p-6">
            {config.widget_type === 'badge' ? (
              <div className="mx-auto flex max-w-xs items-center justify-center gap-3 border px-5 py-4" style={{ backgroundColor: config.background_color, color: config.text_color, borderRadius: `${config.border_radius}px` }}>
                <Star className="h-7 w-7" fill={config.primary_color} color={config.primary_color} />
                <div><p className="text-xl font-semibold">4.8</p><p className="text-xs opacity-65">Customer rating</p></div>
              </div>
            ) : config.widget_type === 'floating' ? (
              <div className="flex min-h-80 items-end justify-end"><div className="w-full max-w-sm"><ReviewCard review={previewReviews[0]} config={config} /></div></div>
            ) : config.widget_type === 'carousel' ? (
              <div className="mx-auto max-w-lg"><ReviewCard review={previewReviews[0]} config={config} /><div className="mt-4 flex justify-center gap-2">{previewReviews.slice(0, 3).map((review, index) => <span key={review.id} className={cn('h-2 w-2 rounded-full', index === 0 ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700')} />)}</div></div>
            ) : (
              <div className={cn(config.widget_type === 'grid' && device === 'desktop' ? 'grid grid-cols-2 gap-4' : 'space-y-4')}>
                {previewReviews.map(review => <ReviewCard key={review.id} review={review} config={config} />)}
              </div>
            )}
          </div>
        </div>
      </ServicePreviewBrowser>
    </LiveServicePreview>
  );
}
