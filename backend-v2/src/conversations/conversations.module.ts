import { Module } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsResolver } from './conversations.resolver';
import { ConversationsService } from './conversations.service';

@Module({
  providers: [
    ConversationsRepository,
    ConversationsResolver,
    ConversationsService,
  ],
})
export class ConversationsModule {}
