import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { CampaignRecipientFilterInput } from './campaign-recipient.inputs';
import { CampaignRecipient, CampaignRecipientPage } from './campaign-recipient.types';
import { CampaignRecipientRow, CampaignRecipientsRepository } from './campaign-recipients.repository';

const STATUSES = [
  'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced',
  'failed', 'unsubscribed', 'complained',
];

@Injectable()
export class CampaignRecipientsService {
  constructor(private readonly recipients: CampaignRecipientsRepository) {}

  async list(
    organizationId: number,
    campaignId: number,
    filter: CampaignRecipientFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<CampaignRecipientPage> {
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
      throw itemizeGraphqlError('campaignId must be a positive integer', 'BAD_USER_INPUT', {
        field: 'campaignId', reason: 'INVALID_CAMPAIGN_ID',
      });
    }
    if (!Number.isInteger(page.page) || page.page < 1 ||
        !Number.isInteger(page.pageSize) || page.pageSize < 1 || page.pageSize > 100) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page', reason: 'INVALID_PAGE',
      });
    }
    const status = filter.status === undefined || filter.status === 'all'
      ? undefined
      : this.status(filter.status);
    const result = await this.recipients.findPage({
      organizationId, campaignId, ...(status === undefined ? {} : { status }),
      pageSize: page.pageSize, offset: (page.page - 1) * page.pageSize,
    });
    if (result.kind === 'not_found') {
      throw itemizeGraphqlError('Campaign not found', 'NOT_FOUND');
    }
    const total = this.count(result.total, 'campaignRecipients.total');
    return {
      nodes: result.rows.map((row) => this.map(row)),
      pageInfo: pageInfo(page.page, page.pageSize, total),
    };
  }

  private status(value: string): string {
    if (!STATUSES.includes(value)) {
      throw itemizeGraphqlError('status is invalid', 'BAD_USER_INPUT', {
        field: 'status', reason: 'INVALID_CAMPAIGN_RECIPIENT_STATUS',
      });
    }
    return value;
  }

  private count(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
      throw new Error(`Unsafe campaign recipient count at ${field}`);
    }
    return parsed;
  }

  private date(value: Date | null): Date | null {
    return value === null ? null : new Date(value);
  }

  private map(row: CampaignRecipientRow): CampaignRecipient {
    return {
      id: Number(row.id), campaignId: Number(row.campaign_id), contactId: Number(row.contact_id),
      organizationId: Number(row.organization_id), email: row.email, firstName: row.first_name,
      lastName: row.last_name, status: row.status, sentAt: this.date(row.sent_at),
      deliveredAt: this.date(row.delivered_at), openedAt: this.date(row.opened_at),
      clickedAt: this.date(row.clicked_at), bouncedAt: this.date(row.bounced_at),
      unsubscribedAt: this.date(row.unsubscribed_at),
      openCount: this.count(row.open_count, 'campaignRecipient.openCount'),
      clickCount: this.count(row.click_count, 'campaignRecipient.clickCount'),
      clickedLinks: Array.isArray(row.clicked_links) ? row.clicked_links : [],
      errorMessage: row.error_message, bounceType: row.bounce_type,
      emailLogId: row.email_log_id === null ? null : Number(row.email_log_id),
      externalMessageId: row.external_message_id, abVariant: row.ab_variant,
      createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
      contactFirstName: row.contact_first_name, contactLastName: row.contact_last_name,
    };
  }
}
