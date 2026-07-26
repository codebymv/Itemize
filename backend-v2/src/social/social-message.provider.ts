import { Injectable } from '@nestjs/common';

export type SocialProviderMessage = {
  pageId: string;
  participantId: string;
  accessToken: string;
  text: string;
};

export type SocialProviderResult =
  | { kind: 'accepted'; providerId: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'reconciliation'; message: string };

export const SOCIAL_MESSAGE_PROVIDER = Symbol('SOCIAL_MESSAGE_PROVIDER');

export interface SocialMessageProvider {
  send(message: SocialProviderMessage): Promise<SocialProviderResult>;
}

@Injectable()
export class MetaSocialMessageProvider implements SocialMessageProvider {
  async send(message: SocialProviderMessage): Promise<SocialProviderResult> {
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/v18.0/${encodeURIComponent(message.pageId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: message.participantId },
            message: { text: message.text },
            messaging_type: 'RESPONSE',
            access_token: message.accessToken,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      return {
        kind: 'reconciliation',
        message: 'Meta provider outcome is unknown and requires reconciliation',
      };
    }

    const body = (await response.json().catch(() => ({}))) as {
      message_id?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        return {
          kind: 'reconciliation',
          message: 'Meta provider outcome is unknown and requires reconciliation',
        };
      }
      return {
        kind: 'rejected',
        message:
          body.error?.message ??
          `Meta provider rejected the request (${response.status})`,
      };
    }
    if (!body.message_id) {
      return {
        kind: 'reconciliation',
        message: 'Meta provider outcome is unknown and requires reconciliation',
      };
    }
    return { kind: 'accepted', providerId: body.message_id };
  }
}
