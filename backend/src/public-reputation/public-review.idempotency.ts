import { createHash } from 'node:crypto';

export type PublicReviewSubmission = {
  rating: number;
  reviewText: string | null;
  platform: string | null;
  sentiment: string;
};

export const publicReviewSubmissionFingerprint = (
  submission: PublicReviewSubmission,
): string => createHash('sha256')
  .update(JSON.stringify({
    platform: submission.platform,
    rating: submission.rating,
    reviewText: submission.reviewText,
  }))
  .digest('hex');
