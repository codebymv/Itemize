import { Module } from '@nestjs/common';
import { GetStartedModule } from '../get-started/get-started.module';
import { ContactActivitiesRepository } from './contact-activities.repository';
import { ContactActivitiesService } from './contact-activities.service';
import { ContactContentRepository } from './contact-content.repository';
import { ContactContentService } from './contact-content.service';
import { ContactProfileRepository } from './contact-profile.repository';
import { ContactProfileService } from './contact-profile.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsResolver } from './contacts.resolver';
import { ContactsService } from './contacts.service';

@Module({
  imports: [GetStartedModule],
  providers: [
    ContactActivitiesRepository,
    ContactActivitiesService,
    ContactContentRepository,
    ContactContentService,
    ContactProfileRepository,
    ContactProfileService,
    ContactsRepository,
    ContactsService,
    ContactsResolver,
  ],
  exports: [ContactsService],
})
export class ContactsModule {}
