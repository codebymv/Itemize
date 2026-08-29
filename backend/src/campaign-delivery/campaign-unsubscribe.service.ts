import { Injectable } from '@nestjs/common';
import { CampaignUnsubscribeRepository } from './campaign-unsubscribe.repository';
import {
  campaignUnsubscribeRecipientId,
  campaignUnsubscribeTokenMatches,
} from './campaign-unsubscribe.token';

export type CampaignUnsubscribeResult = 'invalid' | 'ready' | 'unsubscribed';

@Injectable()
export class CampaignUnsubscribeService {
  constructor(private readonly recipients: CampaignUnsubscribeRepository) {}

  async inspect(token: string): Promise<CampaignUnsubscribeResult> {
    const recipient = await this.authenticatedRecipient(token);
    if (!recipient) return 'invalid';
    return recipient.alreadyUnsubscribed ? 'unsubscribed' : 'ready';
  }

  async unsubscribe(token: string): Promise<CampaignUnsubscribeResult> {
    const recipient = await this.authenticatedRecipient(token);
    if (!recipient) return 'invalid';
    const updated = await this.recipients.unsubscribe(recipient);
    return updated ? 'unsubscribed' : 'invalid';
  }

  private async authenticatedRecipient(token: string) {
    const recipientId = campaignUnsubscribeRecipientId(String(token || ''));
    if (!recipientId) return null;
    const recipient = await this.recipients.find(recipientId);
    if (!recipient || !campaignUnsubscribeTokenMatches(token, recipient)) return null;
    return recipient;
  }
}
