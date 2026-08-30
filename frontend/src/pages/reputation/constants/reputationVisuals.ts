import {
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Flag,
  MailOpen,
  MousePointerClick,
  Pause,
  Send,
  ThumbsDown,
  ThumbsUp,
  UserMinus,
  XCircle,
} from 'lucide-react';
import { defineStatus, getUnknownStatusVisual, type StatusVisual } from '@/lib/statusVisuals';
import type { Review, ReviewRequest } from '@/services/reputationApi';

const REQUEST_STATUS_VISUALS: Record<ReviewRequest['status'], StatusVisual> = {
  pending: defineStatus('Pending', 'orange', Clock3),
  sent: defineStatus('Sent', 'orange', Send),
  opened: defineStatus('Opened', 'blue', MailOpen),
  clicked: defineStatus('Clicked', 'blue', MousePointerClick),
  completed: defineStatus('Completed', 'green', CheckCircle2),
  failed: defineStatus('Failed', 'red', XCircle),
  unsubscribed: defineStatus('Unsubscribed', 'gray', UserMinus),
};

const REVIEW_STATUS_VISUALS: Record<Review['status'], StatusVisual> = {
  new: defineStatus('New', 'blue', Eye),
  read: defineStatus('Read', 'gray', Eye),
  responded: defineStatus('Responded', 'green', CheckCircle2),
  flagged: defineStatus('Flagged', 'red', Flag),
  hidden: defineStatus('Hidden', 'gray', EyeOff),
};

const SENTIMENT_VISUALS: Record<NonNullable<Review['sentiment']>, StatusVisual> = {
  positive: defineStatus('Positive', 'green', ThumbsUp),
  neutral: defineStatus('Neutral', 'gray', Clock3),
  negative: defineStatus('Negative', 'red', ThumbsDown),
};

const WIDGET_AVAILABILITY_VISUALS = {
  available: defineStatus('Available', 'blue', CheckCircle2),
  unavailable: defineStatus('Unavailable', 'orange', Pause),
} as const;

const PLATFORM_CONNECTION_VISUALS = {
  connected: defineStatus('Connected', 'blue', CheckCircle2),
  disconnected: defineStatus('Disconnected', 'gray', Pause),
} as const;

export const REPUTATION_PLATFORM_LABELS = {
  google: 'Google',
  facebook: 'Facebook',
  yelp: 'Yelp',
  trustpilot: 'Trustpilot',
  g2: 'G2',
  capterra: 'Capterra',
  custom: 'Custom',
} as const;

export type ReputationPlatformKey = keyof typeof REPUTATION_PLATFORM_LABELS;

export function getReviewRequestStatusVisual(status: string): StatusVisual {
  return REQUEST_STATUS_VISUALS[status as ReviewRequest['status']] ?? getUnknownStatusVisual(status);
}

export function getReviewStatusVisual(status: string): StatusVisual {
  return REVIEW_STATUS_VISUALS[status as Review['status']] ?? getUnknownStatusVisual(status);
}

export function getReviewSentimentVisual(sentiment?: string | null): StatusVisual {
  return SENTIMENT_VISUALS[sentiment as NonNullable<Review['sentiment']>] ?? SENTIMENT_VISUALS.neutral;
}

export function getReviewWidgetAvailabilityVisual(isActive: boolean): StatusVisual {
  return WIDGET_AVAILABILITY_VISUALS[isActive ? 'available' : 'unavailable'];
}

export function getReviewPlatformConnectionVisual(isConnected: boolean): StatusVisual {
  return PLATFORM_CONNECTION_VISUALS[isConnected ? 'connected' : 'disconnected'];
}

export function getReputationPlatformLabel(platform?: string | null): string {
  if (!platform) return 'Itemize';
  return REPUTATION_PLATFORM_LABELS[platform.toLowerCase() as ReputationPlatformKey]
    ?? platform.replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}
