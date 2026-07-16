import { Module } from '@nestjs/common';
import { ContactsRepository } from './contacts.repository';
import { ContactsResolver } from './contacts.resolver';
import { ContactsService } from './contacts.service';

@Module({
  providers: [ContactsRepository, ContactsService, ContactsResolver],
  exports: [ContactsService],
})
export class ContactsModule {}
