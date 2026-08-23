import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PublicReputationRepository,
  REVIEW_PLATFORMS,
} from './public-reputation.repository';

const WIDGET_KEY = /^[a-f0-9]{32}$/i;
const REQUEST_TOKEN = /^[a-f0-9]{64}$/i;

const serverFailure = (message: string) =>
  new InternalServerErrorException({
    success: false,
    error: { message, code: 'ERROR' },
  });

@Injectable()
export class PublicReputationService {
  private readonly logger = new Logger(PublicReputationService.name);

  constructor(private readonly repository: PublicReputationRepository) {}

  async getPublicWidget(widgetKey: string) {
    if (!WIDGET_KEY.test(widgetKey)) {
      throw new NotFoundException({ error: 'Widget not found' });
    }
    const data = await this.guard(
      () => this.repository.publicWidget(widgetKey),
      'Error fetching widget data',
      'Failed to fetch widget data',
    );
    if (!data) throw new NotFoundException({ error: 'Widget not found' });
    return {
      config: {
        widget_type: data.widget.widget_type,
        theme: data.widget.theme,
        primary_color: data.widget.primary_color,
        background_color: data.widget.background_color,
        text_color: data.widget.text_color,
        border_radius: data.widget.border_radius,
        show_rating_stars: data.widget.show_rating_stars,
        show_reviewer_photo: data.widget.show_reviewer_photo,
        show_review_date: data.widget.show_review_date,
        show_platform_icon: data.widget.show_platform_icon,
      },
      reviews: data.reviews,
    };
  }

  async getPublicReviewRequest(token: string) {
    if (!REQUEST_TOKEN.test(token)) {
      throw new NotFoundException({
        error: 'Review request not found or expired',
      });
    }
    const request = await this.guard(
      () => this.repository.openReviewRequest(token),
      'Error fetching review request',
      'Failed to fetch review request',
    );
    if (!request) {
      throw new NotFoundException({
        error: 'Review request not found or expired',
      });
    }
    return {
      organization_name: request.organization_name,
      contact_name: request.contact_name,
      preferred_platform: request.preferred_platform,
    };
  }

  async submitPublicReview(
    token: string,
    body: { rating?: unknown; review_text?: unknown; platform?: unknown },
  ) {
    const numericRating = Number(body.rating);
    const normalizedText =
      typeof body.review_text === 'string' ? body.review_text.trim() : '';
    const normalizedPlatform =
      typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';

    if (!REQUEST_TOKEN.test(token)) {
      throw new NotFoundException({ error: 'Review request not found' });
    }
    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      throw new BadRequestException({ error: 'Valid rating (1-5) required' });
    }
    if (normalizedText.length > 5000) {
      throw new BadRequestException({
        error: 'Review text must be 5000 characters or fewer',
      });
    }
    if (normalizedPlatform && !REVIEW_PLATFORMS.has(normalizedPlatform)) {
      throw new BadRequestException({ error: 'Review platform is invalid' });
    }

    const outcome = await this.guard(
      () =>
        this.repository.submitReview(token, {
          rating: numericRating,
          reviewText: normalizedText || null,
          platform: normalizedPlatform || null,
          sentiment: this.sentiment(numericRating),
        }),
      'Error submitting review',
      'Failed to submit review',
    );
    if (outcome.kind === 'not_found') {
      throw new NotFoundException({ error: 'Review request not found' });
    }
    return {
      success: true,
      redirect_url: numericRating >= 4 ? outcome.request.redirect_url : null,
    };
  }

  private sentiment(rating: number): string {
    if (rating >= 4) return 'positive';
    if (rating >= 3) return 'neutral';
    return 'negative';
  }

  private async guard<T>(
    read: () => Promise<T>,
    logMessage: string,
    failureMessage: string,
  ): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`${logMessage}: ${(error as Error).message}`);
      throw serverFailure(failureMessage);
    }
  }
}
