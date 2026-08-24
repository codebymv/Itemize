/**
 * Faithful port of the retained public chat widget routes
 * (backend/src/routes/chat-widget/public.routes.js). Agent-room
 * notifications and session eviction go through the NestJS realtime
 * host, so the chat flag is only enabled together with
 * REALTIME_HOST_NESTJS_ENABLED in the runtime clients connect to.
 */
import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RealtimeHostService } from '../realtime-host/realtime-host.service';
import { ChatWidgetPublicRepository } from './chat-widget-public.repository';

const serverFailure = (response: Response, message: string): void => {
  response.status(500).json({
    success: false,
    error: { message, code: 'ERROR' },
  });
};

@Controller('api/chat-widget/public')
export class ChatWidgetPublicController {
  private readonly logger = new Logger(ChatWidgetPublicController.name);

  constructor(
    private readonly repository: ChatWidgetPublicRepository,
    private readonly realtimeHost: RealtimeHostService,
  ) {}

  @Get('config/:widgetKey')
  async config(
    @Param('widgetKey') widgetKey: string,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const widget = await this.repository.widgetConfig(widgetKey);
      if (!widget) {
        response.status(404).json({ error: 'Widget not found or inactive' });
        return;
      }

      let isOnline = true;
      if (widget.business_hours) {
        const now = new Date();
        // The retained handler intended lowercase weekday keys; its
        // 'lowercase' locale option was invalid and threw, so any widget
        // with business hours failed closed. Both runtimes now use the
        // valid long-form weekday, lowered.
        const dayOfWeek = now
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toLowerCase();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const todayHours = widget.business_hours[dayOfWeek];
        if (todayHours && todayHours.start && todayHours.end) {
          const [startH, startM] = todayHours.start.split(':').map(Number);
          const [endH, endM] = todayHours.end.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          isOnline = currentTime >= startMinutes && currentTime <= endMinutes;
        } else if (todayHours === null || todayHours?.closed) {
          isOnline = false;
        }
      }

      response.status(200).json({ ...widget, is_online: isOnline });
    } catch (error) {
      this.logger.error(
        `Error fetching widget config: ${(error as Error).message}`,
      );
      serverFailure(response, 'Failed to fetch widget config');
    }
  }

  @Post('session')
  async startSession(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const widgetKey = body?.widget_key;
      if (!widgetKey) {
        response.status(400).json({ error: 'widget_key is required' });
        return;
      }

      const outcome = await this.repository.startSession({
        widgetKey: String(widgetKey),
        visitorName: (body?.visitor_name as string) || null,
        visitorEmail: (body?.visitor_email as string) || null,
        visitorPhone: (body?.visitor_phone as string) || null,
        customData: body?.custom_data,
        currentPageUrl: (body?.current_page_url as string) || null,
        referrerUrl: (body?.referrer_url as string) || null,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });

      if (outcome.status === 'widget_not_found') {
        response.status(404).json({ error: 'Widget not found or inactive' });
        return;
      }
      if (outcome.status === 'validation') {
        response.status(400).json({ error: outcome.message });
        return;
      }

      this.realtimeHost.emitToOrgChat(outcome.organizationId, 'newChatSession', {
        session_id: outcome.data.session_id,
        visitor_name: (body?.visitor_name as string) || undefined,
        visitor_email: (body?.visitor_email as string) || undefined,
        timestamp: new Date().toISOString(),
      });
      response.status(outcome.httpStatus).json(outcome.data);
    } catch (error) {
      this.logger.error(
        `Error starting chat session: ${(error as Error).message}`,
      );
      serverFailure(response, 'Failed to start chat session');
    }
  }

  @Get('messages/:sessionToken')
  async messages(
    @Param('sessionToken') sessionToken: string,
    @Query('after') after: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const messages = await this.repository.sessionMessages(
        sessionToken,
        after,
      );
      if (messages === null) {
        response.status(404).json({ error: 'Session not found' });
        return;
      }
      response.status(200).json(messages);
    } catch (error) {
      this.logger.error(`Error fetching messages: ${(error as Error).message}`);
      serverFailure(response, 'Failed to fetch messages');
    }
  }

  @Post('messages')
  async sendMessage(
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const sessionToken = body?.session_token;
      const content = body?.content;
      if (
        !sessionToken ||
        !content ||
        String(content).trim().length === 0
      ) {
        response
          .status(400)
          .json({ error: 'session_token and content are required' });
        return;
      }

      const outcome = await this.repository.recordVisitorMessage(
        String(sessionToken),
        String(content).trim(),
      );
      if (outcome.status === 'session_not_found') {
        response.status(404).json({ error: 'Session not found or ended' });
        return;
      }

      this.realtimeHost.emitToOrgChat(
        outcome.session.organization_id,
        'newChatMessage',
        {
          session_id: outcome.session.id,
          message: outcome.message,
          timestamp: new Date().toISOString(),
        },
      );
      response.status(201).json(outcome.message);
    } catch (error) {
      this.logger.error(
        `Error sending visitor message: ${(error as Error).message}`,
      );
      serverFailure(response, 'Failed to send message');
    }
  }

  @Post('end-session')
  async endSession(
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const sessionToken = body?.session_token;
      if (!sessionToken) {
        response.status(400).json({ error: 'session_token is required' });
        return;
      }

      const ended = await this.repository.endSession(String(sessionToken));
      if (!ended) {
        response.status(404).json({ error: 'Session not found' });
        return;
      }

      this.realtimeHost.emitToOrgChat(
        ended.organization_id,
        'chatSessionEnded',
        {
          session_id: ended.id,
          timestamp: new Date().toISOString(),
        },
      );
      await this.realtimeHost
        .broadcast()
        ?.endChatSession(String(sessionToken));

      response.status(200).json({ success: true });
    } catch (error) {
      this.logger.error(`Error ending session: ${(error as Error).message}`);
      serverFailure(response, 'Failed to end session');
    }
  }

  @Post('typing')
  async typing(
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const sessionToken = body?.session_token;
      if (!sessionToken) {
        response.status(400).json({ error: 'session_token is required' });
        return;
      }

      const session = await this.repository.activeSession(String(sessionToken));
      if (!session) {
        response.status(404).json({ error: 'Session not found' });
        return;
      }

      this.realtimeHost.emitToOrgChat(session.organization_id, 'visitorTyping', {
        session_id: session.id,
        is_typing: body?.is_typing !== false,
        timestamp: new Date().toISOString(),
      });
      response.status(200).json({ success: true });
    } catch (error) {
      this.logger.error(
        `Error sending typing indicator: ${(error as Error).message}`,
      );
      serverFailure(response, 'Failed to send typing indicator');
    }
  }
}
