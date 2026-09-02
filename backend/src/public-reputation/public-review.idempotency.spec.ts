import { publicReviewSubmissionFingerprint } from './public-review.idempotency';

describe('public review submission fingerprint', () => {
  it('is stable for an unchanged normalized submission', () => {
    const submission = {
      rating: 5,
      reviewText: 'Wonderful',
      platform: 'google',
      sentiment: 'positive',
    };
    expect(publicReviewSubmissionFingerprint(submission))
      .toBe(publicReviewSubmissionFingerprint({ ...submission }));
  });

  it('changes with each user-authored response field', () => {
    const submission = {
      rating: 5,
      reviewText: 'Wonderful',
      platform: 'google',
      sentiment: 'positive',
    };
    const original = publicReviewSubmissionFingerprint(submission);
    expect(publicReviewSubmissionFingerprint({ ...submission, rating: 4 }))
      .not.toBe(original);
    expect(publicReviewSubmissionFingerprint({ ...submission, reviewText: 'Good' }))
      .not.toBe(original);
    expect(publicReviewSubmissionFingerprint({ ...submission, platform: null }))
      .not.toBe(original);
  });
});
