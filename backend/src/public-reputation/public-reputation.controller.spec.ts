import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicReputationController } from './public-reputation.controller';
import { PublicReputationRepository } from './public-reputation.repository';
import { PublicReputationService } from './public-reputation.service';

const WIDGET_KEY = 'ab'.repeat(16);
const REQUEST_TOKEN = 'cd'.repeat(32);

describe('PublicReputationController retained HTTP contract', () => {
  let app: INestApplication;
  const repository = {
    publicWidget: jest.fn(),
    openReviewRequest: jest.fn(),
    submitReview: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicReputationController],
      providers: [
        PublicReputationService,
        { provide: PublicReputationRepository, useValue: repository },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves widget config and reviews with a no-store header', async () => {
    repository.publicWidget.mockResolvedValue({
      widget: {
        organization_id: 3,
        widget_type: 'carousel',
        theme: 'light',
        primary_color: '#336699',
        background_color: '#ffffff',
        text_color: '#111111',
        border_radius: 8,
        show_rating_stars: true,
        show_reviewer_photo: false,
        show_review_date: true,
        show_platform_icon: true,
        min_rating: 4,
        platforms: ['google'],
        max_reviews: 10,
        hide_no_text_reviews: false,
      },
      reviews: [
        {
          rating: 5,
          review_text: 'Great',
          reviewer_name: 'Sam',
          reviewer_avatar_url: null,
          platform: 'google',
          review_date: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });
    const response = await request(app.getHttpServer())
      .get(`/api/reputation/public/widget/${WIDGET_KEY}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.config).toEqual({
      widget_type: 'carousel',
      theme: 'light',
      primary_color: '#336699',
      background_color: '#ffffff',
      text_color: '#111111',
      border_radius: 8,
      show_rating_stars: true,
      show_reviewer_photo: false,
      show_review_date: true,
      show_platform_icon: true,
    });
    expect(response.body.reviews).toHaveLength(1);
    expect(response.body).not.toHaveProperty('config.min_rating');
  });

  it('rejects malformed widget keys without touching the database', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/reputation/public/widget/not-a-key')
      .expect(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ error: 'Widget not found' });
    expect(repository.publicWidget).not.toHaveBeenCalled();
  });

  it('serves the review request projection and conceals internals', async () => {
    repository.openReviewRequest.mockResolvedValue({
      id: 9,
      organization_id: 3,
      contact_id: 12,
      contact_email: 'private@example.com',
      contact_phone: '+15551234567',
      contact_name: 'Sam',
      preferred_platform: 'google',
      redirect_url: 'https://reviews.example.com',
      organization_name: 'Acme',
    });
    const response = await request(app.getHttpServer())
      .get(`/api/reputation/public/review/${REQUEST_TOKEN}`)
      .expect(200);
    expect(response.body).toEqual({
      organization_name: 'Acme',
      contact_name: 'Sam',
      preferred_platform: 'google',
    });
    expect(JSON.stringify(response.body)).not.toContain('private@example.com');
  });

  it('shares one miss for malformed, unknown, and expired review tokens', async () => {
    repository.openReviewRequest.mockResolvedValue(null);
    for (const token of ['not-a-token', REQUEST_TOKEN]) {
      const response = await request(app.getHttpServer())
        .get(`/api/reputation/public/review/${token}`)
        .expect(404);
      expect(response.body).toEqual({
        error: 'Review request not found or expired',
      });
    }
    expect(repository.openReviewRequest).toHaveBeenCalledTimes(1);
  });

  it('validates review submissions before writing', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ rating: 0 }, 'Valid rating (1-5) required'],
      [{ rating: 'six' }, 'Valid rating (1-5) required'],
      [{ rating: 5, review_text: 'x'.repeat(5001) }, 'Review text must be 5000 characters or fewer'],
      [{ rating: 5, platform: 'myspace' }, 'Review platform is invalid'],
    ];
    for (const [body, message] of cases) {
      const response = await request(app.getHttpServer())
        .post(`/api/reputation/public/review/${REQUEST_TOKEN}`)
        .send(body)
        .expect(400);
      expect(response.body).toEqual({ error: message });
    }
    expect(repository.submitReview).not.toHaveBeenCalled();
  });

  it('submits a review with derived sentiment and rating-gated redirect', async () => {
    repository.submitReview.mockResolvedValue({
      kind: 'submitted',
      replayed: false,
      request: { redirect_url: 'https://reviews.example.com' },
    });
    const positive = await request(app.getHttpServer())
      .post(`/api/reputation/public/review/${REQUEST_TOKEN}`)
      .send({ rating: 5, review_text: '  Great service  ', platform: 'Google' })
      .expect(200);
    expect(positive.body).toEqual({
      success: true,
      redirect_url: 'https://reviews.example.com',
    });
    expect(repository.submitReview).toHaveBeenCalledWith(REQUEST_TOKEN, {
      rating: 5,
      reviewText: 'Great service',
      platform: 'google',
      sentiment: 'positive',
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const negative = await request(app.getHttpServer())
      .post(`/api/reputation/public/review/${REQUEST_TOKEN}`)
      .send({ rating: 2 })
      .expect(200);
    expect(negative.body).toEqual({ success: true, redirect_url: null });
    expect(repository.submitReview).toHaveBeenLastCalledWith(REQUEST_TOKEN, {
      rating: 2,
      reviewText: null,
      platform: null,
      sentiment: 'negative',
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('distinguishes a changed response after completion from an unavailable request', async () => {
    repository.submitReview.mockResolvedValue({ kind: 'conflict' });
    const response = await request(app.getHttpServer())
      .post(`/api/reputation/public/review/${REQUEST_TOKEN}`)
      .send({ rating: 4 })
      .expect(409);
    expect(response.body).toEqual({
      error: 'This review request has already been completed',
      code: 'CONFLICT',
      reason: 'REVIEW_RESPONSE_FINALIZED',
    });
  });

  it('conceals a consumed or expired request on submission', async () => {
    repository.submitReview.mockResolvedValue({ kind: 'not_found' });
    const response = await request(app.getHttpServer())
      .post(`/api/reputation/public/review/${REQUEST_TOKEN}`)
      .send({ rating: 4 })
      .expect(404);
    expect(response.body).toEqual({ error: 'Review request not found' });
  });

  it('maps read and write failures to the retained 500 envelope', async () => {
    repository.publicWidget.mockRejectedValue(new Error('boom'));
    const widget = await request(app.getHttpServer())
      .get(`/api/reputation/public/widget/${WIDGET_KEY}`)
      .expect(500);
    expect(widget.body).toEqual({
      success: false,
      error: { message: 'Failed to fetch widget data', code: 'ERROR' },
    });

    repository.submitReview.mockRejectedValue(new Error('boom'));
    const submit = await request(app.getHttpServer())
      .post(`/api/reputation/public/review/${REQUEST_TOKEN}`)
      .send({ rating: 4 })
      .expect(500);
    expect(submit.body).toEqual({
      success: false,
      error: { message: 'Failed to submit review', code: 'ERROR' },
    });
  });
});
