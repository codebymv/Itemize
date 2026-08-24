import { Module } from '@nestjs/common';
import { SmsTemplatesRepository } from './sms-templates.repository';
import { SmsTemplatesResolver } from './sms-templates.resolver';
import { SmsTemplatesService } from './sms-templates.service';

@Module({ providers: [SmsTemplatesRepository, SmsTemplatesService, SmsTemplatesResolver] })
export class SmsTemplatesModule {}
