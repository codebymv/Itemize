import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsRepository } from './public-forms.repository';
import { PublicFormsService } from './public-forms.service';

@Module({
  controllers: [PublicFormsController],
  providers: [PublicFormsService, PublicFormsRepository],
})
export class PublicFormsModule {}
