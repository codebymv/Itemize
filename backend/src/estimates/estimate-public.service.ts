import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivationService } from '../activation/activation.service';
import {
  EstimatePublicRepository,
  PublicEstimateCapability,
  PublicEstimateTransition,
} from './estimate-public.repository';
import { estimatePublicTokenHash } from './estimate-public.token';

@Injectable()
export class EstimatePublicService {
  constructor(
    private readonly estimates: EstimatePublicRepository,
    private readonly activation: ActivationService,
  ) {}

  async open(token: string) {
    const capability = await this.estimates.open(this.tokenHash(token));
    if (!capability) throw this.notFound();
    await this.activation.recordArtifactAdvanced({
      organizationId: capability.organization_id,
      artifactType: 'estimate',
      artifactId: capability.estimate_id,
      stage: 'viewed',
      source: 'estimate_recipient_viewed',
    });
    return this.present(capability);
  }

  async accept(token: string) {
    const capability = this.transition(
      await this.estimates.accept(this.tokenHash(token)),
      'accepted',
    );
    await this.activation.recordArtifactAdvanced({
      organizationId: capability.organization_id,
      artifactType: 'estimate',
      artifactId: capability.estimate_id,
      stage: 'accepted',
      source: 'estimate_recipient_accepted',
    });
    return this.present(capability);
  }

  async decline(token: string) {
    const capability = this.transition(
      await this.estimates.decline(this.tokenHash(token)),
      'declined',
    );
    return this.present(capability);
  }

  private transition(
    result: PublicEstimateTransition,
    target: 'accepted' | 'declined',
  ): PublicEstimateCapability {
    if (result.kind === 'not-found') throw this.notFound();
    if (result.kind === 'conflict') {
      throw new ConflictException({
        success: false,
        error: {
          message: `Estimate has already been ${result.status}`,
          code: 'CONFLICT',
          reason: 'ESTIMATE_RESPONSE_FINALIZED',
          status: result.status,
        },
      });
    }
    if (result.capability.status !== target) {
      throw new Error('Estimate transition returned an unexpected state');
    }
    return result.capability;
  }

  private present(capability: PublicEstimateCapability) {
    const payload = capability.payload;
    const capturedBusinessName = payload.businessName?.trim();
    const businessName = capturedBusinessName && capturedBusinessName !== 'Our Company'
      ? capturedBusinessName
      : capability.organization_name?.trim() || 'Itemize workspace';
    return {
      estimate: {
        number: capability.estimate_number,
        status: capability.status,
        issue_date: payload.issueDate,
        valid_until: payload.validUntil,
        currency: payload.currency || 'USD',
        subtotal: payload.subtotal,
        tax_amount: payload.taxAmount,
        discount_amount: payload.discountAmount,
        total: payload.total,
        notes: payload.notes ?? null,
        terms_and_conditions: payload.termsAndConditions ?? null,
        sent_at: capability.sent_at,
        viewed_at: capability.viewed_at,
        accepted_at: capability.accepted_at,
        declined_at: capability.declined_at,
      },
      customer: { name: payload.customerName ?? null },
      business: {
        name: businessName,
        email: payload.businessEmail ?? null,
      },
      items: (payload.items ?? []).map((item) => ({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        total: item.total,
      })),
    };
  }

  private tokenHash(token: string): string {
    const hash = estimatePublicTokenHash(token);
    if (!hash) throw this.notFound();
    return hash;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: {
        message: 'Estimate link is invalid or expired',
        code: 'NOT_FOUND',
      },
    });
  }
}
