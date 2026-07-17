import { Module } from '@nestjs/common';
import { ContactActivitiesRepository } from './contact-activities.repository';
import { ContactActivitiesService } from './contact-activities.service';
import { ContactContentRepository } from './contact-content.repository';
import { ContactContentService } from './contact-content.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsResolver } from './contacts.resolver';
import { ContactsService } from './contacts.service';

@Module({
  providers: [
    ContactActivitiesRepository,
    ContactActivitiesService,
    ContactContentRepository,
    ContactContentService,
    ContactsRepository,
    ContactsService,
    ContactsResolver,
  ],
  exports: [ContactsService],
})
export class ContactsModule {}
